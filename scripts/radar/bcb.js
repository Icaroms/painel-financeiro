/**
 * Robô do Radar (Fase 04, parte 4.4a): taxas do Banco Central.
 *
 * Fonte oficial e gratuita: SGS (Sistema Gerenciador de Séries Temporais)
 * do Banco Central, pela API pública:
 *   https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados/ultimos/{N}?formato=json
 * Resposta: [{ "data": "DD/MM/AAAA", "valor": "14.25" }, ...] (ponto decimal).
 * Limite conferido em 10/10/2026: "ultimos" aceita no máximo 20 valores.
 *
 * Séries usadas (só as mais conhecidas; o resto é calculado):
 * - 432: meta da Selic definida pelo Copom (% ao ano). A série traz datas
 *   futuras até a próxima reunião do Copom: é normal.
 * - 12: CDI diário (% ao dia). O CDI anual é calculado em 252 dias úteis.
 * - 433: IPCA, variação do mês (%). O IPCA de 12 meses é calculado
 *   ENCADEANDO os 12 meses (somar subestima o acumulado).
 *
 * Cada valor passa por uma conferência de faixa plausível: se um código
 * estiver errado, a parte das taxas falha com o valor no erro, e o resto
 * do radar segue.
 *
 * Funções puras: testadas no Node (tests/radar-bcb.test.js).
 */

/** De onde vêm os dados (aparece no app). */
export const FONTE_BCB = Object.freeze({
  nome: 'Banco Central do Brasil (SGS)',
  pagina: 'https://www3.bcb.gov.br/sgspub/',
});

/** Códigos das séries. */
export const SERIES = Object.freeze({ selicMeta: 432, cdiDiario: 12, ipcaMensal: 433 });

/** Endereço dos últimos N valores de uma série (N de 1 a 20). */
export const enderecoDaSerie = (codigo, ultimos) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${ultimos}?formato=json`;

/** Faixas plausíveis: valor fora delas indica código errado ou dado quebrado. */
export const FAIXAS = Object.freeze({
  selicMeta: [2, 30], // % ao ano
  cdiAnual: [2, 30], // % ao ano
  ipcaMensal: [-3, 5], // % no mês
});

/**
 * Lê a resposta de uma série do SGS.
 *
 * @param {unknown} json
 * @returns {{ data: string, valor: number }[]} data em "AAAA-MM-DD", em ordem de data.
 */
export function lerSerieSgs(json) {
  if (!Array.isArray(json) || json.length === 0) throw new Error('BCB: a série veio vazia.');
  return json.map((item) => {
    const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(item?.data ?? ''));
    const texto = String(item?.valor ?? '').trim().replace(',', '.');
    // Number('') daria 0: valor vazio precisa ser recusado, não virar zero.
    const valor = texto === '' ? NaN : Number(texto);
    if (!partes || !Number.isFinite(valor)) throw new Error(`BCB: valor inválido na série: ${JSON.stringify(item)}`);
    return { data: `${partes[3]}-${partes[2]}-${partes[1]}`, valor };
  }).sort((a, b) => a.data.localeCompare(b.data));
}

/** Confere a faixa plausível. */
function exigirFaixa(valor, [minimo, maximo], nome) {
  if (!(valor >= minimo && valor <= maximo)) {
    throw new Error(`BCB: ${nome} fora da faixa plausível (${minimo} a ${maximo}): ${valor}. O código da série pode ter mudado.`);
  }
  return valor;
}

/** Arredonda em 2 casas. */
const duasCasas = (n) => Math.round(n * 100) / 100;

/**
 * CDI anual a partir do CDI diário: (1 + d/100)^252 − 1, em %.
 * @param {number} diarioPercentual Ex.: 0.0551 (% ao dia).
 * @returns {number} Ex.: 14.9 (% ao ano), com 2 casas.
 */
export function cdiAnual(diarioPercentual) {
  return duasCasas((Math.pow(1 + diarioPercentual / 100, 252) - 1) * 100);
}

/**
 * IPCA de 12 meses encadeando as variações mensais: Π(1 + m/100) − 1, em %.
 * @param {number[]} mensais Exatamente 12 variações mensais (%).
 * @returns {number} Com 2 casas.
 */
export function ipca12Meses(mensais) {
  if (mensais.length !== 12) throw new Error(`BCB: o IPCA de 12 meses precisa de 12 meses (vieram ${mensais.length}).`);
  return duasCasas((mensais.reduce((fator, m) => fator * (1 + m / 100), 1) - 1) * 100);
}

/**
 * Monta a parte "taxas" do radar.
 *
 * @param {object} series Séries já lidas (lerSerieSgs).
 * @param {{ data: string, valor: number }[]} series.selicMeta Pelo menos 1 valor.
 * @param {{ data: string, valor: number }[]} series.cdiDiario Pelo menos 1 valor.
 * @param {{ data: string, valor: number }[]} series.ipcaMensal Pelo menos 12 valores.
 * @returns {{ fonte: string, link: string,
 *   selicMeta: { valor: number, data: string },
 *   cdi: { anual: number, data: string },
 *   ipca: { mes: string, mensal: number, acumulado12m: number } }}
 */
export function montarTaxas({ selicMeta, cdiDiario, ipcaMensal }) {
  const selic = selicMeta.at(-1);
  const cdi = cdiDiario.at(-1);
  const ultimos12 = ipcaMensal.slice(-12);
  for (const m of ultimos12) exigirFaixa(m.valor, FAIXAS.ipcaMensal, 'IPCA do mês');
  const ipcaDoMes = ultimos12.at(-1);
  return {
    fonte: FONTE_BCB.nome,
    link: FONTE_BCB.pagina,
    selicMeta: { valor: exigirFaixa(selic.valor, FAIXAS.selicMeta, 'meta da Selic'), data: selic.data },
    cdi: { anual: exigirFaixa(cdiAnual(cdi.valor), FAIXAS.cdiAnual, 'CDI anual'), data: cdi.data },
    ipca: { mes: ipcaDoMes.data.slice(0, 7), mensal: ipcaDoMes.valor, acumulado12m: ipca12Meses(ultimos12.map((m) => m.valor)) },
  };
}
