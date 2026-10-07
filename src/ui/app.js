/**
 * Tela de lançamento e navegação: liga o HTML (index.html) às regras do app.
 *
 * O app tem duas vistas, trocadas pelo endereço:
 * - #lancar (padrão): lançar gasto com o veredito ao vivo (este arquivo);
 * - #configurar: dinheiro do mês, contas fixas, categorias, pagamentos e
 *   backup (a parte da configuração fica em ./configurar.js).
 * No primeiro acesso (nada gravado no aparelho), aparece antes a vista de
 * boas-vindas, com a escolha entre começar do zero e ver o exemplo.
 *
 * Este arquivo só cuida da TELA: lê o que a pessoa digitou ou escolheu,
 * pede o resultado ao painel (src/painel.js) e copia os textos e
 * posições para o HTML. Nenhuma conta de dinheiro é feita aqui.
 *
 * Os dados ficam gravados no próprio aparelho (IndexedDB, em ./banco.js):
 * fechar e abrir a página mantém os lançamentos. Eles guardam vários meses
 * (src/meses.js); a tela mostra sempre o mês de hoje. Enquanto a
 * Os dados podem ser de verdade ou o EXEMPLO fictício (src/inicio.js).
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { marcasDaEscala } from '../mostrador.js';
import { criarDadosDeExemplo } from '../dados-exemplo.js';
import { calcularPainel, tituloDoMes } from '../painel.js';
import { buscarMes, dadosDoMes, virarMes } from '../meses.js';
import { categoriasAtivas } from '../configuracao.js';
import { criarDadosIniciais, ehExemplo } from '../inicio.js';
import { empacotar, desempacotar } from '../persistencia.js';
import { nomeDoArquivoBackup, gerarBackup, lerBackup } from '../backup.js';
import { lerPacote, gravarPacote, pedirArmazenamentoPersistente } from './banco.js';
import { entregarArquivo } from './arquivos.js';
import { iniciarConfigurar } from './configurar.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ */
/* Elementos da página                                                */
/* ------------------------------------------------------------------ */

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) {
    throw new Error(`Elemento #${id} não encontrado no index.html.`);
  }
  return encontrado;
}

const el = {
  tela: elemento('tela'),
  tituloMes: elemento('titulo-mes'),
  diaTexto: elemento('dia-texto'),
  linhaSaldo: elemento('linha-saldo'),
  arcoUso: elemento('arco-uso'),
  marcas: elemento('marcas'),
  marcadorHoje: elemento('marcador-hoje'),
  ponteiro: elemento('ponteiro'),
  numero: elemento('numero'),
  legenda: elemento('legenda'),
  usadoTexto: elemento('usado-texto'),
  hojeTexto: elemento('hoje-texto'),
  frase: elemento('frase'),
  formulario: elemento('formulario'),
  valor: elemento('valor'),
  chipsCategoria: elemento('chips-categoria'),
  chipsPagamento: elemento('chips-pagamento'),
  botaoLancar: elemento('botao-lancar'),
  rodapeTexto: elemento('rodape-texto'),
  botaoRestaurar: elemento('botao-restaurar'),
  telaConfigurar: elemento('tela-configurar'),
  configMensagem: elemento('config-mensagem'),
  abaLancar: elemento('aba-lancar'),
  abaConfigurar: elemento('aba-configurar'),
  pontoConfigurar: elemento('ponto-configurar'),
  telaBoasVindas: elemento('tela-boas-vindas'),
  botaoComecarZero: elemento('botao-comecar-zero'),
  botaoVerExemplo: elemento('botao-ver-exemplo'),
  botaoBoasVindasBackup: elemento('botao-boas-vindas-backup'),
  faixaExemplo: elemento('faixa-exemplo'),
  botaoZerar: elemento('botao-zerar'),
  abas: elemento('abas'),
  botaoExportar: elemento('botao-exportar'),
  botaoImportar: elemento('botao-importar'),
  arquivoBackup: elemento('arquivo-backup'),
};

/** Tamanho máximo aceito para um arquivo de backup (5 MB). */
const TAMANHO_MAXIMO_BACKUP = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Estado da tela                                                     */
/* ------------------------------------------------------------------ */

/** Os dados em uso. São carregados do aparelho no início (veja "Início"). */
let dados = null;

/**
 * Fica false quando o armazenamento não pode ser usado (navegador sem
 * IndexedDB, modo anônimo restrito ou dados gravados ilegíveis). Aí o app
 * funciona só na memória e NÃO grava nada por cima do que existe.
 */
