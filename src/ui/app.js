/**
 * Tela de lançamento e navegação: liga o HTML (index.html) às regras do app.
 *
 * Novo layout (11/2026): barra com Início, Mês, [+], Planejar e Ajustes
 * (vira barra lateral em telas largas). As vistas trocam pelo endereço
 * (as rotas estão em src/rotas.js):
 * - #inicio (padrão): o essencial do mês (./inicio-tela.js);
 * - #lancar: Novo gasto, com o veredito ao vivo (este arquivo), aberto pelo "+";
 * - #mes/<parte>: resumo, entradas, contas e gastos do mês (./mes.js e outros);
 * - #historico: todos os gastos e os totais por semana (./historico.js);
 * - #planejar/<parte>: Avaliar compra, lista de desejos e Investir;
 * - #investir/<página>: carteira, simulador, radar e imposto (./investir.js...);
 * - #ajustes e #ajustes/<página>: o antigo Configurar, em páginas (./configurar.js...).
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
  lerAnaliseMes, gravarAnaliseMes, apagarAnaliseMes, lerRadarGuardado, gravarRadarGuardado,
  lerNuvem, gravarNuvem,
} from './banco.js';
import { iniciarNuvem } from './nuvem.js';
import { iniciarConfigIA } from './configurar-ia.js';
import { configuracaoVazia, iaDisponivel } from '../ia.js';
import { lerRota } from '../rotas.js';
import { resumosDosAjustes } from '../resumo-ajustes.js';
import { excluirLancamento } from '../resumo-mes.js';
import { iniciarInicio } from './inicio-tela.js';
import { iniciarCalendario } from './calendario.js';
import { iniciarGraficosMes } from './graficos-mes.js';
import { iniciarTema, iniciarOcultarValores, iniciarFolha, criarToast, ligarAjudas } from './interface.js';
import { mensagemDaCompra } from '../explicacoes.js';
import { blocoExplicar } from './explicar.js';
import { iniciarAnaliseMes } from './analise-mes.js';
import { iniciarDestinoMes, iniciarDestinoConfig } from './destino.js';
import { entregarArquivo } from './arquivos.js';
import { iniciarConfigurar } from './configurar.js';
import { iniciarMes } from './mes.js';
import { iniciarHistorico } from './historico.js';
import { iniciarSimulador } from './simulador.js';
import { iniciarEntradasConfig, iniciarEntradasMes } from './entradas.js';
import { iniciarOrcamentos } from './orcamentos.js';
import { iniciarDesejos } from './desejos.js';
import { adicionarDesejo } from '../desejos.js';
import { textoDoValor } from '../configuracao.js';
import { resumoDaCarteira, investimentosAtivos } from '../carteira.js';
import { iniciarInvestir } from './investir.js';
import { iniciarRadar } from './radar.js';
import { iniciarSimuladorInvestimentos } from './simulador-investimentos.js';
import { dividirSobra } from '../destino.js';
import { comEstimativas } from '../renda-fixa.js';
import {
  VERSAO_APP, numeroDaVersao, textoDoAvisoDaCopia, haVersaoNova, textoDaVersaoNova, deveVerificarVersao,
  RESULTADOS_DA_PROCURA, textoDaProcura,
} from '../versao-app.js';
import { ligarCamposDeDinheiro } from './campo-dinheiro.js';

// Digitação "de banco" em todos os campos de valor (os números entram pelos centavos).
ligarCamposDeDinheiro();

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
  descricao: elemento('descricao'),
  parcelas: elemento('parcelas'),
  infoCartao: elemento('info-cartao'),
  campoData: elemento('campo-data'),
  dataGasto: elemento('data-gasto'),
  dataTexto: elemento('data-texto'),
  botaoRestaurar: elemento('botao-restaurar'),
  telaConfigurar: elemento('tela-configurar'),
  telaSimular: elemento('tela-simular'),
  configMensagem: elemento('config-mensagem'),
  telaInicio: elemento('tela-inicio'),
  telaMes: elemento('tela-mes'),
  telaHistorico: elemento('tela-historico'),
  telaPlanejar: elemento('tela-planejar'),
  telaInvestir: elemento('tela-investir'),
  telaAjustes: elemento('tela-ajustes'),
  configTitulo: elemento('config-titulo'),
  investirTitulo: elemento('investir-titulo'),
  abaRegistrar: elemento('aba-registrar'),
  folhaRegistrar: elemento('folha-registrar'),
  gastoFechar: elemento('gasto-fechar'),
  botaoOcultar: elemento('botao-ocultar'),
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
 * Histórico do CDI e do IPCA do último radar baixado (parte 4.4b), para
 * estimar a renda fixa pela taxa contratada (parte 4.4c). null sem radar.
 */
