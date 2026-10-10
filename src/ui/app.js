/**
 * Tela de lançamento e navegação: liga o HTML (index.html) às regras do app.
 *
 * O app tem quatro vistas, trocadas pelo endereço:
 * - #lancar (padrão): lançar gasto com o veredito ao vivo (este arquivo);
 * - #mes: o resumo do mês, as categorias e as listas (./mes.js);
 * - #historico: todos os gastos e os totais por semana (./historico.js);
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
import { MAXIMO_PARCELAS_COMPRA } from '../modelo.js';
import { ErroValidacao } from '../erros.js';
import { marcasDaEscala } from '../mostrador.js';
import { criarDadosDeExemplo } from '../dados-exemplo.js';
import { calcularPainel, tituloDoMes } from '../painel.js';
import { buscarMes, dadosDoMes, virarMes } from '../meses.js';
import { categoriasAtivas } from '../configuracao.js';
import { criarDadosIniciais, ehExemplo } from '../inicio.js';
import { registrarBackup, situacaoDoBackup } from '../lembrete-backup.js';
import { empacotar, desempacotar } from '../persistencia.js';
import { nomeDoArquivoBackup, gerarBackup, lerBackup } from '../backup.js';
import {
  lerPacote, gravarPacote, pedirArmazenamentoPersistente, lerConfigIA, gravarConfigIA,
  lerAnaliseMes, gravarAnaliseMes, apagarAnaliseMes,
} from './banco.js';
import { iniciarConfigIA } from './configurar-ia.js';
import { configuracaoVazia } from '../ia.js';
import { mensagemDaCompra } from '../explicacoes.js';
import { blocoExplicar } from './explicar.js';
import { iniciarAnaliseMes } from './analise-mes.js';
import { entregarArquivo } from './arquivos.js';
import { iniciarConfigurar } from './configurar.js';
import { iniciarMes } from './mes.js';
import { iniciarHistorico } from './historico.js';
import { iniciarSimulador } from './simulador.js';

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
  iaLancar: elemento('ia-lancar'),
  formulario: elemento('formulario'),
  valor: elemento('valor'),
  chipsCategoria: elemento('chips-categoria'),
  chipsPagamento: elemento('chips-pagamento'),
  botaoLancar: elemento('botao-lancar'),
  rodapeTexto: elemento('rodape-texto'),
  linhaCartao: elemento('linha-cartao'),
  linkSimular: elemento('link-simular'),
  parcelas: elemento('parcelas'),
  infoCartao: elemento('info-cartao'),
  campoData: elemento('campo-data'),
  dataGasto: elemento('data-gasto'),
  dataTexto: elemento('data-texto'),
  botaoRestaurar: elemento('botao-restaurar'),
  telaConfigurar: elemento('tela-configurar'),
  telaSimular: elemento('tela-simular'),
  configMensagem: elemento('config-mensagem'),
  abaLancar: elemento('aba-lancar'),
  abaConfigurar: elemento('aba-configurar'),
  telaMes: elemento('tela-mes'),
  abaMes: elemento('aba-mes'),
  telaHistorico: elemento('tela-historico'),
  abaHistorico: elemento('aba-historico'),
  pontoConfigurar: elemento('ponto-configurar'),
  telaBoasVindas: elemento('tela-boas-vindas'),
  botaoComecarZero: elemento('botao-comecar-zero'),
  botaoVerExemplo: elemento('botao-ver-exemplo'),
  botaoBoasVindasBackup: elemento('botao-boas-vindas-backup'),
  faixaExemplo: elemento('faixa-exemplo'),
  faixaExemploMes: elemento('faixa-exemplo-mes'),
  botaoZerar: elemento('botao-zerar'),
  backupSituacao: elemento('backup-situacao'),
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

/** Preenche a escolha de parcelas: 1x (à vista) até 24x. */
function montarParcelas() {
  el.parcelas.replaceChildren(
    ...Array.from({ length: MAXIMO_PARCELAS_COMPRA }, (_, i) => {
      const opcao = document.createElement('option');
      opcao.value = String(i + 1);
      opcao.textContent = i === 0 ? 'À vista' : `${i + 1}x`;
      return opcao;
    }),
  );
}

