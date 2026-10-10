/**
 * Modelo de dados do Painel Financeiro (Fase 01 - MVP).
 *
 * Entidades:
 * - Categoria:  onde o gasto se encaixa (iFood, Uber...) e quanto pode ir para ela no mês.
 * - Fixo:       conta que se repete todo mês (assinatura, parcela, mensalidade).
 * - Lançamento: um gasto registrado.
 * - Mês:        o saldo com que o mês começa, a renda prevista e os ajustes de valor
 *               de fixos naquele mês.
 *
 * Todo registro nasce com quatro campos de controle, pensados para a
 * sincronização entre aparelhos numa fase futura:
 * - id:           identificador único global, não depende do aparelho que criou.
 * - criadoEm:     momento da criação (ISO 8601, em UTC).
 * - atualizadoEm: momento da última alteração; numa sincronização, a versão mais recente vence.
 * - excluidoEm:   null enquanto o registro existe. Excluir não apaga de verdade
 *                 ("exclusão suave"): assim, a exclusão também pode ser sincronizada.
 *
 * As funções nunca alteram o objeto recebido: sempre devolvem um objeto novo.
 *
 * Todas aceitam um último parâmetro "opcoes" com:
 * - agora:   Date usada como "momento atual" (nos testes, uma data fixa).
 * - gerarId: função que gera o id (nos testes, um id previsível).
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida, ehMesValido, hojeLocal } from './datas.js';

/* ------------------------------------------------------------------ */
/* Validações internas                                                */
/* ------------------------------------------------------------------ */

/** Exige texto não vazio e devolve sem espaços nas pontas. */
function exigirTexto(valor, campo, rotulo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErroValidacao(campo, `${rotulo} é obrigatório.`);
  }
  return valor.trim();
}

/**
 * Exige um valor em centavos: inteiro e não negativo.
 * Com permitirZero = false, também rejeita zero.
 */
function exigirCentavos(valor, campo, rotulo, { permitirZero }) {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroValidacao(campo, `${rotulo} deve ser um número inteiro de centavos (ex.: 11851 para R$ 118,51).`);
  }
  if (valor < 0) {
    throw new ErroValidacao(campo, `${rotulo} não pode ser negativo.`);
  }
  if (!permitirZero && valor === 0) {
    throw new ErroValidacao(campo, `${rotulo} deve ser maior que zero.`);
  }
  return valor;
}

/** Exige um mês válido no formato "AAAA-MM". */
function exigirMes(valor, campo, rotulo) {
  if (!ehMesValido(valor)) {
    throw new ErroValidacao(campo, `${rotulo} inválido: "${valor}". Use o formato AAAA-MM.`);
  }
  return valor;
}

/* ------------------------------------------------------------------ */
/* Campos de controle                                                 */
/* ------------------------------------------------------------------ */

/** Gera o id padrão. Funciona no navegador e no Node 20+. */
function gerarIdPadrao() {
  return globalThis.crypto.randomUUID();
}

/** Monta os quatro campos de controle de um registro novo. */
function criarBase({ agora = new Date(), gerarId = gerarIdPadrao } = {}) {
  const momento = agora.toISOString();
  return {
    id: gerarId(),
    criadoEm: momento,
    atualizadoEm: momento,
    excluidoEm: null,
  };
}

/* ------------------------------------------------------------------ */
/* Categoria                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cria uma categoria com orçamento mensal.
 *
 * @param {object} dados
 * @param {string} dados.nome              Ex.: "iFood".
 * @param {number} dados.orcamentoCentavos Limite do mês. Zero é permitido
 *                                         (categoria sem orçamento definido).
 * @param {object} [opcoes]                { agora, gerarId }
 */
export function criarCategoria({ nome, orcamentoCentavos }, opcoes = {}) {
  return {
    ...criarBase(opcoes),
    nome: exigirTexto(nome, 'nome', 'O nome da categoria'),
    orcamentoCentavos: exigirCentavos(orcamentoCentavos, 'orcamentoCentavos', 'O orçamento', { permitirZero: true }),
  };
}

/* ------------------------------------------------------------------ */
/* Fixo                                                               */
/* ------------------------------------------------------------------ */

/**
 * Cria uma conta fixa.
 *
 * Um fixo vale do mesInicial até o mesFinal, inclusive. Para um
 * parcelamento, o mesFinal é o mês da última parcela, e o fixo some
 * sozinho depois dele. Para uma conta sem fim (assinatura), mesFinal é null.
 *
 * @param {object}      dados
 * @param {string}      dados.nome           Ex.: "Academia".
 * @param {number}      dados.valorCentavos  Zero é permitido para valor variável
 *                                           ainda não definido (ajuste depois).
 * @param {number}      dados.diaVencimento  De 1 a 31. Em meses mais curtos,
 *                                           as regras tratam como o último dia.
 * @param {string}      dados.formaPagamento Ex.: "Pix".
 * @param {string}      dados.mesInicial     "AAAA-MM".
 * @param {string|null} [dados.mesFinal]     "AAAA-MM" ou null (sem fim).
 * @param {object}      [opcoes]             { agora, gerarId }
 */
