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
