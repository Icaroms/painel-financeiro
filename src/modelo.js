/**
 * Modelo de dados do Painel Financeiro (Fase 01 - MVP).
 *
 * Entidades:
 * - Categoria:  onde o gasto se encaixa (iFood, Uber...) e quanto pode ir para ela no mês.
 * - Fixo:       conta que se repete todo mês (assinatura, parcela, mensalidade).
 * - Lançamento: um gasto registrado.
 * - Mês:        o saldo com que o mês começa e os ajustes de valor de fixos naquele mês.
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
  { nome, valorCentavos, diaVencimento, formaPagamento, mesInicial, mesFinal = null },
  opcoes = {},
) {
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

/**
 * Cria o lançamento de um gasto.
 *
 * @param {object} dados
 * @param {number} dados.valorCentavos  Maior que zero.
 * @param {string} dados.categoriaId    id da categoria do gasto.
 * @param {string} dados.formaPagamento Ex.: "Pix".
 * @param {string} [dados.data]         "AAAA-MM-DD". Se omitida, é hoje (fuso local).
 * @param {string} [dados.descricao]    Texto livre opcional.
 * @param {object} [opcoes]             { agora, gerarId }
 */
export function criarLancamento(
  { valorCentavos, categoriaId, formaPagamento, data, descricao = '' },
  opcoes = {},
) {
  const dataFinal = data ?? hojeLocal(opcoes.agora);

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
  };
}

/* ------------------------------------------------------------------ */
/* Mês                                                                */
/* ------------------------------------------------------------------ */

/**
 * Cria o registro de um mês.
 *
 * @param {object} dados
 * @param {string} dados.mes                  "AAAA-MM".
 * @param {number} dados.saldoInicialCentavos Saldo no começo do mês. Pode ser
 *                                            negativo (mês que já começa no vermelho).
 * @param {object} [opcoes]                   { agora, gerarId }
 */
export function criarMes({ mes, saldoInicialCentavos }, opcoes = {}) {
  if (!Number.isSafeInteger(saldoInicialCentavos)) {
    throw new ErroValidacao(
      'saldoInicialCentavos',
      'O saldo inicial deve ser um número inteiro de centavos (ex.: 150000 para R$ 1.500,00).',
    );
  }

  return {
    ...criarBase(opcoes),
    mes: exigirMes(mes, 'mes', 'O mês'),
    saldoInicialCentavos,
    // Valor de um fixo só neste mês, por id do fixo: { "id-do-fixo": 25000 }.
    // Ex.: o dentista, que custa um valor diferente a cada mês.
    ajustesFixos: {},
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

/**
 * Valor que um fixo cobra num mês: o ajuste daquele mês, se existir;
 * senão, o valor padrão do fixo.
 *
 * @param {object} fixo
 * @param {object} registroMes
 * @returns {number} Centavos.
 */
export function valorDoFixoNoMes(fixo, registroMes) {
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