export function criarFixo(
  { nome, valorCentavos, diaVencimento, formaPagamento, mesInicial, mesFinal = null, pagamentoAutomatico = false },
  opcoes = {},
) {
  if (typeof pagamentoAutomatico !== 'boolean') {
    throw new ErroValidacao('pagamentoAutomatico', 'O campo "pagamento automático" deve ser true ou false.');
  }
  if (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
    throw new ErroValidacao('diaVencimento', 'O dia de vencimento deve ser um número de 1 a 31.');
  }

  const inicio = exigirMes(mesInicial, 'mesInicial', 'O mês inicial');

  if (mesFinal !== null) {
    exigirMes(mesFinal, 'mesFinal', 'O mês final');
    if (mesFinal < inicio) {
      throw new ErroValidacao('mesFinal', 'O mês final não pode ser antes do mês inicial.');
    }
  }

  return {
    ...criarBase(opcoes),
    nome: exigirTexto(nome, 'nome', 'O nome do fixo'),
    valorCentavos: exigirCentavos(valorCentavos, 'valorCentavos', 'O valor do fixo', { permitirZero: true }),
    diaVencimento,
    formaPagamento: exigirTexto(formaPagamento, 'formaPagamento', 'A forma de pagamento'),
    mesInicial: inicio,
    mesFinal,
    // Débito automático ou cobrança no cartão: a conta vira "Pago" sozinha
    // no dia do vencimento (veja statusDoFixoNoMes, em src/fixos.js).
    pagamentoAutomatico,
  };
}

/**
 * Diz se um fixo deve ser cobrado num determinado mês.
 *
 * @param {object} fixo
 * @param {string} mes "AAAA-MM".
 * @returns {boolean}
 */
export function fixoAtivoNoMes(fixo, mes) {
  exigirMes(mes, 'mes', 'O mês');

  if (fixo.excluidoEm !== null) return false;
  if (mes < fixo.mesInicial) return false;
  if (fixo.mesFinal !== null && mes > fixo.mesFinal) return false;
  return true;
}

/**
 * Muda o valor de um fixo (ex.: assinatura que varia com o câmbio).
 * Devolve um fixo novo, com atualizadoEm renovado.
 *
 * @param {object} fixo
 * @param {number} novoValorCentavos
 * @param {object} [opcoes] { agora }
 */