let gravacaoDisponivel = true;

/* ------------------------------------------------------------------ */
/* Gravação no aparelho                                               */
/* ------------------------------------------------------------------ */

/**
 * Garante que o mês de hoje existe nos dados (virada de mês).
 *
 * Se o mês ainda não existe, ele é criado com o saldo inicial SUGERIDO
 * (o que sobrou do mês anterior). A confirmação desse saldo chega com a
 * tela de configuração.
 *
 * @param {object} dadosAtuais
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ dados: object, mudou: boolean, aviso: string } | null}
 *   null quando não há mês anterior a hoje nos dados (por exemplo, se a
 *   data do aparelho voltou no tempo). Nesse caso nada é alterado.
 */
function prepararMesAtual(dadosAtuais, hoje) {
  const mesAtual = mesDaData(hoje);
  try {
    const { estado, criado, mesBase } = virarMes(dadosAtuais, mesAtual);
    if (!criado) return { dados: dadosAtuais, mudou: false, aviso: '' };
    return {
      dados: estado,
      mudou: true,
      aviso:
        `${tituloDoMes(mesAtual)} começou com ${formatarCentavos(criado.saldoInicialCentavos)}, ` +
        `o que sobrou de ${tituloDoMes(mesBase).toLowerCase()}. ` +
        'Confira e confirme o saldo em Configurar.',
    };
  } catch (erro) {
    if (!(erro instanceof ErroValidacao)) throw erro;
    return null;
  }
}

/**
 * Carrega os dados do aparelho.
 *
 * - Primeiro acesso (nada gravado): devolve dados null; a tela mostra as
 *   boas-vindas e a pessoa escolhe entre começar do zero e ver o exemplo.
 * - Mês virou: cria o mês novo com o saldo sugerido e grava.
 * - Dados gravados ilegíveis: usa o exemplo só na memória e não grava
 *   nada, para não apagar o que está lá.
 *
 * @returns {Promise<{ dados: object|null, aviso: string }>}
 */
async function carregarDados() {
  const hoje = hojeLocal();

  let pacote;
  try {
    pacote = await lerPacote();
  } catch (erro) {
    console.error(erro);
    gravacaoDisponivel = false;
    return {
      dados: criarDadosDeExemplo(hoje),
      aviso: 'Este navegador não permitiu gravar dados: os lançamentos ficam só nesta sessão.',
    };
  }

  if (pacote === undefined) {
    return { dados: null, aviso: '' };
  }

  let salvos;
  try {
    salvos = desempacotar(pacote);
  } catch (erro) {
    if (!(erro instanceof ErroValidacao)) throw erro;
    console.error(erro);
    gravacaoDisponivel = false;
    return {
      dados: criarDadosDeExemplo(hoje),
      aviso: `${erro.message} Nada foi apagado; nesta sessão os lançamentos não serão gravados.`,
    };
  }

  const virada = prepararMesAtual(salvos, hoje);
  if (virada === null) {
    gravacaoDisponivel = false;
    return {
      dados: criarDadosDeExemplo(hoje),
      aviso:
        'A data do aparelho é anterior aos meses gravados. Confira a data e a hora do aparelho. ' +
        'Nada foi apagado; nesta sessão os lançamentos não serão gravados.',
    };
  }
  if (virada.mudou) {
    const gravou = await gravar(virada.dados);
    return { dados: virada.dados, aviso: gravou ? virada.aviso : avisoSemGravacao() };
  }

  return { dados: salvos, aviso: '' };
}

/**
 * Grava os dados no aparelho.
 * @param {object} dadosParaGravar
 * @returns {Promise<boolean>} true se gravou.
 */
async function gravar(dadosParaGravar) {
  if (!gravacaoDisponivel) return false;
  try {
    await gravarPacote(empacotar(dadosParaGravar));
    return true;
  } catch (erro) {
    console.error(erro);
    gravacaoDisponivel = false;
    return false;
  }
}

/** Texto mostrado quando uma gravação falha. */
function avisoSemGravacao() {
  return 'Não foi possível gravar no aparelho: os lançamentos ficam só nesta sessão.';
}

/* ------------------------------------------------------------------ */
/* Montagem (feita uma vez, ou ao restaurar o exemplo)                */
/* ------------------------------------------------------------------ */

/**
 * Cria um chip: um botão de rádio de verdade dentro de um <label>.
 * O texto entra com textContent (nunca innerHTML), para que um nome
 * digitado pela pessoa nunca seja interpretado como HTML.
 */
