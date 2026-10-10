/**
 * Ações e FIIs na carteira (Fase 04, parte 4.2b).
 *
 * Decisão de 10/10/2026: ações e FIIs são registrados POR OPERAÇÃO (cada
 * compra e cada venda, com data, quantidade, preço e custos). Com isso o app
 * calcula a posição, o preço médio e o lucro de cada venda, que a parte 4.3
 * (Receita) vai usar.
 *
 * Um ativo fica na mesma lista "investimentos" da carteira (src/carteira.js):
 *
 *   { id, criadoEm, atualizadoEm, excluidoEm,
 *     tipo: 'acao' | 'fii',
 *     nome: 'PETR4',                 ← o código de negociação
 *     operacoes: [{ id, tipo: 'compra' | 'venda', data, quantidade, precoCentavos, custosCentavos }],
 *     cotacaoCentavos: 3250 | null,  ← digitada pela pessoa
 *     cotacaoEm: '2026-10-10' | null }
 *
 * Preço médio (a regra que a Receita usa para ações e FIIs):
 * - compra: o custo da posição soma quantidade × preço + custos (corretagem,
 *   taxas); preço médio = custo da posição ÷ quantidade;
 * - venda: o preço médio não muda; sai da posição o custo das unidades vendidas
 *   (preço médio × quantidade vendida). Lucro = valor da venda − custos da
 *   venda − custo das unidades vendidas.
 * - posição zerada: o custo volta a zero (a próxima compra começa do zero).
 *
 * Contas em centavos inteiros. O custo que sai numa venda é arredondado para
 * o centavo; quando a posição zera, o que sobrou do arredondamento é zerado.
 *
 * O app só mostra números: nunca diz o que comprar ou vender.
 * Funções puras: testadas no Node. A tela fica em src/ui/investir.js.
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida, mesDaData } from './datas.js';

/** Tipos registrados por operação. */
export const TIPOS_POR_OPERACAO = Object.freeze(['acao', 'fii']);

/** Maior quantidade aceita numa operação (evita erro de digitação gigante). */
export const QUANTIDADE_MAXIMA = 10_000_000;

/** Código de negociação: 4 letras + 1 ou 2 números, com "F" no fracionário (PETR4, HGLG11, PETR4F). */
const PADRAO_CODIGO = /^[A-Z]{4}\d{1,2}F?$/;

/** É um tipo registrado por operação (ação ou FII)? */
export const ehPorOperacao = (tipo) => TIPOS_POR_OPERACAO.includes(tipo);

/** Nome da unidade: "ação"/"ações" ou "cota"/"cotas". */
export function unidade(tipo, quantidade) {
  if (tipo === 'fii') return quantidade === 1 ? 'cota' : 'cotas';
  return quantidade === 1 ? 'ação' : 'ações';
}

/** Gera o id padrão. Funciona no navegador e no Node 20+. */
const gerarIdPadrao = () => globalThis.crypto.randomUUID();

/* ------------------------------------------------------------------ */
/* Posição e preço médio                                              */
/* ------------------------------------------------------------------ */

/** Operações em ordem: por data; no mesmo dia, na ordem em que foram registradas. */
function emOrdem(operacoes) {
  return operacoes
    .map((operacao, indice) => ({ operacao, indice }))
    .sort((a, b) => a.operacao.data.localeCompare(b.operacao.data) || a.indice - b.indice)
    .map(({ operacao }) => operacao);
}

/**
 * Calcula a posição de um ativo a partir das operações.
 *
 * @param {object} ativo Um investimento do tipo 'acao' ou 'fii'.
 * @returns {{
 *   quantidade: number,          // unidades em carteira hoje
 *   custoCentavos: number,       // custo da posição (é o "valor aplicado")
 *   precoMedioCentavos: number,  // custo ÷ quantidade, arredondado (0 com a posição zerada)
 *   vendas: { id: string, data: string, mes: string, quantidade: number, valorVendaCentavos: number,
 *             custosCentavos: number, custoDasUnidadesCentavos: number, lucroCentavos: number }[],
 *   lucroVendasCentavos: number, // soma do lucro (ou prejuízo) de todas as vendas
 *   problema: string|null        // venda maior que a posição na data (dados inconsistentes)
 * }}
 */
