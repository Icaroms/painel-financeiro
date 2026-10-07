/**
 * Primeiro acesso: começar do zero ou ver o app com dados de exemplo.
 *
 * Os dados guardam de onde vieram, no campo "origem":
 * - "exemplo": dados fictícios (src/dados-exemplo.js), só para conhecer o app;
 * - "usuario": dados de verdade, começados do zero.
 * Dados gravados antes deste campo existir não têm "origem" e são tratados
 * como dados de verdade, para o app nunca chamar dados reais de "exemplo".
 *
 * Funções puras: testadas no Node.
 */

import { mesDaData } from './datas.js';
import { criarCategoria, criarMes } from './modelo.js';

/** Categorias e formas de pagamento com que o "começar do zero" já vem. */
export const CATEGORIAS_INICIAIS = Object.freeze(['Diversos']);
export const FORMAS_INICIAIS = Object.freeze(['Pix', 'Dinheiro']);

/**
 * Dados para começar do zero no mês de hoje.
 *
 * - O mês começa com saldo 0 e NÃO confirmado: a aba Configurar ganha o
 *   ponto âmbar e pede o saldo real da conta.
 * - Vem uma categoria ("Diversos", sem orçamento) e duas formas de
 *   pagamento, porque o app precisa de pelo menos uma de cada para lançar.
 *   O resto a pessoa cadastra em Configurar.
 *
 * @param {string} hoje "AAAA-MM-DD".
 * @param {object} [opcoes] { agora, gerarId }
 * @returns {object} Estado novo, com origem "usuario".
 */
export function criarDadosIniciais(hoje, opcoes = {}) {
  return {
    origem: 'usuario',
    meses: [
      criarMes(
        { mes: mesDaData(hoje), saldoInicialCentavos: 0, rendaPrevistaCentavos: 0, saldoConfirmado: false },
        opcoes,
      ),
    ],
    categorias: CATEGORIAS_INICIAIS.map((nome) => criarCategoria({ nome, orcamentoCentavos: 0 }, opcoes)),
    fixos: [],
    lancamentos: [],
    formasPagamento: [...FORMAS_INICIAIS],
  };
}

/**
 * Diz se os dados são o exemplo fictício.
 *
 * @param {object} estado
 * @returns {boolean}
 */
export function ehExemplo(estado) {
  return estado.origem === 'exemplo';
}

/**
 * Diz se um mês é o primeiro dos dados (não há mês anterior a ele).
 * Serve para a tela escolher o texto certo do aviso de saldo: no
 * primeiro mês, o saldo não foi "sugerido a partir do mês anterior".
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {boolean}
 */
export function ehPrimeiroMes(estado, mes) {
  return !estado.meses.some((m) => m.mes < mes);
}