function criarChip(grupo, valor, rotulo, marcado) {
  const label = document.createElement('label');
  label.className = 'chip';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = grupo;
  input.value = valor;
  input.checked = marcado;

  const texto = document.createElement('span');
  texto.textContent = rotulo;

  label.append(input, texto);
  return label;
}

/** Desenha as marcas da escala do mostrador. */
function montarMarcas() {
  for (const marca of marcasDaEscala()) {
    const linha = document.createElementNS(SVG_NS, 'line');
    linha.setAttribute('class', 'marca');
    linha.setAttribute('x1', marca.x1);
    linha.setAttribute('y1', marca.y1);
    linha.setAttribute('x2', marca.x2);
    linha.setAttribute('y2', marca.y2);
    el.marcas.append(linha);
  }
}

/**
 * Cria os chips de categoria e de pagamento a partir dos dados.
 * Mantém a escolha atual quando ela ainda existe; senão, marca a primeira.
 */
function montarChips() {
  const categoriaEscolhida = el.formulario.elements.categoria?.value;
  const pagamentoEscolhido = el.formulario.elements.pagamento?.value;

  const categorias = categoriasAtivas(dados);
  const manterCategoria = categorias.some((c) => c.id === categoriaEscolhida);
  el.chipsCategoria.replaceChildren(
    ...categorias.map((c, i) =>
      criarChip('categoria', c.id, c.nome, manterCategoria ? c.id === categoriaEscolhida : i === 0)),
  );

  const manterPagamento = dados.formasPagamento.includes(pagamentoEscolhido);
  el.chipsPagamento.replaceChildren(
    ...dados.formasPagamento.map((f, i) =>
      criarChip('pagamento', f, f, manterPagamento ? f === pagamentoEscolhido : i === 0)),
  );
}

/** Mostra a faixa "dados de exemplo" na vista de lançamento, só com os dados fictícios. */
function atualizarFaixaExemplo() {
  el.faixaExemplo.hidden = !ehExemplo(dados);
}

/** Mostra o ponto âmbar na aba Configurar quando o saldo do mês espera confirmação. */
function atualizarPonto() {
  const registro = buscarMes(dados, mesDaData(hojeLocal()));
  el.pontoConfigurar.hidden = !registro || registro.saldoConfirmado;
}

/* ------------------------------------------------------------------ */
/* Atualização (a cada tecla e a cada escolha)                        */
/* ------------------------------------------------------------------ */

/** Lê o formulário, calcula o painel e atualiza a tela. Devolve o painel. */
function atualizar() {
  const hoje = hojeLocal();

  // Página aberta na virada do mês (ex.: 23:59 do dia 31): cria o mês novo.
  if (!buscarMes(dados, mesDaData(hoje))) {
    const virada = prepararMesAtual(dados, hoje);
    if (virada?.mudou) {
      dados = virada.dados;
      el.rodapeTexto.textContent = virada.aviso;
      atualizarPonto();
      gravar(dados); // sem esperar: a tela não precisa aguardar a gravação
    }
  }

  const painel = calcularPainel({
    dados: dadosDoMes(dados, mesDaData(hoje)),
    valorTexto: el.valor.value,
    categoriaId: el.formulario.elements.categoria.value,
    formaPagamento: el.formulario.elements.pagamento.value,
    hoje,
  });

  el.tela.dataset.cor = painel.cor;
  el.tituloMes.textContent = painel.tituloMes;
  el.diaTexto.textContent = painel.diaTexto;
  el.linhaSaldo.textContent = painel.linhaSaldo;

  el.arcoUso.setAttribute('stroke-dasharray', painel.mostrador.traco);
  el.ponteiro.style.transform = `rotate(${painel.mostrador.grausPonteiro}deg)`;
  el.marcadorHoje.setAttribute('points', painel.mostrador.triangulo);

  el.numero.textContent = painel.numero;
  el.legenda.textContent = painel.legenda;
  el.usadoTexto.textContent = painel.usadoTexto;
  el.hojeTexto.textContent = painel.hojeTexto;
  el.frase.textContent = painel.frase;

  el.botaoLancar.disabled = painel.lancamento === null;
  return painel;
}

/* ------------------------------------------------------------------ */
/* Eventos                                                            */
/* ------------------------------------------------------------------ */

// O evento "input" sobe do campo de valor e dos chips: qualquer mudança atualiza a tela.
el.formulario.addEventListener('input', () => {
  el.rodapeTexto.textContent = '';
  atualizar();
});