export function ajustarValorFixo(fixo, novoValorCentavos, { agora = new Date() } = {}) {
  return {
    ...fixo,
    valorCentavos: exigirCentavos(novoValorCentavos, 'valorCentavos', 'O valor do fixo', { permitirZero: true }),
    atualizadoEm: agora.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Lançamento                                                         */
/* ------------------------------------------------------------------ */

/** Limite de parcelas de uma compra no cartão. */
export const MAXIMO_PARCELAS_COMPRA = 24;

/**
 * Cria o lançamento de um gasto.
 *
 * @param {object} dados
 * @param {number} dados.valorCentavos  Maior que zero.
 * @param {string} dados.categoriaId    id da categoria do gasto.
 * @param {string} dados.formaPagamento Ex.: "Pix".
 * @param {string} [dados.data]         "AAAA-MM-DD". Se omitida, é hoje (fuso local).
 * @param {string} [dados.descricao]    Texto livre opcional.
 * @param {number} [dados.parcelas]     1 a 24 (só conta em compra no cartão). Padrão: 1.
 * @param {object} [opcoes]             { agora, gerarId }
 */
export function criarLancamento(
  { valorCentavos, categoriaId, formaPagamento, data, descricao = '', parcelas = 1 },
  opcoes = {},
) {
  const dataFinal = data ?? hojeLocal(opcoes.agora);

  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAXIMO_PARCELAS_COMPRA) {
    throw new ErroValidacao('parcelas', `O número de parcelas deve ser de 1 a ${MAXIMO_PARCELAS_COMPRA}.`);
  }

  if (!ehDataValida(dataFinal)) {
    throw new ErroValidacao('data', `Data inválida: "${dataFinal}". Use o formato AAAA-MM-DD.`);
  }
  if (typeof descricao !== 'string') {
    throw new ErroValidacao('descricao', 'A descrição deve ser um texto.');
  }

  return {
    ...criarBase(opcoes),
    valorCentavos: exigirCentavos(valorCentavos, 'valorCentavos', 'O valor do gasto', { permitirZero: false }),
    categoriaId: exigirTexto(categoriaId, 'categoriaId', 'A categoria'),
    formaPagamento: exigirTexto(formaPagamento, 'formaPagamento', 'A forma de pagamento'),
    data: dataFinal,
    descricao: descricao.trim(),
    // Só faz diferença numa compra no cartão: o valor é dividido nas faturas
    // seguintes (src/fluxo.js). Lançamentos antigos, sem o campo, valem 1.
    parcelas,
  };
}

/* ------------------------------------------------------------------ */
/* Mês                                                                */
/* ------------------------------------------------------------------ */

/**
 * Cria o registro de um mês.
 *
 * Dinheiro disponível no mês = saldo inicial + renda prevista.
 * Ex.: R$ 300 na conta no dia 1 e salário de R$ 2.000 no dia 5
 * → o mês tem R$ 2.300 para fixos e gastos.
 *
 * @param {object}  dados
 * @param {string}  dados.mes                     "AAAA-MM".
 * @param {number}  dados.saldoInicialCentavos    Saldo na conta no começo do mês. Pode ser
 *                                                negativo (mês que já começa no vermelho).
 * @param {number}  [dados.rendaPrevistaCentavos] O que vai entrar durante o mês (salário etc.). Padrão: 0.
 * @param {boolean} [dados.saldoConfirmado]       false quando o saldo inicial foi só SUGERIDO
 *                                                pelo app na virada do mês e a pessoa ainda
 *                                                não confirmou. Padrão: true.
 * @param {object}  [opcoes]                      { agora, gerarId }
 */
export function criarMes(
  { mes, saldoInicialCentavos, rendaPrevistaCentavos = 0, saldoConfirmado = true },
  opcoes = {},
) {
  if (!Number.isSafeInteger(saldoInicialCentavos)) {
    throw new ErroValidacao(
      'saldoInicialCentavos',
      'O saldo inicial deve ser um número inteiro de centavos (ex.: 150000 para R$ 1.500,00).',
    );
  }
  if (typeof saldoConfirmado !== 'boolean') {
    throw new ErroValidacao('saldoConfirmado', 'saldoConfirmado deve ser true ou false.');
  }

  return {
    ...criarBase(opcoes),
    mes: exigirMes(mes, 'mes', 'O mês'),
    saldoInicialCentavos,
    rendaPrevistaCentavos: exigirCentavos(
      rendaPrevistaCentavos, 'rendaPrevistaCentavos', 'A renda prevista', { permitirZero: true },
    ),
    saldoConfirmado,
    // Valor de um fixo só neste mês, por id do fixo: { "id-do-fixo": 25000 }.
    // Ex.: o dentista, que custa um valor diferente a cada mês.
    ajustesFixos: {},
    // Situação de cada conta fixa NESTE mês, por id do fixo:
    // { "id-do-fixo": "pago" } ou "dispensado" ou "previsto".
    // Conta sem entrada aqui está "previsto" (ou "pago", se for automática e já venceu).
    statusFixos: {},
  };
}

/**
 * Define o valor de um fixo apenas neste mês, sem mudar os outros meses.
 * Para mudar o valor em todos os meses, use ajustarValorFixo.
 *
 * @param {object} registroMes Mês criado por criarMes.
 * @param {object} fixo
 * @param {number} valorCentavos
 * @param {object} [opcoes]    { agora }
 */
export function ajustarFixoNoMes(registroMes, fixo, valorCentavos, { agora = new Date() } = {}) {
  if (!fixoAtivoNoMes(fixo, registroMes.mes)) {
    throw new ErroValidacao('fixo', `O fixo "${fixo.nome}" não está ativo em ${registroMes.mes}.`);
  }

  return {
    ...registroMes,
    ajustesFixos: {
      ...registroMes.ajustesFixos,
      [fixo.id]: exigirCentavos(valorCentavos, 'valorCentavos', 'O valor do fixo', { permitirZero: true }),
    },
    atualizadoEm: agora.toISOString(),
  };
}

/** Situações possíveis de uma conta fixa num mês. */
export const STATUS_FIXO = Object.freeze(['previsto', 'pago', 'dispensado']);

/**
 * Valor que um fixo cobra num mês:
 * - conta DISPENSADA no mês (ex.: não fui ao dentista): zero;
 * - com ajuste naquele mês (ou valor real pago), o valor do ajuste;
 * - senão, o valor padrão do fixo.
 *
 * Meses gravados antes do campo "statusFixos" existir não têm o campo:
 * nesse caso, nenhuma conta está dispensada.
 *
 * @param {object} fixo
 * @param {object} registroMes
 * @returns {number} Centavos.
 */
export function valorDoFixoNoMes(fixo, registroMes) {
  if (registroMes.statusFixos?.[fixo.id] === 'dispensado') return 0;
  return registroMes.ajustesFixos[fixo.id] ?? fixo.valorCentavos;
}

/* ------------------------------------------------------------------ */
/* Exclusão suave (vale para qualquer entidade)                       */
/* ------------------------------------------------------------------ */

/**
 * Marca um registro como excluído, sem apagá-lo.
 * Se ele já estava excluído, devolve o mesmo registro sem mudanças.
 *
 * @param {object} registro Categoria, fixo, lançamento ou mês.
 * @param {object} [opcoes] { agora }
 */
export function excluirRegistro(registro, { agora = new Date() } = {}) {
  if (registro.excluidoEm !== null) return registro;

  const momento = agora.toISOString();
  return { ...registro, excluidoEm: momento, atualizadoEm: momento };
}