export function posicaoDoAtivo(ativo) {
  let quantidade = 0;
  let custoCentavos = 0;
  const vendas = [];
  let problema = null;

  for (const op of emOrdem(ativo.operacoes ?? [])) {
    if (op.tipo === 'compra') {
      quantidade += op.quantidade;
      custoCentavos += op.quantidade * op.precoCentavos + op.custosCentavos;
      continue;
    }
    // Venda.
    if (op.quantidade > quantidade) {
      problema ??= `Venda de ${op.quantidade} em ${dataLonga(op.data)}: na data, a carteira tinha só ${quantidade} ` +
        `${unidade(ativo.tipo, quantidade)} de ${ativo.nome}.`;
      continue;
    }
    const custoDasUnidadesCentavos = op.quantidade === quantidade
      ? custoCentavos
      : Math.round((custoCentavos * op.quantidade) / quantidade);
    const valorVendaCentavos = op.quantidade * op.precoCentavos;
    vendas.push({
      id: op.id,
      data: op.data,
      mes: mesDaData(op.data),
      quantidade: op.quantidade,
      valorVendaCentavos,
      custosCentavos: op.custosCentavos,
      custoDasUnidadesCentavos,
      lucroCentavos: valorVendaCentavos - op.custosCentavos - custoDasUnidadesCentavos,
    });
    quantidade -= op.quantidade;
    custoCentavos -= custoDasUnidadesCentavos;
    if (quantidade === 0) custoCentavos = 0;
  }

  return {
    quantidade,
    custoCentavos,
    precoMedioCentavos: quantidade === 0 ? 0 : Math.round(custoCentavos / quantidade),
    vendas,
    lucroVendasCentavos: vendas.reduce((soma, v) => soma + v.lucroCentavos, 0),
    problema,
  };
}

/**
 * Valor aplicado e valor atual do ativo, para o resumo da carteira.
 * Sem cotação digitada, o valor atual é o próprio custo (rendimento zero).
 *
 * @param {object} ativo
 * @returns {{ aplicadoCentavos: number, atualCentavos: number, semCotacao: boolean, encerrado: boolean }}
 */
export function valoresDoAtivo(ativo) {
  const { quantidade, custoCentavos } = posicaoDoAtivo(ativo);
  const semCotacao = ativo.cotacaoCentavos === null || ativo.cotacaoCentavos === undefined;
  return {
    aplicadoCentavos: custoCentavos,
    atualCentavos: semCotacao ? custoCentavos : quantidade * ativo.cotacaoCentavos,
    semCotacao,
    encerrado: quantidade === 0,
  };
}

/** "2026-03-10" → "10/03/2026". */
function dataLonga(data) {
  return data.split('-').reverse().join('/');
}

/* ------------------------------------------------------------------ */
/* Validações                                                         */
/* ------------------------------------------------------------------ */

/** Confere e normaliza uma operação. */
function validarOperacao({ tipo, data, quantidade, precoCentavos, custosCentavos = 0 }, hoje) {
  if (tipo !== 'compra' && tipo !== 'venda') {
    throw new ErroValidacao('tipoOperacao', 'Escolha se é compra ou venda.');
  }
  if (!ehDataValida(data)) {
    throw new ErroValidacao('data', 'Data da operação: escolha uma data válida.');
  }
  if (data > hoje) {
    throw new ErroValidacao('data', 'A data da operação não pode ser depois de hoje.');
  }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAXIMA) {
    throw new ErroValidacao('quantidade', 'A quantidade deve ser um número inteiro maior que zero.');
  }
  if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) {
    throw new ErroValidacao('precoCentavos', 'O preço deve ser maior que zero.');
  }
  if (!Number.isSafeInteger(custosCentavos) || custosCentavos < 0) {
    throw new ErroValidacao('custosCentavos', 'Os custos devem ser zero ou mais.');
  }
  return { tipo, data, quantidade, precoCentavos, custosCentavos };
}

/** Confere o código de negociação e devolve em maiúsculas, sem espaços. */
export function lerCodigo(texto) {
  const codigo = String(texto ?? '').trim().toUpperCase();
  if (!PADRAO_CODIGO.test(codigo)) {
    throw new ErroValidacao('codigo', 'Código inválido. Use o código da bolsa, como PETR4, ITUB4 ou HGLG11.');
  }
  return codigo;
}

/** Ativo existente (não removido) pelo id, ou erro claro. */
function buscarAtivo(estado, id) {
  const ativo = (estado.investimentos ?? []).find((i) => i.id === id && !i.excluidoEm && ehPorOperacao(i.tipo));
  if (!ativo) throw new ErroValidacao('id', 'Este ativo não existe mais.');
  return ativo;
}

/** Troca o ativo na lista, conferindo antes se as operações continuam possíveis. */
function salvarAtivo(estado, ativo) {
  const { problema } = posicaoDoAtivo(ativo);
  if (problema) throw new ErroValidacao('quantidade', problema);
  const existe = (estado.investimentos ?? []).some((i) => i.id === ativo.id);
  return {
    ...estado,
    investimentos: existe
      ? estado.investimentos.map((i) => (i.id === ativo.id ? ativo : i))
      : [...(estado.investimentos ?? []), ativo],
  };
}