// Lançar: guarda o gasto, grava no aparelho e limpa o valor.
el.formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault(); // impede o navegador de recarregar a página

  const painel = atualizar();
  if (painel.lancamento === null) return;

  dados = { ...dados, lancamentos: [...dados.lancamentos, painel.lancamento] };

  const categoria = dados.categorias.find((c) => c.id === painel.lancamento.categoriaId);
  el.valor.value = '';
  atualizar();
  el.valor.focus();

  const gravou = await gravar(dados);
  el.rodapeTexto.textContent = gravou
    ? `Lançado: ${formatarCentavos(painel.lancamento.valorCentavos)} em ${categoria.nome}.`
    : avisoSemGravacao();
});

el.botaoRestaurar.addEventListener('click', async () => {
  if (!ehExemplo(dados)) {
    const confirmou = window.confirm(
      'Trocar os seus dados pelos dados de exemplo?\n\n' +
        'Tudo o que está neste aparelho será substituído. Se quiser guardar, exporte um backup antes.',
    );
    if (!confirmou) return;
  }
  trocarDados(criarDadosDeExemplo(hojeLocal()));
  const gravou = await gravar(dados);
  avisar(gravou ? 'Exemplo restaurado.' : avisoSemGravacao());
});

el.botaoZerar.addEventListener('click', async () => {
  const pergunta = ehExemplo(dados)
    ? 'Apagar os dados de exemplo e começar do zero?'
    : 'Apagar TODOS os dados deste aparelho e começar do zero?\n\n' +
      'Se quiser guardar os dados atuais, cancele e exporte um backup antes.';
  if (!window.confirm(pergunta)) return;

  trocarDados(criarDadosIniciais(hojeLocal()));
  const gravou = await gravar(dados);
  avisar(gravou ? 'Pronto: comece informando o saldo da conta em "Dinheiro do mês".' : avisoSemGravacao());
});

/* ------------------------------------------------------------------ */
/* Backup                                                             */
/* ------------------------------------------------------------------ */

el.botaoExportar.addEventListener('click', async () => {
  const nome = nomeDoArquivoBackup();
  try {
    const resultado = await entregarArquivo(nome, gerarBackup(dados));
    avisar(resultado === 'cancelado'
      ? 'Exportação cancelada.'
      : `Backup exportado: ${nome}`);
  } catch (erro) {
    console.error(erro);
    avisar('Não foi possível exportar o backup.');
  }
});

// O botão só abre a escolha de arquivo; a leitura acontece no "change" abaixo.
el.botaoImportar.addEventListener('click', () => {
  el.arquivoBackup.value = ''; // permite escolher o mesmo arquivo duas vezes seguidas
  el.arquivoBackup.click();
});

el.arquivoBackup.addEventListener('change', async () => {
  const arquivo = el.arquivoBackup.files[0];
  if (!arquivo) return; // a pessoa fechou a janela sem escolher

  if (arquivo.size > TAMANHO_MAXIMO_BACKUP) {
    avisar('Arquivo grande demais para ser um backup do app.');
    return;
  }

  let lido;
  try {
    lido = lerBackup(await arquivo.text());
  } catch (erro) {
    if (!(erro instanceof ErroValidacao)) throw erro;
    avisar(erro.message);
    return;
  }

  // O backup pode ser de um mês anterior: o mês de hoje é criado na hora.
  const virada = prepararMesAtual(lido.dados, hojeLocal());
  if (virada === null) {
    avisar('Este backup só tem meses posteriores a hoje. Confira a data do aparelho.');
    return;
  }

  const salvoEm = new Date(lido.resumo.salvoEm).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  // No primeiro acesso não há o que substituir, então a pergunta muda.
  const confirmou = window.confirm(
    `Importar o backup de ${salvoEm}, com ${lido.resumo.lancamentos} lançamento(s)?` +
      (dados === null ? '' : '\n\nOs dados atuais deste aparelho serão substituídos.'),
  );
  if (!confirmou) {
    avisar('Importação cancelada.');
    return;
  }

  trocarDados(virada.dados);
  mostrarVista(); // sai das boas-vindas, se o backup foi importado no primeiro acesso

  // A pessoa confirmou a troca: grava mesmo se os dados antigos estavam
  // ilegíveis. Importar um backup é justamente o jeito de recuperar o app.
  gravacaoDisponivel = true;
  const gravou = await gravar(dados);
  avisar(gravou
    ? `Backup importado: ${lido.resumo.lancamentos} lançamento(s).`
    : avisoSemGravacao());
});

