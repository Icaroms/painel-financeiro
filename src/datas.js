/**
 * Utilitários de datas do Painel Financeiro.
 *
 * Convenções usadas em todo o app:
 * - Data: texto "AAAA-MM-DD" (ex.: "2026-11-03"), sempre no fuso do aparelho.
 * - Mês:  texto "AAAA-MM"    (ex.: "2026-11").
 *
 * Nesse formato, a ordem alfabética é igual à ordem cronológica,
 * então dá para comparar direto: "2026-10" < "2026-11" é true.
 */

const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PADRAO_MES = /^(\d{4})-(\d{2})$/;

/** Completa com zero à esquerda: 3 → "03". */
function doisDigitos(numero) {
  return String(numero).padStart(2, '0');
}

/**
 * Data de hoje no fuso LOCAL do aparelho, no formato "AAAA-MM-DD".
 *
 * Por que não usar new Date().toISOString()? Porque ele devolve a data
 * em UTC. Em Manaus (UTC-4), um gasto lançado às 21h do dia 3 seria
 * gravado como dia 4. Aqui usamos getFullYear/getMonth/getDate, que
 * respeitam o fuso do aparelho.
 *
 * @param {Date} [agora] Momento de referência (usado nos testes).
 * @returns {string}
 */
export function hojeLocal(agora = new Date()) {
  const ano = agora.getFullYear();
  const mes = doisDigitos(agora.getMonth() + 1); // getMonth() começa em 0
  const dia = doisDigitos(agora.getDate());
  return `${ano}-${mes}-${dia}`;
}

/**
 * Confere se o texto é uma data real no formato "AAAA-MM-DD".
 * Rejeita datas que não existem, como "2026-02-30".
 *
 * @param {unknown} texto
 * @returns {boolean}
 */
export function ehDataValida(texto) {
  if (typeof texto !== 'string') return false;

  const partes = PADRAO_DATA.exec(texto);
  if (!partes) return false;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  // O Date "corrige" datas impossíveis (30/02 vira 02/03).
  // Se depois da correção a data mudou, ela não existia.
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

/**
 * Confere se o texto é um mês válido no formato "AAAA-MM".
 *
 * @param {unknown} texto
 * @returns {boolean}
 */
export function ehMesValido(texto) {
  if (typeof texto !== 'string') return false;

  const partes = PADRAO_MES.exec(texto);
  if (!partes) return false;

  const mes = Number(partes[2]);
  return mes >= 1 && mes <= 12;
}

/**
 * Mês ao qual uma data pertence: "2026-11-03" → "2026-11".
 *
 * @param {string} data Data válida no formato "AAAA-MM-DD".
 * @returns {string}
 */
export function mesDaData(data) {
  if (!ehDataValida(data)) {
    throw new TypeError(`Data inválida: "${data}". Use o formato AAAA-MM-DD.`);
  }
  return data.slice(0, 7);
}

/**
 * Quantos dias tem um mês: "2026-11" → 30, "2028-02" → 29.
 *
 * Truque: o dia 0 de um mês é o último dia do mês anterior.
 * Date.UTC(ano, mes, 0), com o mês começando em 0, cai no último dia
 * do mês que queremos.
 *
 * @param {string} mes "AAAA-MM".
 * @returns {number}
 */
export function diasNoMes(mes) {
  if (!ehMesValido(mes)) {
    throw new TypeError(`Mês inválido: "${mes}". Use o formato AAAA-MM.`);
  }
  const ano = Number(mes.slice(0, 4));
  const numeroMes = Number(mes.slice(5, 7));
  return new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate();
}

/**
 * Dia do mês de uma data: "2026-11-03" → 3.
 *
 * @param {string} data "AAAA-MM-DD".
 * @returns {number}
 */
export function diaDaData(data) {
  if (!ehDataValida(data)) {
    throw new TypeError(`Data inválida: "${data}". Use o formato AAAA-MM-DD.`);
  }
  return Number(data.slice(8, 10));
}

/**
 * Soma (ou subtrai) meses: somarMeses("2026-11", 3) → "2027-02";
 * somarMeses("2026-01", -1) → "2025-12".
 *
 * @param {string} mes        "AAAA-MM".
 * @param {number} quantidade Inteiro (negativo volta no tempo).
 * @returns {string} "AAAA-MM".
 */
export function somarMeses(mes, quantidade) {
  if (!ehMesValido(mes)) {
    throw new TypeError(`Mês inválido: "${mes}". Use o formato AAAA-MM.`);
  }
  if (!Number.isInteger(quantidade)) {
    throw new TypeError(`A quantidade de meses deve ser um número inteiro, recebido: ${quantidade}.`);
  }

  // Conta tudo em "meses desde o ano 0" e converte de volta.
  const total = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5, 7)) - 1) + quantidade;
  const ano = Math.floor(total / 12);
  const numeroMes = (total % 12) + 1;
  return `${ano}-${String(numeroMes).padStart(2, '0')}`;
}

/**
 * Quantos meses existem de um mês até outro, contando os dois:
 * mesesEntre("2026-10", "2026-12") → 3.
 *
 * @param {string} inicio "AAAA-MM".
 * @param {string} fim    "AAAA-MM" (igual ou depois do início).
 * @returns {number}
 */
export function mesesEntre(inicio, fim) {
  if (!ehMesValido(inicio) || !ehMesValido(fim)) {
    throw new TypeError(`Meses inválidos: "${inicio}" e "${fim}". Use o formato AAAA-MM.`);
  }
  const contar = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return contar(fim) - contar(inicio) + 1;
}