let historicoDasTaxas = null;

/** Último radar baixado (taxas e Tesouro do simulador de investimentos, parte 4.5). null sem radar. */
let radarGuardado = null;

/** Última visão com estimativas calculada (reaproveitada enquanto nada muda). */
let cacheEstimados = { dados: undefined, historico: undefined, hoje: undefined, visao: null };

/**
 * Dados com a renda fixa estimada pela taxa contratada (src/renda-fixa.js).
 * SÓ PARA MOSTRAR E CALCULAR (carteira, reserva, destino da sobra, IA):
 * toda mudança continua partindo de `dados`, que é o que a pessoa digitou.
 */
function dadosEstimados() {
  const hoje = hojeLocal();
  const c = cacheEstimados;
  if (c.dados !== dados || c.historico !== historicoDasTaxas || c.hoje !== hoje) {
    cacheEstimados = { dados, historico: historicoDasTaxas, hoje, visao: dados && comEstimativas(dados, historicoDasTaxas, hoje) };
  }
  return cacheEstimados.visao;
}

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
        'Confira e confirme o saldo em Ajustes → Dinheiro e entradas.',
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
 * Chamado depois de cada gravação bem-sucedida. A sincronização (Fase 05)
 * troca por "agendar o envio para o servidor"; até lá, não faz nada.
 */
let aoGravar = () => {};

/**
 * Grava os dados no aparelho.
 * @param {object} dadosParaGravar
 * @returns {Promise<boolean>} true se gravou.
 */
async function gravar(dadosParaGravar) {
  if (!gravacaoDisponivel) return false;
  try {
    await gravarPacote(empacotar(dadosParaGravar));
    aoGravar();
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
    descricao: el.descricao.value,
  });

  // Compra no cartão: escolha das parcelas, quando a fatura é paga e o limite.
  el.linhaCartao.hidden = !painel.ehCartao;
  // Atalho para "Avaliar compra": sempre visível; com valor, fala "desta compra".
  el.linkSimular.textContent = painel.lancamento === null
    ? 'Pensando numa compra? Avaliar antes →'
    : 'Avaliar esta compra (parcelas, melhor mês e IA) →';
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

  const { lancamento } = painel;
  const categoria = dados.categorias.find((c) => c.id === lancamento.categoriaId);
  const parcelasTexto = lancamento.parcelas > 1 ? ` em ${lancamento.parcelas}x` : '';
  el.valor.value = '';
  el.descricao.value = '';
  el.parcelas.value = '1'; // a próxima compra volta a ser à vista
  atualizar();

  // A data escolhida continua escolhida: facilita lançar vários gastos
  // esquecidos do mesmo dia. A borda âmbar avisa que não é hoje.
  const doDia = painel.dataAnterior ? `, ${painel.dataTexto.replace('Gasto do dia', 'no dia')}` : '';
  const nome = lancamento.descricao ? ` (${lancamento.descricao})` : '';
  const gravou = await gravar(dados);
  if (!gravou) {
    el.rodapeTexto.textContent = avisoSemGravacao();
    return;
  }
  el.rodapeTexto.textContent = '';
  // Volta para onde a pessoa estava e oferece "Desfazer" (o gasto é excluído, inclusive na nuvem).
  voltarDoGasto();
  avisar(`Lançado: ${formatarCentavos(lancamento.valorCentavos)}${parcelasTexto} em ${categoria.nome}${nome}${doDia}.`, {
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => aplicarMudanca(excluirLancamento(dados, lancamento.id), 'Gasto desfeito.'),
    },
  });
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
      'O app começa vazio: em Ajustes, você informa o saldo da conta, o salário, as contas fixas e as categorias.',
  );
  if (!confirmou) return;

  trocarDados(criarDadosIniciais(hojeLocal()));
  location.hash = '#ajustes/dinheiro';
  const gravou = await gravar(dados);
  avisar(gravou ? 'Pronto: comece informando o saldo da conta e o salário.' : avisoSemGravacao());
}
for (const botao of document.querySelectorAll('.botao-usar-de-verdade')) {
  botao.addEventListener('click', usarDeVerdade);
}

