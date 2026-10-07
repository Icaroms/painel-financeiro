/**
 * Tela de lançamento: liga o HTML (index.html) às regras do app.
 *
 * Este arquivo só cuida da TELA: lê o que a pessoa digitou ou escolheu,
 * pede o resultado ao painel (src/painel.js) e copia os textos e
 * posições para o HTML. Nenhuma conta de dinheiro é feita aqui.
 *
 * Os dados ficam gravados no próprio aparelho (IndexedDB, em ./banco.js):
 * fechar e abrir a página mantém os lançamentos. Enquanto a configuração
 * do mês não existe, o conteúdo inicial ainda é o EXEMPLO fictício.
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { marcasDaEscala } from '../mostrador.js';
import { criarDadosDeExemplo } from '../dados-exemplo.js';
import { calcularPainel } from '../painel.js';
import { empacotar, desempacotar } from '../persistencia.js';
import { nomeDoArquivoBackup, gerarBackup, lerBackup } from '../backup.js';
import { lerPacote, gravarPacote, pedirArmazenamentoPersistente } from './banco.js';
import { entregarArquivo } from './arquivos.js';

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
 * Carrega os dados do aparelho.
 *
 * - Primeiro acesso (nada gravado): cria o exemplo e grava.
 * - Mês virou: recria o exemplo para o mês novo. Isso é provisório:
 *   por enquanto só existe dado de exemplo. A virada de mês de verdade
 *   (com saldo inicial e fixos) entra na tarefa de configuração do mês.
 * - Dados gravados ilegíveis: usa o exemplo só na memória e não grava
 *   nada, para não apagar o que está lá.
 *
 * @returns {Promise<{ dados: object, aviso: string }>}
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
    const novos = criarDadosDeExemplo(hoje);
    const gravou = await gravar(novos);
    return { dados: novos, aviso: gravou ? 'Primeiro acesso: dados de exemplo criados.' : avisoSemGravacao() };
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

  if (salvos.registroMes.mes !== mesDaData(hoje)) {
    const novos = criarDadosDeExemplo(hoje);
    const gravou = await gravar(novos);
    return { dados: novos, aviso: gravou ? 'Mês novo: o exemplo foi recriado para este mês.' : avisoSemGravacao() };
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

/** Cria os chips de categoria e de pagamento a partir dos dados. */
function montarChips() {
  el.chipsCategoria.replaceChildren(
    ...dados.categorias.map((c, i) => criarChip('categoria', c.id, c.nome, i === 0)),
  );
  el.chipsPagamento.replaceChildren(
    ...dados.formasPagamento.map((f, i) => criarChip('pagamento', f, f, i === 0)),
  );
}

/* ------------------------------------------------------------------ */
/* Atualização (a cada tecla e a cada escolha)                        */
/* ------------------------------------------------------------------ */

/** Lê o formulário, calcula o painel e atualiza a tela. Devolve o painel. */
function atualizar() {
  const painel = calcularPainel({
    dados,
    valorTexto: el.valor.value,
    categoriaId: el.formulario.elements.categoria.value,
    formaPagamento: el.formulario.elements.pagamento.value,
    hoje: hojeLocal(),
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
  dados = criarDadosDeExemplo(hojeLocal());
  el.valor.value = '';
  montarChips();
  atualizar();

  const gravou = await gravar(dados);
  el.rodapeTexto.textContent = gravou ? 'Exemplo restaurado.' : avisoSemGravacao();
});

/* ------------------------------------------------------------------ */
/* Backup                                                             */
/* ------------------------------------------------------------------ */

el.botaoExportar.addEventListener('click', async () => {
  const nome = nomeDoArquivoBackup();
  try {
    const resultado = await entregarArquivo(nome, gerarBackup(dados));
    el.rodapeTexto.textContent = resultado === 'cancelado'
      ? 'Exportação cancelada.'
      : `Backup exportado: ${nome}`;
  } catch (erro) {
    console.error(erro);
    el.rodapeTexto.textContent = 'Não foi possível exportar o backup.';
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
    el.rodapeTexto.textContent = 'Arquivo grande demais para ser um backup do app.';
    return;
  }

  let lido;
  try {
    lido = lerBackup(await arquivo.text(), { hoje: hojeLocal() });
  } catch (erro) {
    if (!(erro instanceof ErroValidacao)) throw erro;
    el.rodapeTexto.textContent = erro.message;
    return;
  }

  const salvoEm = new Date(lido.resumo.salvoEm).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const confirmou = window.confirm(
    `Importar o backup de ${salvoEm}, com ${lido.resumo.lancamentos} lançamento(s)?\n\n` +
      'Os dados atuais deste aparelho serão substituídos.',
  );
  if (!confirmou) {
    el.rodapeTexto.textContent = 'Importação cancelada.';
    return;
  }

  dados = lido.dados;
  el.valor.value = '';
  montarChips();
  atualizar();

  // A pessoa confirmou a troca: grava mesmo se os dados antigos estavam
  // ilegíveis. Importar um backup é justamente o jeito de recuperar o app.
  gravacaoDisponivel = true;
  const gravou = await gravar(dados);
  el.rodapeTexto.textContent = gravou
    ? `Backup importado: ${lido.resumo.lancamentos} lançamento(s).`
    : avisoSemGravacao();
});

/* ------------------------------------------------------------------ */
/* Início                                                             */
/* ------------------------------------------------------------------ */

// "await" no nível do módulo: a tela só é montada depois de ler o aparelho.
const carregado = await carregarDados();
dados = carregado.dados;

montarMarcas();
montarChips();
atualizar();
el.rodapeTexto.textContent = carregado.aviso;

// Sem esperar: o pedido roda em segundo plano e não atrasa a tela.
pedirArmazenamentoPersistente();