/** Mostra a faixa "dados de exemplo" no Lançar e no Mês, só com os dados fictícios. */
function atualizarFaixaExemplo() {
  const exemplo = ehExemplo(dados);
  el.faixaExemplo.hidden = !exemplo;
  el.faixaExemploMes.hidden = !exemplo;
}

/**
 * Mostra o ponto âmbar na aba Configurar quando o saldo do mês espera
 * confirmação ou quando o backup está atrasado, e atualiza a linha
 * "Último backup" do cartão Backup.
 */
function atualizarPonto() {
  const registro = buscarMes(dados, mesDaData(hojeLocal()));
  const saldoPendente = registro !== undefined && !registro.saldoConfirmado;
  const backup = situacaoDoBackup(dados);

  // O ponto acende por qualquer um dos dois motivos: saldo a confirmar ou backup atrasado.
  el.pontoConfigurar.hidden = !saldoPendente && !backup.atrasado;

  // Linha do cartão Backup, em Configurar.
  el.backupSituacao.textContent = backup.atrasado
    ? `${backup.texto} Já passou de uma semana: exporte um backup e guarde no iCloud Drive.`
    : backup.texto;
  el.backupSituacao.classList.toggle('atrasado', backup.atrasado);
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

  // Data do gasto: só dias do mês atual até hoje. Sem escolha, vale hoje.
  el.dataGasto.min = `${mesDaData(hoje)}-01`;
  el.dataGasto.max = hoje;
  if (el.dataGasto.value === '') el.dataGasto.value = hoje;

  const painel = calcularPainel({
    dados: dadosDoMes(dados, mesDaData(hoje)),
    valorTexto: el.valor.value,
    categoriaId: el.formulario.elements.categoria.value,
    formaPagamento: el.formulario.elements.pagamento.value,
    hoje,
    data: el.dataGasto.value,
    parcelas: Number(el.parcelas.value) || 1,
  });

  // Compra no cartão: escolha das parcelas, quando a fatura é paga e o limite.
  el.linhaCartao.hidden = !painel.ehCartao;
  el.linkSimular.hidden = !painel.ehCartao;
  const linhaLimite = document.createElement('span');
  let classeLimite = 'linha-limite';
  if (painel.limiteEstourado) classeLimite += ' estourado';
  else if (painel.limiteApertado) classeLimite += ' apertado';
  linhaLimite.className = classeLimite;
  linhaLimite.textContent = painel.limiteTexto;
  el.infoCartao.replaceChildren(painel.cartaoTexto, document.createElement('br'), linhaLimite);

  el.dataTexto.textContent = painel.dataTexto;
  el.campoData.classList.toggle('anterior', painel.dataAnterior);

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

  // IA (Fase 03): "Explicar com IA" aparece com um valor válido e a IA ligada.
  // A cada mudança na tela o bloco é refeito: uma explicação antiga nunca fica na tela.
  const explicar = painel.lancamento === null ? null : blocoExplicar({
    obterConfigIA: () => configIA,
    montarMensagem: () => mensagemDaCompra(painel, { hoje }),
  });
  el.iaLancar.replaceChildren(...(explicar ? [explicar] : []));

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
  const parcelasTexto = painel.lancamento.parcelas > 1 ? ` em ${painel.lancamento.parcelas}x` : '';
  el.valor.value = '';
  el.parcelas.value = '1'; // a próxima compra volta a ser à vista
  atualizar();
  el.valor.focus();

  // A data escolhida continua escolhida: facilita lançar vários gastos
  // esquecidos do mesmo dia. A borda âmbar avisa que não é hoje.
  const doDia = painel.dataAnterior ? `, ${painel.dataTexto.replace('Gasto do dia', 'no dia')}` : '';
  const gravou = await gravar(dados);
  el.rodapeTexto.textContent = gravou
    ? `Lançado: ${formatarCentavos(painel.lancamento.valorCentavos)}${parcelasTexto} em ${categoria.nome}${doDia}.`
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

/**
 * "Usar de verdade" (faixa de exemplo no Lançar e no Mês): apaga o exemplo,
 * começa do zero e leva para Configurar, onde se informa o saldo do mês.
 */
async function usarDeVerdade() {
  const confirmou = window.confirm(
    'Apagar os dados de exemplo e começar a usar de verdade?\n\n' +
      'O app começa vazio: em Configurar, você informa o saldo da conta, a renda, as contas fixas e as categorias.',
  );
  if (!confirmou) return;

  trocarDados(criarDadosIniciais(hojeLocal()));
  location.hash = '#configurar';
  const gravou = await gravar(dados);
  avisar(gravou ? 'Pronto: comece informando o saldo da conta em "Dinheiro do mês".' : avisoSemGravacao());
}
for (const botao of document.querySelectorAll('.botao-usar-de-verdade')) {
  botao.addEventListener('click', usarDeVerdade);
}

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
    // A data do backup vai DENTRO do arquivo: ao importar, o app já sabe
    // quando esse backup foi feito.
    const comData = registrarBackup(dados);
    const resultado = await entregarArquivo(nome, gerarBackup(comData));
    if (resultado === 'cancelado') {
      avisar('Exportação cancelada.');
      return;
    }
    dados = comData;
    atualizarPonto();
    const gravou = await gravar(dados);
    avisar(gravou ? `Backup exportado: ${nome}` : avisoSemGravacao());
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
/* Vistas Mês e Configurar, e mensagens                              */
/* ------------------------------------------------------------------ */

let temporizadorMensagem = null;

/**
 * Mostra uma mensagem das vistas Mês e Configurar. Ela fica presa acima das abas
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

/**
 * Troca os dados por uma versão alterada (vinda das vistas Mês ou
 * Configurar), redesenha a tela de lançamento, grava e avisa.
 */
async function aplicarMudanca(novos, mensagem) {
  dados = novos;
  montarChips();
  atualizar();
  atualizarPonto();
  atualizarFaixaExemplo();
  const gravou = await gravar(dados);
  avisar(gravou ? mensagem : avisoSemGravacao());
}

const configurar = iniciarConfigurar({
  obterDados: () => dados,
  aplicarMudanca,
  // Botão "Simular compra" de cada cartão: abre o simulador com aquele cartão.
  // (O simulador é criado logo abaixo; o clique só acontece depois.)
  abrirSimulador: (formaPagamento) => {
    simulador.preencher({ formaPagamento, origem: '#configurar' });
    location.hash = '#simular';
  },
});
const resumo = iniciarMes({ obterDados: () => dados, aplicarMudanca });
const historico = iniciarHistorico({ obterDados: () => dados });
const simulador = iniciarSimulador({ obterDados: () => dados, obterConfigIA: () => configIA });

/* ------------------------------------------------------------------ */
/* IA (Fase 03): configuração guardada à parte, fora do backup        */
/* ------------------------------------------------------------------ */

/** Configuração da IA deste aparelho (chave, modelo, ligada). */
let configIA = configuracaoVazia();

/**
 * Grava a configuração da IA (null apaga).
 * @param {object|null} config
 * @returns {Promise<boolean>} true se gravou.
 */
async function salvarConfigIA(config) {
  try {
    await gravarConfigIA(config);
    configIA = config ?? configuracaoVazia();
    return true;
  } catch {
    return false;
  }
}

const configuracaoIA = iniciarConfigIA({ obterConfigIA: () => configIA, salvarConfigIA });
/** Última análise do mês (lida do aparelho no início; fora do backup). */
let ultimaAnalise = null;

const analiseMes = iniciarAnaliseMes({
  obterDados: () => dados,
  obterConfigIA: () => configIA,
  obterUltimaAnalise: () => ultimaAnalise,
  // Guardar é um extra: se falhar, a análise continua na tela.
  guardarAnalise: async (analise) => {
    ultimaAnalise = analise;
    try {
      await gravarAnaliseMes(analise);
    } catch {
      // sem gravação: na próxima vez, a pessoa pede de novo
    }
  },
});

// Atalho do Lançar para o simulador: leva o valor digitado e o cartão escolhido.
el.linkSimular.addEventListener('click', () => {
  simulador.preencher({
    formaPagamento: el.formulario.elements.pagamento.value,
    valorTexto: el.valor.value,
    origem: '#lancar',
  });
});

/* ------------------------------------------------------------------ */
/* Navegação entre as vistas                                          */
/* ------------------------------------------------------------------ */

/**
 * Mostra a vista indicada no endereço: #mes, #historico, #configurar
 * ou, para qualquer outro valor, a vista de lançamento. Usar o endereço permite voltar
 * com o botão "voltar" do navegador e abrir direto numa vista.
 */
function mostrarVista() {
  // Primeiro acesso: só as boas-vindas, sem abas, até a pessoa escolher.
  const primeiroAcesso = dados === null;
  el.telaBoasVindas.hidden = !primeiroAcesso;
  el.abas.hidden = primeiroAcesso;
  if (primeiroAcesso) {
    el.tela.hidden = true;
    el.telaMes.hidden = true;
    el.telaHistorico.hidden = true;
    el.telaConfigurar.hidden = true;
    el.telaSimular.hidden = true;
    return;
  }

  const vistas = { '#mes': 'mes', '#historico': 'historico', '#configurar': 'configurar', '#simular': 'simular' };
  const vista = vistas[location.hash] ?? 'lancar';

  el.tela.hidden = vista !== 'lancar';
  el.telaMes.hidden = vista !== 'mes';
  el.telaHistorico.hidden = vista !== 'historico';
  el.telaConfigurar.hidden = vista !== 'configurar';
  el.telaSimular.hidden = vista !== 'simular';
  el.configMensagem.hidden = true;

  // aria-current="page" marca a aba ativa (para o estilo e para leitores de tela).
  const abas = [
    [el.abaLancar, 'lancar'], [el.abaMes, 'mes'], [el.abaHistorico, 'historico'], [el.abaConfigurar, 'configurar'],
  ];
  // O simulador não tem aba própria: ele é aberto pelo Lançar, que fica marcado.
  const abaAtiva = vista === 'simular' ? 'lancar' : vista;
  for (const [aba, nome] of abas) {
    if (nome === abaAtiva) aba.setAttribute('aria-current', 'page');
    else aba.removeAttribute('aria-current');
  }

  if (vista === 'mes') {
    resumo.renderizar();
    analiseMes.renderizar(); // mostra a última análise do mês, com a hora em que foi feita
  }
  if (vista === 'historico') historico.renderizar();
  if (vista === 'configurar') {
    configurar.renderizar();
    configuracaoIA.renderizar();
  }
  if (vista === 'simular') simulador.renderizar();
  // Voltando ao Lançar (ex.: depois de salvar a chave da IA), a tela é refeita.
  if (vista === 'lancar') atualizar();
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
  // A análise da IA guardada era dos dados antigos: deixa de valer.
  ultimaAnalise = null;
  apagarAnaliseMes().catch(() => {});
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
// A configuração da IA é lida à parte; falhar aqui só deixa a IA desligada.
try {
  configIA = { ...configuracaoVazia(), ...((await lerConfigIA()) ?? {}) };
} catch {
  configIA = configuracaoVazia();
}
try {
  ultimaAnalise = (await lerAnaliseMes()) ?? null;
} catch {
  ultimaAnalise = null;
}
montarMarcas();
montarParcelas();

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

// PWA: instala o service worker (../../sw.js), que faz o app abrir sem internet.
// Falhar aqui não impede o app de funcionar: só deixa de funcionar offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((erro) => {
    console.error('Não foi possível instalar o funcionamento offline.', erro);
  });
}
