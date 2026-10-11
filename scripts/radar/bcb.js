/**
 * Robô do Radar (Fase 04, partes 4.4a, 4.4b e 4.5): taxas do Banco Central.
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
 * - 195 (parte 4.5): rentabilidade da poupança no período de 1 mês (% ao mês,
 *   depósitos a partir de 04/05/2012), já com a TR. Usada no simulador.
 *
 * Histórico (4.4b): CDI e IPCA de cada mês desde INICIO_HISTORICO, para o
 * app estimar o valor atual da renda fixa pela taxa contratada (4.4c).
 * Consulta por período: .../dados?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA
 * Regra conferida em 10/10/2026: no máximo 10 anos por consulta; o robô
 * pede em blocos de ANOS_POR_CONSULTA anos.
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
export const SERIES = Object.freeze({ selicMeta: 432, cdiDiario: 12, ipcaMensal: 433, poupanca: 195 });

/** Endereço dos últimos N valores de uma série (N de 1 a 20). */
export const enderecoDaSerie = (codigo, ultimos) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${ultimos}?formato=json`;

/** Endereço de uma série num período (datas "AAAA-MM-DD"; no máximo 10 anos). */
export const enderecoDoPeriodo = (codigo, de, ate) => {
  const br = (data) => data.split('-').reverse().join('/');
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${br(de)}&dataFinal=${br(ate)}`;
};

/** Faixas plausíveis: valor fora delas indica código errado ou dado quebrado. */
export const FAIXAS = Object.freeze({
  selicMeta: [2, 30], // % ao ano
  cdiAnual: [2, 30], // % ao ano
  ipcaMensal: [-3, 5], // % no mês
  cdiMensal: [0.05, 3], // % no mês (em 2020-2021, com a Selic a 2%, o CDI rendeu ~0,15% ao mês)
  poupancaMensal: [0.1, 2], // % no mês (com a Selic a 2%, a poupança rendeu ~0,12% ao mês)
});

/** Primeiro dia do histórico (cobre aplicações dos últimos 10 anos). */
export const INICIO_HISTORICO = '2016-01-01';

/** Anos por consulta (a API aceita no máximo 10). */
export const ANOS_POR_CONSULTA = 5;

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

/* ------------------------------------------------------------------ */
/* Histórico mensal (parte 4.4b)                                      */
/* ------------------------------------------------------------------ */

/**
 * Divide um período em blocos de no máximo N anos (a API recusa mais de 10).
 *
 * @param {string} de "AAAA-MM-DD".
 * @param {string} ate "AAAA-MM-DD".
 * @param {number} [anos]
 * @returns {{ de: string, ate: string }[]}
 */
export function periodosDeConsulta(de, ate, anos = ANOS_POR_CONSULTA) {
  const blocos = [];
  let inicio = de;
  while (inicio <= ate) {
    const ano = Number(inicio.slice(0, 4)) + anos;
    // Fim do bloco: véspera do mesmo dia N anos depois (ou a data final).
    const proximo = `${ano}${inicio.slice(4)}`;
    const vespera = new Date(`${proximo}T12:00:00Z`);
    vespera.setUTCDate(vespera.getUTCDate() - 1);
    const fim = vespera.toISOString().slice(0, 10);
    blocos.push({ de: inicio, ate: fim < ate ? fim : ate });
    inicio = proximo;
  }
  return blocos;
}

/** Dias do mês "AAAA-MM". */
const diasDoMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

/** Mês seguinte: "2026-12" → "2027-01". */
function mesSeguinte(mes) {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7));
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Confere que os meses vêm em sequência, sem buraco. */
function exigirSequencia(meses, nome) {
  for (let i = 1; i < meses.length; i += 1) {
    if (meses[i].mes !== mesSeguinte(meses[i - 1].mes)) {
      throw new Error(`BCB: falta o ${nome} entre ${meses[i - 1].mes} e ${meses[i].mes}.`);
    }
  }
}