el.botaoZerar.addEventListener('click', async () => {
  // Os dados de exemplo nunca foram para a nuvem: apagá-los não mexe na conta.
  const naNuvemTambem = nuvem.conectado() && !ehExemplo(dados);
  const pergunta = ehExemplo(dados)
    ? 'Apagar os dados de exemplo e começar do zero?'
    : 'Apagar TODOS os dados deste aparelho e começar do zero?\n\n' +
      'Se quiser guardar os dados atuais, cancele e exporte um backup antes.' +
      (naNuvemTambem
        ? '\n\nOs dados também serão apagados na sua conta da nuvem (os backups da nuvem continuam guardados).'
        : '');
  if (!window.confirm(pergunta)) return;

  let sincronizacaoTratada = false;
  if (naNuvemTambem) {
    try {
      await nuvem.zerarNaNuvem();
      sincronizacaoTratada = true;
    } catch (erro) {
      const soAqui = window.confirm(
        `Não foi possível apagar na nuvem: ${erro.message}\n\nApagar só neste aparelho? ` +
          'Na próxima sincronização, o app pergunta se junta com os dados da conta.',
      );
      if (!soAqui) return;
    }
  }

  trocarDados(criarDadosIniciais(hojeLocal()), { manterSincronizacao: sincronizacaoTratada });
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

  // Conta da nuvem conectada (e dados reais aqui): a conta também pode ficar com este backup.
  let sincronizacaoTratada = false;
  if (nuvem.conectado() && dados !== null && !ehExemplo(dados)) {
    const naNuvemTambem = window.confirm(
      'Substituir também os dados da sua conta na nuvem por este backup?\n\n' +
        'OK: sim (os outros aparelhos vão perguntar se usam os dados novos).\n' +
        'Cancelar: só neste aparelho (na próxima sincronização, o app pergunta se junta com os dados da conta).',
    );
    if (naNuvemTambem) {
      try {
        await nuvem.zerarNaNuvem();
        sincronizacaoTratada = true;
      } catch (erro) {
        avisar(`Importação cancelada: não foi possível substituir na nuvem (${erro.message})`);
        return;
      }
    }
  }

  trocarDados(virada.dados, { manterSincronizacao: sincronizacaoTratada });
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

/** Mensagem rápida embaixo da tela (toast), com ação opcional ("Desfazer"). */
const mostrarToast = criarToast(el.configMensagem);

/**
 * Mostra uma mensagem das vistas Mês e Configurar. Ela fica presa acima das abas
 * (para ser vista de qualquer ponto da página) e some depois de 6 segundos.
 *
 * @param {string} texto
 */
function avisar(texto, opcoes = {}) {
  mostrarToast(texto, opcoes);
}

/**
 * Troca os dados por uma versão alterada (vinda das vistas Mês ou
 * Configurar), redesenha a tela de lançamento, grava e avisa.
 */
async function aplicarMudanca(novos, mensagem) {
  dados = novos;
  montarChips();
  atualizar();
  // A aba Mês aberta (ex.: uma conta marcada como paga): o destino da sobra acompanha.
  if (!el.telaMes.hidden) destinoMes.renderizar();
  // Configurar aberta (ex.: um orçamento mudou): o custo do mês e a meta da reserva acompanham.
  if (!el.telaInicio.hidden) inicio.renderizar();
  if (!el.telaAjustes.hidden) renderizarAjustes();
  redesenharGraficosAbertos();
  if (!el.telaConfigurar.hidden) {
    destinoConfig.renderizar();
    // Entradas e orçamentos (11/2026): o livre do mês, o alerta e o dinheiro do mês acompanham.
    orcamentos.renderizar();
    entradasConfig.renderizar();
    configurar.atualizarResumo();
  }
  atualizarPonto();
  atualizarFaixaExemplo();
  const gravou = await gravar(dados);
  avisar(gravou ? mensagem : avisoSemGravacao());
}

const configurar = iniciarConfigurar({
  obterDados: () => dados,
  aplicarMudanca,
  // Botão "Avaliar compra" de cada cartão: abre o simulador com aquele cartão.
  // (O simulador é criado logo abaixo; o clique só acontece depois.)
  abrirSimulador: (formaPagamento) => {
    simulador.preencher({ formaPagamento, origem: '#ajustes/pagamentos' });
    location.hash = '#simular';
  },
});
const resumo = iniciarMes({ obterDados: () => dados, aplicarMudanca });
// 11/2026: salário e outras entradas (Configurar e Mês) e orçamentos com o livre do mês.
const entradasConfig = iniciarEntradasConfig({ obterDados: () => dados, aplicarMudanca });
const entradasMes = iniciarEntradasMes({
  obterDados: () => dados,
  aplicarMudanca,
  aoMudar: () => {
    resumo.renderizar();
    destinoMes.renderizar();
  },
});
const orcamentos = iniciarOrcamentos({
  obterDados: () => dados,
  aplicarMudanca,
  aoAplicar: () => configurar.renderizarCategorias(),
});
/** O Lançar pediu "Registrar entrada": ao abrir a aba Mês, o foco vai para o formulário. */
let focarEntradaAoAbrirMes = false;
const historico = iniciarHistorico({ obterDados: () => dados });
/** Parte "Investir" da sobra deste mês (destino da sobra), com a renda fixa estimada. */
function investirDoMes() {
  if (!dados) return 0;
  const hoje = hojeLocal();
  return dividirSobra(dadosEstimados(), mesDaData(hoje), hoje).investirCentavos;
}

const investir = iniciarInvestir({
  obterDados: () => dados,
  obterDadosEstimados: dadosEstimados,
  aplicarMudanca,
  // Parte 4.6: indicadores com o histórico das taxas e o botão da IA.
  obterRadar: () => radarGuardado,
  obterConfigIA: () => configIA,
});
const radar = iniciarRadar({
  lerGuardado: lerRadarGuardado,
  // Radar novo: guarda, troca o histórico das taxas e refaz a carteira com a estimativa nova.
  guardar: async (guardado) => {
    await gravarRadarGuardado(guardado);
    historicoDasTaxas = guardado?.radar?.taxas?.historico ?? null;
    radarGuardado = guardado?.radar ?? null;
    if (lerRota(location.hash).vista === 'investir') {
      investir.renderizar();
      simuladorInvestimentos.renderizar();
    }
  },
  obterDados: dadosEstimados,
  obterConfigIA: () => configIA,
  // Filtro "cabe no Investir deste mês" do radar: a parte Investir do destino da sobra.
  obterInvestirCentavos: investirDoMes,
});
// Parte 4.5: simulador de investimentos, com as taxas do radar guardado.
const simuladorInvestimentos = iniciarSimuladorInvestimentos({
  obterRadar: () => radarGuardado,
  obterInvestirCentavos: investirDoMes,
});
const simulador = iniciarSimulador({
  obterDados: () => dados,
  obterConfigIA: () => configIA,
  // 11/2026: "Guardar na lista de desejos" (erros de validação voltam para a tela do simulador).
  guardarDesejo: async (desejo) => {
    await aplicarMudanca(adicionarDesejo(dados, desejo), '');
    avisar(`"${desejo.nome.trim()}" guardado na lista de desejos.`, {
      acao: { rotulo: 'Ver lista', aoClicar: () => { location.hash = '#planejar'; } },
    });
  },
});
// 11/2026: lista de desejos (vista Avaliar compra).
const desejos = iniciarDesejos({
  obterDados: () => dados,
  aplicarMudanca,
  obterConfigIA: () => configIA,
  abrirNaAvaliacao: (desejo, menorCentavos) => {
    simulador.preencher({
      formaPagamento: desejo.formaPagamento,
      valorTexto: textoDoValor(menorCentavos),
      descricao: desejo.nome,
      parcelas: desejo.parcelas,
      origem: '#planejar',
    });
    location.hash = '#simular';
  },
});
// Fase 04, parte 4.1: destino da sobra (aba Mês e Configurar).
// A reserva usa o valor estimado da renda fixa (4.4c): só leitura, então a visão com estimativas.
const destinoMes = iniciarDestinoMes({ obterDados: dadosEstimados });
const destinoConfig = iniciarDestinoConfig({ obterDados: () => dados, obterDadosEstimados: dadosEstimados, aplicarMudanca });

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

// Botão "+": Gasto, Entrada ou Avaliar compra. "Entrada" abre o Mês com o foco no formulário.
iniciarFolha({
  botao: el.abaRegistrar,
  fundo: el.folhaRegistrar,
  aoEscolher: (destino) => {
    if (destino === '#mes/entradas') focarEntradaAoAbrirMes = true;
  },
});

/* ------------------------------------------------------------------ */
/* Início, Ajustes, tema e ajuda                                       */
/* ------------------------------------------------------------------ */

const inicio = iniciarInicio({ obterDados: () => dados, backupAtrasado: () => situacaoDoBackup(dados).atrasado });
// Gráficos do Mês e calendário de 90 dias (Planejar), 11/2026.
const graficosMes = iniciarGraficosMes({ obterDados: () => dados });
const calendario = iniciarCalendario({ obterDados: () => dados });
iniciarTema(el.telaAjustes);
iniciarOcultarValores(el.botaoOcultar);
// Os textos explicativos fixos viram ajuda "?" ao lado do título.
for (const vista of [el.telaConfigurar, el.telaMes, el.telaInvestir, el.telaPlanejar]) ligarAjudas(vista);

/** Escreve o resumo de cada item do menu de Ajustes e os pontos de atenção. */
function renderizarAjustes() {
  if (!dados) return;
  const backup = situacaoDoBackup(dados);
  const { textos, pontos } = resumosDosAjustes(dados, hojeLocal(), {
    iaLigada: iaDisponivel(configIA), backupTexto: backup.texto, backupAtrasado: backup.atrasado, versao: numeroDaVersao(VERSAO_APP),
  });
  for (const [pagina, texto] of Object.entries(textos)) {
    const linha = document.getElementById(`ajuste-resumo-${pagina}`);
    if (linha) linha.textContent = texto;
  }
  for (const pagina of ['dinheiro', 'categorias', 'conta']) {
    document.getElementById(`ajuste-ponto-${pagina}`).hidden = !pontos[pagina];
  }
}

/** Títulos das páginas de Ajustes e de Investir. */
const TITULOS_DE_AJUSTES = {
  dinheiro: 'Dinheiro e entradas', contas: 'Contas fixas', categorias: 'Categorias e orçamentos',
  pagamentos: 'Cartões e pagamentos', sobra: 'Destino da sobra', ia: 'IA (Gemini)', conta: 'Conta, nuvem e backup',
  app: 'Sobre e atualização',
};
const TITULOS_DE_INVESTIR = {
  carteira: 'Carteira', simulador: 'Simulador de investimentos', radar: 'Radar de opções', receita: 'Imposto de renda',
};

/** Gráficos e calendário acompanham os dados quando a parte deles está aberta. */
function redesenharGraficosAbertos() {
  const { vista, parte } = lerRota(location.hash);
  if (vista === 'mes' && parte === 'resumo' && !el.telaMes.hidden) graficosMes.renderizar();
  if (vista === 'planejar' && parte === 'calendario' && !el.telaPlanejar.hidden) calendario.renderizar();
}

/** Linha de resumo da carteira no menu Investir (Planejar). */
function renderizarResumoDaCarteira() {
  const linha = document.getElementById('planejar-resumo-carteira');
  const quantos = investimentosAtivos(dados).length;
  linha.textContent = quantos === 0
    ? 'Cadastre o que você já tem aplicado'
    : `${quantos} ${quantos === 1 ? 'investimento' : 'investimentos'} · ${formatarCentavos(resumoDaCarteira(dadosEstimados()).atualCentavos)}`;
}

/** Último endereço fora do Novo gasto: para onde o "Fechar" (e o "Lançar") volta. */
let enderecoAntesDoGasto = '#inicio';

/** Sai do Novo gasto para a tela de onde a pessoa veio. */
function voltarDoGasto() {
  location.hash = enderecoAntesDoGasto;
}
el.gastoFechar.addEventListener('click', voltarDoGasto);

// Atalho do Lançar para o simulador: leva o valor digitado e o cartão escolhido.
el.linkSimular.addEventListener('click', () => {
  simulador.preencher({
    formaPagamento: el.formulario.elements.pagamento.value,
    valorTexto: el.valor.value,
    descricao: el.descricao.value,
    origem: '#lancar',
  });
});

/* ------------------------------------------------------------------ */
/* Navegação entre as vistas                                          */
/* ------------------------------------------------------------------ */

/**
 * Mostra a vista indicada no endereço (src/rotas.js). Usar o endereço
 * permite voltar com o botão "voltar" do navegador e abrir direto numa vista.
 */
function mostrarVista() {
  // Primeiro acesso: só as boas-vindas, sem abas, até a pessoa escolher.
  const primeiroAcesso = dados === null;
  el.telaBoasVindas.hidden = !primeiroAcesso;
  el.abas.hidden = primeiroAcesso;
  const telas = {
    inicio: el.telaInicio,
    lancar: el.tela,
    mes: el.telaMes,
    historico: el.telaHistorico,
    planejar: el.telaPlanejar,
    investir: el.telaInvestir,
    simular: el.telaSimular,
    ajustes: el.telaAjustes,
    configurar: el.telaConfigurar,
  };
  if (primeiroAcesso) {
    for (const tela of Object.values(telas)) tela.hidden = true;
    return;
  }

  const { vista, parte, aba } = lerRota(location.hash);
  for (const [nome, tela] of Object.entries(telas)) tela.hidden = nome !== vista;
  document.body.dataset.vista = vista;
  if (vista !== 'lancar') enderecoAntesDoGasto = location.hash || '#inicio';
  // O toast continua ao trocar de tela: o "Desfazer" do gasto aparece no Início.

  // Aba marcada (aria-current="page": estilo e leitores de tela). O Novo gasto não marca nenhuma.
  for (const link of el.abas.querySelectorAll('.aba[data-aba]')) {
    if (link.dataset.aba === aba) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  // Partes (Mês e Planejar): mostra só a escolhida e marca o segmento.
  const tela = telas[vista];
  for (const bloco of tela.querySelectorAll(':scope > .parte')) bloco.hidden = bloco.dataset.parte !== parte;
  for (const link of tela.querySelectorAll(':scope > .segmentos a')) {
    if (link.dataset.parte === parte) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // Páginas (Ajustes e Investir): só as seções daquela página.
  if (vista === 'configurar' || vista === 'investir') {
    for (const secao of tela.querySelectorAll(':scope > [data-pagina]')) secao.hidden = secao.dataset.pagina !== parte;
  }

  if (vista === 'inicio') inicio.renderizar();
  if (vista === 'mes') {
    resumo.renderizar();
    if (parte === 'resumo') graficosMes.renderizar();
    entradasMes.renderizar();
    if (focarEntradaAoAbrirMes) {
      focarEntradaAoAbrirMes = false;
      requestAnimationFrame(() => entradasMes.focarNovaEntrada());
    }
    destinoMes.renderizar();
    analiseMes.renderizar(); // mostra a última análise do mês, com a hora em que foi feita
  }
  if (vista === 'historico') historico.renderizar();
  if (vista === 'planejar') {
    desejos.renderizar();
    if (parte === 'calendario') calendario.renderizar();
    renderizarResumoDaCarteira();
  }
  if (vista === 'investir') {
    el.investirTitulo.textContent = TITULOS_DE_INVESTIR[parte];
    investir.renderizar();
    simuladorInvestimentos.renderizar();
    if (parte === 'radar') radar.renderizar(); // mostra o radar guardado e busca o novo se já passou da hora
  }
  if (vista === 'ajustes') renderizarAjustes();
  if (vista === 'configurar') {
    el.configTitulo.textContent = TITULOS_DE_AJUSTES[parte];
    configurar.renderizar();
    entradasConfig.renderizar();
    orcamentos.renderizar();
    destinoConfig.renderizar();
    configuracaoIA.renderizar();
    nuvem.aoAbrirConfigurar();
  }
  if (vista === 'simular') simulador.renderizar();
  // Abrindo o Novo gasto, a tela é refeita e o valor recebe o foco.
  if (vista === 'lancar') {
    atualizar();
    requestAnimationFrame(() => el.valor.focus({ preventScroll: true }));
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', mostrarVista);

/* ------------------------------------------------------------------ */
/* Início                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Conta e nuvem (Fase 05): sincronização com o servidor              */
/* ------------------------------------------------------------------ */

/** Redesenha a vista aberta depois que dados chegaram do servidor. */
function redesenharVistaAberta() {
  if (!el.telaInicio.hidden) inicio.renderizar();
  if (!el.telaAjustes.hidden) renderizarAjustes();
  if (!el.telaPlanejar.hidden) desejos.renderizar();
  redesenharGraficosAbertos();
  if (!el.telaMes.hidden) {
    resumo.renderizar();
    destinoMes.renderizar();
  }
  if (!el.telaHistorico.hidden) historico.renderizar();
  if (!el.telaInvestir.hidden) investir.renderizar();
  if (!el.telaConfigurar.hidden) {
    configurar.renderizar();
    destinoConfig.renderizar();
  }
}

const nuvem = iniciarNuvem({
  obterDados: () => dados,
  // Os dados de exemplo são fictícios: nunca vão para o servidor.
  podeSincronizar: () => dados !== null && !ehExemplo(dados),
  // Dados juntados com os do servidor: redesenha e grava (sem novo envio).
  aplicarDaNuvem: async (novos) => {
    dados = novos;
    montarChips();
    atualizar();
    atualizarPonto();
    atualizarFaixaExemplo();
    redesenharVistaAberta();
    await gravar(dados);
  },
  // "Usar os dados do servidor neste aparelho": troca tudo e cria o mês atual, se faltar.
  substituirPelaNuvem: async (novos) => {
    const virada = prepararMesAtual(novos, hojeLocal());
    const final = virada === null ? novos : virada.dados;
    trocarDados(final, { manterSincronizacao: true });
    mostrarVista();
    const gravou = await gravar(final);
    avisar(gravou ? 'Pronto: os dados do servidor estão neste aparelho.' : avisoSemGravacao());
  },
  // "Restaurar" um backup da nuvem: confere, apaga os dados da conta (antesDeTrocar) e troca tudo.
  restaurarBackup: async (lidos, antesDeTrocar) => {
    const virada = prepararMesAtual(lidos, hojeLocal());
    if (virada === null) {
      throw new ErroValidacao('backup', 'Este backup só tem meses posteriores a hoje. Confira a data do aparelho.');
    }
    await antesDeTrocar();
    trocarDados(virada.dados, { manterSincronizacao: true });
    mostrarVista();
    gravacaoDisponivel = true;
    const gravou = await gravar(dados);
    avisar(gravou ? 'Backup restaurado neste aparelho e na nuvem.' : avisoSemGravacao());
  },
  // Backup enviado à nuvem: vale como "último backup" (o lembrete do cartão Backup acompanha).
  backupFeito: async (agora) => {
    dados = registrarBackup(dados, { agora });
    atualizarPonto();
    await gravar(dados);
  },
  lerGuardado: lerNuvem,
  gravarGuardado: gravarNuvem,
});
// Cada gravação no aparelho agenda o envio para o servidor (se houver conta).
aoGravar = () => nuvem.agendar();

/**
 * Troca todos os dados de uma vez (exemplo, começar do zero, backup) e
 * redesenha as duas vistas. Não grava: quem chama decide quando gravar.
 *
 * Com a conta da nuvem conectada, a sincronização recomeça do zero: na
 * próxima, o app pergunta se usa os dados do servidor ou junta com os daqui.
 * Quem já cuidou da sincronização (dados vindos do servidor, ou a conta
 * zerada antes da troca) passa manterSincronizacao: true.
 *
 * @param {object} novos
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.manterSincronizacao]
 */
function trocarDados(novos, { manterSincronizacao = false } = {}) {
  if (!manterSincronizacao) nuvem.dadosTrocados();
  dados = novos;
  // A análise da IA guardada era dos dados antigos: deixa de valer.
  ultimaAnalise = null;
  apagarAnaliseMes().catch(() => {});
  el.valor.value = '';
  el.descricao.value = '';
  montarChips();
  atualizar();
  atualizarPonto();
  atualizarFaixaExemplo();
  configurar.renderizar();
}

// Boas-vindas: "Começar do zero" leva direto para Configurar.
el.botaoComecarZero.addEventListener('click', async () => {
  trocarDados(criarDadosIniciais(hojeLocal()));
  location.hash = '#ajustes/dinheiro';
  mostrarVista();
  const gravou = await gravar(dados);
  avisar(gravou ? 'Comece informando o saldo da conta e o salário.' : avisoSemGravacao());
});

// Aparelho novo com backup de outro: importa sem passar pelo exemplo.
el.botaoBoasVindasBackup.addEventListener('click', () => {
  el.arquivoBackup.value = '';
  el.arquivoBackup.click();
});

el.botaoVerExemplo.addEventListener('click', async () => {
  trocarDados(criarDadosDeExemplo(hojeLocal()));
  location.hash = '#inicio';
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
try {
  radarGuardado = (await lerRadarGuardado())?.radar ?? null;
} catch {
  radarGuardado = null; // sem radar guardado: renda fixa com o valor digitado; simulador pede o radar
}
historicoDasTaxas = radarGuardado?.taxas?.historico ?? null;
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

// Conta da nuvem: lê a sessão guardada e sincroniza logo depois de abrir.
await nuvem.carregar();
nuvem.agendar(1000);

/**
 * Mostra ou esconde uma faixa do topo (cópia guardada ou versão nova).
 *
 * @param {string} id    "aviso-copia" ou "aviso-versao".
 * @param {string|null} texto null esconde a faixa.
 */
function mostrarAvisoDoTopo(id, texto) {
  const faixa = document.getElementById(id);
  if (!faixa) return;
  document.getElementById(`${id}-texto`).textContent = texto ?? '';
  faixa.hidden = !texto;
}
// "Entendi" esconde o aviso da cópia até a próxima vez que o app abrir.
document.getElementById('aviso-copia-fechar')?.addEventListener('click', () => mostrarAvisoDoTopo('aviso-copia', null));
// "Atualizar" recarrega a página: com internet, os arquivos novos vêm do servidor.
// Os dados não são afetados: eles ficam no IndexedDB, não na página.
document.getElementById('aviso-versao-atualizar')?.addEventListener('click', () => window.location.reload());
// "Depois" esconde o aviso da versão nova até a próxima vez que o app abrir (a versão nova continua esperando).
document.getElementById('aviso-versao-depois')?.addEventListener('click', () => mostrarAvisoDoTopo('aviso-versao', null));

/** Última versão que o service worker informou (usada pelo botão "Procurar atualização"). */
let versaoDoServiceWorker = null;

/**
 * Botão "Procurar atualização" (fim de Configurar): pede ao navegador para
 * conferir AGORA se há publicação nova, sem esperar os 30 minutos.
 * - Achou e está instalando: a faixa "versão nova" aparece sozinha em seguida.
 * - O service worker já tem versão maior que a página: falta tocar em Atualizar.
 * - Nada novo: "Você já está na última versão".
 */
async function procurarAtualizacao() {
  const botao = document.getElementById('botao-procurar-atualizacao');
  const saida = document.getElementById('procura-atualizacao');
  if (!botao || !saida) return;
  if (!('serviceWorker' in navigator)) {
    saida.textContent = textoDaProcura(RESULTADOS_DA_PROCURA.semSuporte);
    return;
  }
  botao.disabled = true;
  saida.textContent = 'Procurando…';
  let resultado;
  try {
    const registro = await navigator.serviceWorker.getRegistration();
    if (!registro) throw new Error('Service worker não instalado.');
    await registro.update();
    if (registro.installing || registro.waiting) resultado = RESULTADOS_DA_PROCURA.instalando;
    else if (haVersaoNova(versaoDoServiceWorker)) resultado = RESULTADOS_DA_PROCURA.nova;
    else resultado = RESULTADOS_DA_PROCURA.ultima;
  } catch {
    resultado = RESULTADOS_DA_PROCURA.erro;
  }
  saida.textContent = textoDaProcura(resultado);
  botao.disabled = false;
}
document.getElementById('botao-procurar-atualizacao')?.addEventListener('click', procurarAtualizacao);

/**
 * Versão do app e avisos do topo.
 *
 * - A linha "Versão do app" (fim de Configurar) mostra a VERSAO_APP: a
 *   versão do código que esta página está rodando ("v15").
 * - A página pergunta ao service worker a versão DELE. Na resposta vem:
 *   - se esta página abriu com a cópia guardada (e por quê): faixa amarela;
 *   - se a versão dele é maior que a da página: faixa verde "versão nova".
 * - Ela pergunta de novo quando o service worker muda (publicação nova
 *   instalada) e, quando o app volta para a tela, pede ao navegador para
 *   conferir se há publicação nova (no máximo a cada 30 minutos).
 */
function mostrarVersao() {
  const linha = document.getElementById('versao-app');
  if (linha) linha.textContent = `Versão do app: ${numeroDaVersao(VERSAO_APP)}`;
  if (!('serviceWorker' in navigator)) {
    if (linha) linha.textContent += ' (este navegador não guarda o app para uso sem internet)';
    return;
  }

  navigator.serviceWorker.addEventListener('message', (evento) => {
    if (evento.data?.tipo !== 'versao') return;
    versaoDoServiceWorker = evento.data.versao;
    mostrarAvisoDoTopo('aviso-copia', textoDoAvisoDaCopia(evento.data.copia, evento.data.versao));
    mostrarAvisoDoTopo('aviso-versao', haVersaoNova(evento.data.versao) ? textoDaVersaoNova(evento.data.versao) : null);
  });

  // Espera o service worker ficar ativo (na primeira visita ele ainda está instalando).
  navigator.serviceWorker.ready.then((registro) => {
    (navigator.serviceWorker.controller ?? registro.active)?.postMessage('versao');
  });

  // Um service worker novo assumiu a página (publicação nova instalada): pergunta a versão dele.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    navigator.serviceWorker.controller?.postMessage('versao');
  });

  // O app voltou para a tela (ex.: iPhone, app aberto em segundo plano há dias):
  // pede ao navegador para conferir se há publicação nova. Sem internet, não faz nada.
  let ultimaVerificacao = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !deveVerificarVersao(Date.now(), ultimaVerificacao)) return;
    ultimaVerificacao = Date.now();
    navigator.serviceWorker.getRegistration()
      .then((registro) => registro?.update())
      .catch(() => { /* sem internet ou servidor fora do ar: tenta na próxima vez */ });
  });
}

// PWA: instala o service worker (../../sw.js), que faz o app abrir sem internet.
// Falhar aqui não impede o app de funcionar: só deixa de funcionar offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((erro) => {
    console.error('Não foi possível instalar o funcionamento offline.', erro);
  });
}
mostrarVersao();
