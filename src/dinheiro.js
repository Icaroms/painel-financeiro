/**
 * Dinheiro no Painel Financeiro.
 *
 * Regra de ouro: todo valor é guardado em CENTAVOS, como número inteiro.
 * R$ 118,51 é guardado como 11851.
 *
 * Motivo: o JavaScript erra contas com casas decimais
 * (0.1 + 0.2 dá 0.30000000000000004). Com inteiros, a conta é exata.
 * A conversão para reais acontece só na hora de mostrar na tela.
 */

import { ErroValidacao } from './erros.js';

/**
 * Formato brasileiro aceito na digitação:
 * - vírgula separa os centavos: "118,51"
 * - ponto separa os milhares (opcional): "1.234,56" ou "1234,56"
 * - centavos são opcionais: "16"
 */
const PADRAO_VALOR = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

const formatadorReais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Converte o texto digitado pela pessoa em centavos.
 *
 * Exemplos:
 *   "118,51"    → 11851
 *   "16"        → 1600
 *   "1.234,5"   → 123450
 *   "R$ 34,90"  → 3490
 *
 * A conversão é feita com texto e inteiros, sem passar por número
 * decimal, para não herdar o erro de arredondamento do JavaScript.
 *
 * @param {string} texto
 * @returns {number} Valor em centavos (inteiro, zero ou positivo).
 * @throws {ErroValidacao} Se o texto não estiver no formato brasileiro.
 */
export function reaisParaCentavos(texto) {
  if (typeof texto !== 'string') {
    throw new ErroValidacao('valor', 'O valor precisa ser digitado como texto, ex.: "118,51".');
  }

  // Aceita o valor com ou sem o "R$" na frente.
  const limpo = texto.trim().replace(/^R\$\s*/, '');
  const partes = PADRAO_VALOR.exec(limpo);

  if (!partes) {
    throw new ErroValidacao('valor', `Valor inválido: "${texto}". Use o formato 118,51.`);
  }

  const reais = Number(partes[1].replaceAll('.', ''));
  // "5" nos centavos significa 50 centavos, por isso o padEnd.
  const centavos = partes[2] ? Number(partes[2].padEnd(2, '0')) : 0;
  const total = reais * 100 + centavos;

  if (!Number.isSafeInteger(total)) {
    throw new ErroValidacao('valor', 'Valor grande demais.');
  }

  return total;
}

/**
 * Formata centavos para exibição: 11851 → "R$ 118,51".
 *
 * Atenção: o Intl usa um espaço "não separável" (\u00a0) entre o
 * "R$" e o número. Na tela é idêntico a um espaço comum.
 *
 * @param {number} centavos Inteiro (pode ser negativo, ex.: saldo).
 * @returns {string}
 */
export function formatarCentavos(centavos) {
  if (!Number.isSafeInteger(centavos)) {
    throw new ErroValidacao('centavos', `Esperado um número inteiro de centavos, recebido: ${centavos}.`);
  }
  return formatadorReais.format(centavos / 100);
}