/** Arredonda em 6 casas (o bastante para fatores de rendimento). */
const seisCasas = (n) => Math.round(n * 1e6) / 1e6;

/**
 * CDI de cada mês, encadeando o CDI diário: Π(1 + d/100) − 1, em %.
 *
 * ultimoDia: até que dia do mês o valor cobre. Nos meses completos é o
 * último dia do mês; no mês mais recente é o dia do último dado (o mês
 * ainda está andando). O app usa isso para fazer a conta proporcional.
 *
 * @param {{ data: string, valor: number }[]} diario Lido por lerSerieSgs.
 * @returns {{ mes: string, percentual: number, ultimoDia: number }[]}
 */
export function cdiMensal(diario) {
  const porMes = new Map();
  for (const { data, valor } of diario) {
    const mes = data.slice(0, 7);
    const atual = porMes.get(mes) ?? { fator: 1, dia: 0 };
    porMes.set(mes, { fator: atual.fator * (1 + valor / 100), dia: Number(data.slice(8, 10)) });
  }
  const meses = [...porMes.entries()].map(([mes, { fator, dia }], i, todos) => {
    const percentual = seisCasas((fator - 1) * 100);
    const ultimo = i === todos.length - 1;
    // O mês mais recente pode estar incompleto: a conferência de faixa só vale para os completos.
    if (!ultimo) exigirFaixa(percentual, FAIXAS.cdiMensal, `CDI de ${mes}`);
    return { mes, percentual, ultimoDia: ultimo ? dia : diasDoMes(mes) };
  });
  exigirSequencia(meses, 'CDI');
  return meses;
}

/**
 * IPCA de cada mês, conferido.
 * @param {{ data: string, valor: number }[]} mensal Lido por lerSerieSgs.
 * @returns {{ mes: string, percentual: number }[]}
 */
export function ipcaMensal(mensal) {
  const meses = mensal.map(({ data, valor }) => ({
    mes: data.slice(0, 7),
    percentual: exigirFaixa(valor, FAIXAS.ipcaMensal, `IPCA de ${data.slice(0, 7)}`),
  }));
  exigirSequencia(meses, 'IPCA');
  return meses;
}

/**
 * Monta o histórico que vai dentro da parte "taxas" do radar.
 *
 * @param {object} series
 * @param {{ data: string, valor: number }[]} series.cdiDiario Desde INICIO_HISTORICO.
 * @param {{ data: string, valor: number }[]} series.ipcaMensal Desde INICIO_HISTORICO.
 * @returns {{ inicio: string, cdi: object[], ipca: object[] }}
 */
export function montarHistorico({ cdiDiario, ipcaMensal: ipca }) {
  const inicio = INICIO_HISTORICO.slice(0, 7);
  const cdi = cdiMensal(cdiDiario);
  const ipcaMeses = ipcaMensal(ipca);
  if (cdi[0]?.mes !== inicio || ipcaMeses[0]?.mes !== inicio) {
    throw new Error(`BCB: o histórico precisa começar em ${inicio} (CDI: ${cdi[0]?.mes}, IPCA: ${ipcaMeses[0]?.mes}).`);
  }
  return { inicio, cdi, ipca: ipcaMeses };
}

/* ------------------------------------------------------------------ */
/* Poupança (parte 4.5)                                               */
/* ------------------------------------------------------------------ */

/**
 * Rentabilidade da poupança no período mais recente (série 195).
 * @param {{ data: string, valor: number }[]} serie Lida por lerSerieSgs.
 * @returns {{ mensal: number, data: string }} data: início do período de 1 mês.
 */
export function montarPoupanca(serie) {
  const ultimo = serie.at(-1);
  return { mensal: exigirFaixa(ultimo.valor, FAIXAS.poupancaMensal, 'rendimento da poupança'), data: ultimo.data };
}