/* ------------------------------------------------------------------ */
/* Vista Configurar e mensagens                                       */
/* ------------------------------------------------------------------ */

let temporizadorMensagem = null;

/**
 * Mostra uma mensagem da vista Configurar. Ela fica presa acima das abas
 * (para ser vista de qualquer ponto da página) e some depois de 6 segundos.
 *
 * @param {string} texto
 */
function avisar(texto) {
  clearTimeout(temporizadorMensagem);
  el.configMensagem.textContent = texto;
  el.configMensagem.hidden = !texto;
  temporizadorMensagem = setTimeout(() => {
    el.configMensagem.hidden = true;
  }, 6000);
}

const configurar = iniciarConfigurar({
  obterDados: () => dados,
  aplicarMudanca: async (novos, mensagem) => {
    dados = novos;
    montarChips();
    atualizar();
    atualizarPonto();
    atualizarFaixaExemplo();
    const gravou = await gravar(dados);
    avisar(gravou ? mensagem : avisoSemGravacao());
  },
});

/* ------------------------------------------------------------------ */
/* Navegação entre as vistas                                          */
/* ------------------------------------------------------------------ */

/**
 * Mostra a vista indicada no endereço: #configurar ou, para qualquer
 * outro valor, a vista de lançamento. Usar o endereço permite voltar
 * com o botão "voltar" do navegador e abrir direto numa vista.
 */
function mostrarVista() {
  // Primeiro acesso: só as boas-vindas, sem abas, até a pessoa escolher.
  const primeiroAcesso = dados === null;
  el.telaBoasVindas.hidden = !primeiroAcesso;
  el.abas.hidden = primeiroAcesso;
  if (primeiroAcesso) {
    el.tela.hidden = true;
    el.telaConfigurar.hidden = true;
    return;
  }

  const vista = location.hash === '#configurar' ? 'configurar' : 'lancar';

  el.tela.hidden = vista !== 'lancar';
  el.telaConfigurar.hidden = vista !== 'configurar';
  el.configMensagem.hidden = true;

  // aria-current marca a aba ativa (para o estilo e para leitores de tela).
  el.abaLancar.toggleAttribute('aria-current', vista === 'lancar');
  el.abaConfigurar.toggleAttribute('aria-current', vista === 'configurar');
  if (vista === 'lancar') el.abaLancar.setAttribute('aria-current', 'page');
  if (vista === 'configurar') el.abaConfigurar.setAttribute('aria-current', 'page');

  if (vista === 'configurar') configurar.renderizar();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', mostrarVista);

/* ------------------------------------------------------------------ */
/* Início                                                             */
/* ------------------------------------------------------------------ */

/**
 * Troca todos os dados de uma vez (exemplo, começar do zero, backup) e
 * redesenha as duas vistas. Não grava: quem chama decide quando gravar.
 *
 * @param {object} novos
 */
function trocarDados(novos) {
  dados = novos;
  el.valor.value = '';
  montarChips();
  atualizar();
  atualizarPonto();
  atualizarFaixaExemplo();
  configurar.renderizar();
}

// Boas-vindas: "Começar do zero" leva direto para Configurar.
el.botaoComecarZero.addEventListener('click', async () => {
  trocarDados(criarDadosIniciais(hojeLocal()));
  location.hash = '#configurar';
  mostrarVista();
  const gravou = await gravar(dados);
  avisar(gravou ? 'Comece informando o saldo da conta em "Dinheiro do mês".' : avisoSemGravacao());
});

// Aparelho novo com backup de outro: importa sem passar pelo exemplo.
el.botaoBoasVindasBackup.addEventListener('click', () => {
  el.arquivoBackup.value = '';
  el.arquivoBackup.click();
});

el.botaoVerExemplo.addEventListener('click', async () => {
  trocarDados(criarDadosDeExemplo(hojeLocal()));
  location.hash = '#lancar';
  mostrarVista();
  const gravou = await gravar(dados);
  el.rodapeTexto.textContent = gravou ? '' : avisoSemGravacao();
});

// "await" no nível do módulo: a tela só é montada depois de ler o aparelho.
const carregado = await carregarDados();
montarMarcas();

if (carregado.dados === null) {
  mostrarVista(); // primeiro acesso: boas-vindas
} else {
  dados = carregado.dados;
  montarChips();
  atualizar();
  atualizarPonto();
  atualizarFaixaExemplo();
  mostrarVista();
  el.rodapeTexto.textContent = carregado.aviso;
}

// Sem esperar: o pedido roda em segundo plano e não atrasa a tela.
pedirArmazenamentoPersistente();
