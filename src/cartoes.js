/**
 * Cartões de crédito do Painel Financeiro (Fase 02, parte 2.1).
 *
 * Um cartão é uma forma de pagamento com dados a mais: limite, dia de
 * fechamento e dia de vencimento da fatura. Ele fica na lista "cartoes"
 * dos dados, ligado à forma de pagamento pelo nome:
 *
 *   formasPagamento: ["Pix", "Cartão Nubank"]
 *   cartoes: [{ formaPagamento: "Cartão Nubank", limiteCentavos: 300000,
 *               diaFechamento: 3, diaVencimento: 10, ... }]
 *
 * Regra da fatura (confirmada em 08/10/2026):
 * - compra ANTES do dia de fechamento entra na fatura que fecha naquele mês;
 * - compra NO dia do fechamento ou depois entra na fatura seguinte;
 * - a fatura vence no primeiro dia de vencimento depois do fechamento.
 * Ex.: fecha dia 3, vence dia 10; compra em 20/09 → fecha 03/10 → paga em 10/10.
 *
 * As compras no cartão pesam na fatura (parte 2.2, src/fluxo.js) e as
 * contas fixas parceladas podem virar compras no cartão (parte 2.3,
 * src/conversao.js).
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/configurar.js.
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida, mesDaData, diasNoMes, somarMeses } from './datas.js';

/** Monta "AAAA-MM-DD" a partir do mês e do dia, prendendo o dia ao fim do mês (31 → 30 em novembro). */
function dataNoMes(mes, dia) {
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, '0')}`;
}

/** Exige um dia de 1 a 31. */
function exigirDia(valor, campo, rotulo) {
  if (!Number.isInteger(valor) || valor < 1 || valor > 31) {
    throw new ErroValidacao(campo, `${rotulo} deve ser um número de 1 a 31.`);
  }
  return valor;
}

/**
 * Cria os dados de um cartão.
 *
 * @param {object} dados
 * @param {string} dados.formaPagamento Nome da forma de pagamento (ex.: "Cartão Nubank").
 * @param {number} dados.limiteCentavos Limite total, maior que zero.
 * @param {number} dados.diaFechamento  1 a 31.
 * @param {number} dados.diaVencimento  1 a 31, diferente do fechamento.
 * @param {object} [opcoes]             { agora }
 * @returns {object}
 */
export function criarCartao({ formaPagamento, limiteCentavos, diaFechamento, diaVencimento }, { agora = new Date() } = {}) {
  if (typeof formaPagamento !== 'string' || formaPagamento.trim() === '') {
    throw new ErroValidacao('formaPagamento', 'Escolha a forma de pagamento do cartão.');
  }
  if (!Number.isSafeInteger(limiteCentavos) || limiteCentavos <= 0) {
    throw new ErroValidacao('limiteCentavos', 'O limite deve ser maior que zero.');
  }
  exigirDia(diaFechamento, 'diaFechamento', 'O dia de fechamento');
  exigirDia(diaVencimento, 'diaVencimento', 'O dia de vencimento');
  if (diaFechamento === diaVencimento) {
    throw new ErroValidacao('diaVencimento', 'O vencimento não pode ser no mesmo dia do fechamento.');
  }

  const momento = agora.toISOString();
  return {
    formaPagamento: formaPagamento.trim(),
    limiteCentavos,
    diaFechamento,
    diaVencimento,
    criadoEm: momento,
    atualizadoEm: momento,
  };
}

/**
 * Cartão ligado a uma forma de pagamento, ou null se ela não é cartão.
 * Dados gravados antes da Fase 02 não têm a lista e não têm cartões.
 *
 * @param {object} estado
 * @param {string} formaPagamento
 * @returns {object|null}
 */
export function cartaoDaForma(estado, formaPagamento) {
  return (estado.cartoes ?? []).find((c) => c.formaPagamento === formaPagamento) ?? null;
}

/**
 * Cadastra um cartão novo ou atualiza o cartão de uma forma de pagamento.
 *
 * @param {object} estado
 * @param {object} dados  Mesmos campos de criarCartao.
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function salvarCartao(estado, dados, opcoes = {}) {
  const novo = criarCartao(dados, opcoes);
  if (!estado.formasPagamento.includes(novo.formaPagamento)) {
    throw new ErroValidacao('formaPagamento', `"${novo.formaPagamento}" não está nas formas de pagamento.`);
  }

  const cartoes = estado.cartoes ?? [];
  const existente = cartoes.find((c) => c.formaPagamento === novo.formaPagamento);
  if (!existente) {
    return { ...estado, cartoes: [...cartoes, novo] };
  }
  const atualizado = { ...novo, criadoEm: existente.criadoEm };
  return { ...estado, cartoes: cartoes.map((c) => (c === existente ? atualizado : c)) };
}

/**
 * Diz se um cartão tem compras convertidas de contas fixas (parte 2.3).
 * Essas compras só existem nas faturas: sem o cartão, as parcelas
 * sumiriam do saldo. Por isso o cartão não pode deixar de existir antes
 * de a conversão ser desfeita.
 *
 * @param {object} estado
 * @param {string} formaPagamento
 * @returns {boolean}
 */
export function temComprasConvertidas(estado, formaPagamento) {
  return estado.lancamentos.some(
    (l) => l.excluidoEm === null && l.conversao && l.formaPagamento === formaPagamento,
  );
}

/** Mensagem de quando o cartão tem compras convertidas. */
function exigirSemConvertidas(estado, formaPagamento) {
  if (temComprasConvertidas(estado, formaPagamento)) {
    throw new ErroValidacao(
      'formaPagamento',
      `"${formaPagamento}" tem parcelas convertidas de contas fixas. Desfaça a conversão em "Parcelas antigas no cartão" antes.`,
    );
  }
}

/**
 * Deixa uma forma de pagamento de ser cartão (ela continua na lista de formas).
 * Não é permitido enquanto o cartão tiver compras convertidas.
 *
 * @param {object} estado
 * @param {string} formaPagamento
 * @returns {object} Estado novo.
 */
export function removerCartao(estado, formaPagamento) {
  if (!cartaoDaForma(estado, formaPagamento)) {
    throw new ErroValidacao('formaPagamento', `"${formaPagamento}" não é um cartão cadastrado.`);
  }
  exigirSemConvertidas(estado, formaPagamento);
  return { ...estado, cartoes: estado.cartoes.filter((c) => c.formaPagamento !== formaPagamento) };
}

/**
 * Em qual fatura uma compra entra e quando ela é paga.
 *
 * @param {object} cartao
 * @param {string} data Data da compra, "AAAA-MM-DD".
 * @returns {{ fechamento: string, vencimento: string, mesFatura: string }}
 *   fechamento e vencimento em "AAAA-MM-DD"; mesFatura = mês do vencimento ("AAAA-MM"),
 *   que é o mês em que o dinheiro sai da conta.
 */
export function faturaDaCompra(cartao, data) {
  if (!ehDataValida(data)) {
    throw new ErroValidacao('data', `Data inválida: "${data}". Use o formato AAAA-MM-DD.`);
  }

  // Compra antes do fechamento: fatura deste mês. No dia ou depois: a seguinte.
  const mesCompra = mesDaData(data);
  const fechaNoMesDaCompra = dataNoMes(mesCompra, cartao.diaFechamento);
  const mesFechamento = data < fechaNoMesDaCompra ? mesCompra : somarMeses(mesCompra, 1);
  const fechamento = dataNoMes(mesFechamento, cartao.diaFechamento);

  // Vence no mesmo mês do fechamento se o dia de vencimento vem depois; senão, no mês seguinte.
  const mesVencimento = cartao.diaVencimento > cartao.diaFechamento
    ? mesFechamento
    : somarMeses(mesFechamento, 1);
  const vencimento = dataNoMes(mesVencimento, cartao.diaVencimento);

  return { fechamento, vencimento, mesFatura: mesVencimento };
}

/**
 * Data de vencimento da fatura que vence num mês: vencimentoNoMes(cartao, "2026-11") → "2026-11-10".
 *
 * @param {object} cartao
 * @param {string} mes "AAAA-MM".
 * @returns {string} "AAAA-MM-DD".
 */
export function vencimentoNoMes(cartao, mes) {
  return dataNoMes(mes, cartao.diaVencimento);
}

/**
 * Melhor dia de compra: o dia do fechamento. Comprando a partir dele,
 * a compra só é paga na fatura seguinte (o prazo mais longo).
 *
 * @param {object} cartao
 * @returns {number}
 */
export function melhorDiaDeCompra(cartao) {
  return cartao.diaFechamento;
}