/* ------------------------------------------------------------------ */
/* Cadastro, operações, cotação e remoção                             */
/* ------------------------------------------------------------------ */

/**
 * Cadastra uma ação ou um FII já com a primeira compra.
 *
 * @param {object} estado
 * @param {object} dados
 * @param {'acao'|'fii'} dados.tipo
 * @param {string} dados.codigo  Ex.: "petr4" (vira "PETR4").
 * @param {object} dados.compra  { data, quantidade, precoCentavos, custosCentavos }
 * @param {object} opcoes { hoje, agora, gerarId }
 * @returns {object} Estado novo.
 */
export function adicionarAtivo(estado, { tipo, codigo, compra }, { hoje, agora = new Date(), gerarId = gerarIdPadrao }) {
  if (!ehPorOperacao(tipo)) throw new ErroValidacao('tipo', 'Escolha Ação ou FII.');
  const nome = lerCodigo(codigo);
  const repetido = (estado.investimentos ?? []).some((i) => !i.excluidoEm && ehPorOperacao(i.tipo) && i.nome === nome);
  if (repetido) {
    throw new ErroValidacao('codigo', `${nome} já está na carteira: use "Nova operação" nele.`);
  }
  const momento = agora.toISOString();
  return salvarAtivo(estado, {
    id: gerarId(),
    criadoEm: momento,
    atualizadoEm: momento,
    excluidoEm: null,
    tipo,
    nome,
    operacoes: [{ id: gerarId(), ...validarOperacao({ ...compra, tipo: 'compra' }, hoje) }],
    cotacaoCentavos: null,
    cotacaoEm: null,
  });
}

/**
 * Registra uma compra ou venda num ativo da carteira.
 * Uma venda maior do que a posição na data é recusada com erro claro.
 *
 * @param {object} estado
 * @param {string} id Id do ativo.
 * @param {object} operacao { tipo: 'compra'|'venda', data, quantidade, precoCentavos, custosCentavos }
 * @param {object} opcoes { hoje, agora, gerarId }
 * @returns {object} Estado novo.
 */
export function adicionarOperacao(estado, id, operacao, { hoje, agora = new Date(), gerarId = gerarIdPadrao }) {
  const ativo = buscarAtivo(estado, id);
  return salvarAtivo(estado, {
    ...ativo,
    operacoes: [...ativo.operacoes, { id: gerarId(), ...validarOperacao(operacao, hoje) }],
    atualizadoEm: agora.toISOString(),
  });
}

/**
 * Remove uma operação (ex.: lançada errada). Recusa se uma venda depois
 * dela ficaria maior que a posição, e se for a única operação do ativo
 * (nesse caso, remova o ativo inteiro).
 *
 * @param {object} estado
 * @param {string} id Id do ativo.
 * @param {string} idOperacao
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function removerOperacao(estado, id, idOperacao, { agora = new Date() } = {}) {
  const ativo = buscarAtivo(estado, id);
  if (!ativo.operacoes.some((o) => o.id === idOperacao)) {
    throw new ErroValidacao('operacao', 'Esta operação não existe mais.');
  }
  if (ativo.operacoes.length === 1) {
    throw new ErroValidacao('operacao', `É a única operação de ${ativo.nome}: para tirar da carteira, use "Remover" no ativo.`);
  }
  return salvarAtivo(estado, {
    ...ativo,
    operacoes: ativo.operacoes.filter((o) => o.id !== idOperacao),
    atualizadoEm: agora.toISOString(),
  });
}

/**
 * Guarda a cotação digitada (preço de UMA ação ou cota hoje).
 *
 * @param {object} estado
 * @param {string} id
 * @param {number} cotacaoCentavos Maior que zero.
 * @param {object} opcoes { hoje, agora } A cotação fica com a data de hoje.
 * @returns {object} Estado novo.
 */
export function atualizarCotacao(estado, id, cotacaoCentavos, { hoje, agora = new Date() }) {
  const ativo = buscarAtivo(estado, id);
  if (!Number.isSafeInteger(cotacaoCentavos) || cotacaoCentavos <= 0) {
    throw new ErroValidacao('cotacaoCentavos', 'A cotação deve ser maior que zero.');
  }
  return salvarAtivo(estado, { ...ativo, cotacaoCentavos, cotacaoEm: hoje, atualizadoEm: agora.toISOString() });
}
