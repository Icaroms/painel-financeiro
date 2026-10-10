/**
 * Estimativa do valor atual da renda fixa pela taxa contratada (Fase 04, parte 4.4c).
 *
 * A pessoa informa a taxa de cada aplicação (ex.: CDB 110% do CDI), e o app
 * estima quanto ela vale hoje com o histórico real do CDI e do IPCA que o
 * robô do radar publica (parte 4.4b, radar.taxas.historico).
 *
 *   taxa: { indexador: 'cdi', percentual: 110 }       ← 110% do CDI
 *   taxa: { indexador: 'prefixado', percentual: 12.5 } ← 12,5% ao ano
 *   taxa: { indexador: 'ipca', percentual: 6.2 }       ← IPCA + 6,2% ao ano
 *
 * Decisões de 10/10/2026:
 * - Histórico real: a conta acompanha o CDI e o IPCA de cada mês desde 2016.
 * - A estimativa parte do ÚLTIMO VALOR DIGITADO (valorAtualCentavos, na data
 *   valorAtualEm). Sem valor digitado, ele é o próprio valor aplicado, na
 *   data da aplicação (src/carteira.js). Assim a estimativa fica sempre
 *   perto do extrato: digitou o valor do banco, a conta recomeça dele.
 * - Bruto e líquido: o IR da renda fixa segue a tabela regressiva (conferida
 *   em 10/10/2026): até 180 dias 22,5%; até 360, 20%; até 720, 17,5%;
 *   acima de 720, 15%. Incide só sobre o rendimento, contado desde a
 *   aplicação. LCI/LCA são isentas para pessoa física.
 *
 * Aproximações (o app avisa na tela que é estimativa):
 * - Dentro de um mês, a parte do CDI é proporcional aos dias corridos.
 * - "x% do CDI" usa o CDI do mês elevado a x/100 (diferença desprezível
 *   para a conta dia a dia).
 * - Prefixado e IPCA+ contam o ano como 365 dias corridos (os bancos usam
 *   252 dias úteis: a diferença é pequena).
 * - IPCA ainda não divulgado (o do mês corrente sai no mês seguinte) é
 *   projetado pela média mensal dos últimos 12 meses, e o app avisa.
 * - IOF (resgate antes de 30 dias) e taxas (como a de custódia do Tesouro)
 *   não entram.
 *
 * Datas: o valor estimado é o valor "no início do dia" informado em `ate`.
 * Funções puras: testadas no Node (tests/renda-fixa.test.js).
 */

import { ErroValidacao } from './erros.js';

/** Tipos de investimento que aceitam taxa contratada. */
export const TIPOS_COM_TAXA = Object.freeze(['cdb', 'tesouro', 'lci-lca', 'outro-renda-fixa']);

/** Tipos isentos de IR para pessoa física. */
export const TIPOS_ISENTOS = Object.freeze(['lci-lca']);

/** Indexadores da taxa contratada, com a faixa aceita do número. */
export const INDEXADORES_CONTRATADOS = Object.freeze([
  Object.freeze({ id: 'cdi', nome: '% do CDI', unidade: '% do CDI', minimo: 1, maximo: 300, exemplo: '110' }),
  Object.freeze({ id: 'prefixado', nome: 'Prefixado (% ao ano)', unidade: '% ao ano', minimo: 0, maximo: 60, exemplo: '12,5' }),
  Object.freeze({ id: 'ipca', nome: 'IPCA + (% ao ano)', unidade: '% ao ano + IPCA', minimo: -5, maximo: 30, exemplo: '6,2' }),
]);

/** O tipo aceita taxa contratada? */
export const aceitaTaxa = (tipo) => TIPOS_COM_TAXA.includes(tipo);

/** Indexador pelo id, ou undefined. */
const indexador = (id) => INDEXADORES_CONTRATADOS.find((i) => i.id === id);

/**
 * Lê uma porcentagem digitada: "110", "12,5", "12.5", "6,2%".
 * @param {string} texto
 * @returns {number|null} null quando vazio; NaN quando inválido (a validação explica o erro).
 */
export function lerPercentual(texto) {
  const limpo = String(texto ?? '').trim().replace('%', '').trim().replace(',', '.');
  if (limpo === '') return null;
  return /^-?\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : NaN;
}

/**
 * Confere a taxa contratada de um investimento.
 *
 * @param {string} tipo Tipo do investimento.
 * @param {{ indexador: string, percentual: number }|null|undefined} taxa
 * @returns {{ indexador: string, percentual: number }|null} null = sem taxa.
 */
export function validarTaxa(tipo, taxa) {
  if (taxa === null || taxa === undefined || !aceitaTaxa(tipo)) return null;
  const info = indexador(taxa.indexador);
  if (!info) throw new ErroValidacao('taxa', 'Escolha como a aplicação rende (% do CDI, prefixado ou IPCA +).');
  const { percentual } = taxa;
  if (!Number.isFinite(percentual) || percentual < info.minimo || percentual > info.maximo) {
    throw new ErroValidacao(
      'taxa',
      `Taxa inválida: digite um número de ${info.minimo} a ${info.maximo} (${info.unidade}), como ${info.exemplo}.`,
    );
  }
  return { indexador: info.id, percentual: Math.round(percentual * 100) / 100 };
}

/** 110 → "110% do CDI"; 12.5 → "12,5% ao ano"; 6.2 → "IPCA + 6,2% ao ano". */
export function textoDaTaxa(taxa) {
  const numero = String(taxa.percentual).replace('.', ',');
  if (taxa.indexador === 'cdi') return `${numero}% do CDI`;
  if (taxa.indexador === 'prefixado') return `${numero}% ao ano`;
  return `IPCA + ${numero}% ao ano`;
}

/* ------------------------------------------------------------------ */
/* Datas                                                              */
/* ------------------------------------------------------------------ */

const DIA_MS = 24 * 60 * 60 * 1000;
const emMs = (data) => Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)));
const comoData = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Dias corridos de `de` até `ate` (ate − de). */
export const diasEntre = (de, ate) => Math.round((emMs(ate) - emMs(de)) / DIA_MS);

/** Data mais N dias. */
const maisDias = (data, dias) => comoData(emMs(data) + dias * DIA_MS);

/** Dias do mês "AAAA-MM". */
const diasDoMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

/** Mês seguinte: "2026-12" → "2027-01". */
function mesSeguinte(mes) {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7));
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Quantos dias do intervalo [de, fim) caem nos dias [1, ultimoDia] do mês.
 * (fim não entra: é o dia em que o valor é "lido".)
 */
function diasNoMes(mes, ultimoDia, de, fim) {
  const inicioMes = emMs(`${mes}-01`);
  const fimMes = inicioMes + ultimoDia * DIA_MS; // exclusivo
  const inicio = Math.max(inicioMes, emMs(de));
  const final = Math.min(fimMes, emMs(fim));
  return Math.max(0, Math.round((final - inicio) / DIA_MS));
}

/* ------------------------------------------------------------------ */
/* Fatores de rendimento                                              */
/* ------------------------------------------------------------------ */

/**
 * Até quando o histórico do CDI permite estimar: o dia seguinte ao último dado.
 * @param {object} historico radar.taxas.historico
 * @returns {string} "AAAA-MM-DD"
 */
export function fimDoCdi(historico) {
  const ultimo = historico.cdi.at(-1);
  return maisDias(`${ultimo.mes}-${String(ultimo.ultimoDia).padStart(2, '0')}`, 1);
}

/**
 * Fator do CDI no intervalo [de, fim), a x% do CDI.
 *
 * @param {object} historico radar.taxas.historico
 * @param {string} de "AAAA-MM-DD" (não pode ser antes do início do histórico).
 * @param {string} fim "AAAA-MM-DD" (até fimDoCdi).
 * @param {number} [percentualDoCdi] 100 = 100% do CDI.
 * @returns {number} Ex.: 1.0523 (rendeu 5,23%).
 */
export function fatorDoCdi(historico, de, fim, percentualDoCdi = 100) {
  let fator = 1;
  for (const { mes, percentual, ultimoDia } of historico.cdi) {
    const dias = diasNoMes(mes, ultimoDia, de, fim);
    if (dias > 0) fator *= (1 + percentual / 100) ** ((dias / ultimoDia) * (percentualDoCdi / 100));
  }
  return fator;
}

/**
 * Fator do IPCA no intervalo [de, fim). Meses ainda não divulgados são
 * projetados pela média mensal dos últimos 12 meses.
 *
 * @param {object} historico radar.taxas.historico
 * @param {string} de
 * @param {string} fim
 * @returns {{ fator: number, projetado: boolean }}
 */
export function fatorDoIpca(historico, de, fim) {
  let fator = 1;
  let projetado = false;
  for (const { mes, percentual } of historico.ipca) {
    const total = diasDoMes(mes);
    const dias = diasNoMes(mes, total, de, fim);
    if (dias > 0) fator *= (1 + percentual / 100) ** (dias / total);
  }
  const ultimos12 = historico.ipca.slice(-12);
  const media = ultimos12.reduce((f, m) => f * (1 + m.percentual / 100), 1) ** (1 / ultimos12.length);
  for (let mes = mesSeguinte(historico.ipca.at(-1).mes); `${mes}-01` < fim; mes = mesSeguinte(mes)) {
    const total = diasDoMes(mes);
    const dias = diasNoMes(mes, total, de, fim);
    if (dias > 0) {
      fator *= media ** (dias / total);
      projetado = true;
    }
  }
  return { fator, projetado };
}

/* ------------------------------------------------------------------ */
/* Imposto de renda                                                   */
/* ------------------------------------------------------------------ */

/**
 * Alíquota do IR da renda fixa pelo prazo desde a aplicação (tabela regressiva).
 * @param {number} dias Dias corridos desde a aplicação.
 * @returns {number} 22.5, 20, 17.5 ou 15.
 */
export function aliquotaDoIr(dias) {
  if (dias <= 180) return 22.5;
  if (dias <= 360) return 20;
  if (dias <= 720) return 17.5;
  return 15;
}

/* ------------------------------------------------------------------ */
/* Estimativa                                                         */
/* ------------------------------------------------------------------ */

/**
 * Estima o valor de uma aplicação de renda fixa com taxa contratada.
 *
 * @param {object} investimento De src/carteira.js (com taxa, valorAtualCentavos e valorAtualEm).
 * @param {object|null} historico radar.taxas.historico (CDI e IPCA não estimam sem ele).
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {null | {
 *   brutoCentavos: number, ate: string, taxa: object,
 *   isento: boolean, aliquota: number, irCentavos: number, liquidoCentavos: number,
 *   ipcaProjetado: boolean, partiuDe: { centavos: number, data: string }
 * }} null quando não dá para estimar (sem taxa, sem histórico ou antes do histórico).
 */
export function estimarRendaFixa(investimento, historico, hoje) {
  const { taxa, tipo } = investimento;
  if (!taxa || !aceitaTaxa(tipo)) return null;
  const base = investimento.valorAtualCentavos;
  const de = investimento.valorAtualEm;
  if (!Number.isSafeInteger(base) || typeof de !== 'string') return null;

  let fim = hoje;
  let fator = 1;
  let ipcaProjetado = false;
  if (taxa.indexador === 'prefixado') {
    fator = (1 + taxa.percentual / 100) ** (Math.max(0, diasEntre(de, fim)) / 365);
  } else {
    if (!historico || `${historico.inicio}-01` > de) return null;
    if (taxa.indexador === 'cdi') {
      fim = fimDoCdi(historico) < hoje ? fimDoCdi(historico) : hoje;
      fator = fatorDoCdi(historico, de, fim, taxa.percentual);
    } else {
      const ipca = fatorDoIpca(historico, de, fim);
      ipcaProjetado = ipca.projetado;
      fator = ipca.fator * (1 + taxa.percentual / 100) ** (Math.max(0, diasEntre(de, fim)) / 365);
    }
  }
  // Valor digitado depois do último dado: nada a somar ainda.
  const ate = fim > de ? fim : de;
  const brutoCentavos = Math.round(base * (fim > de ? fator : 1));

  const isento = TIPOS_ISENTOS.includes(tipo);
  const aliquota = isento ? 0 : aliquotaDoIr(diasEntre(investimento.dataAplicacao, ate));
  const ganho = brutoCentavos - investimento.valorAplicadoCentavos;
  const irCentavos = ganho > 0 ? Math.round((ganho * aliquota) / 100) : 0;
  return {
    brutoCentavos,
    ate,
    taxa,
    isento,
    aliquota,
    irCentavos,
    liquidoCentavos: brutoCentavos - irCentavos,
    ipcaProjetado,
    partiuDe: { centavos: base, data: de },
  };
}

/**
 * Visão dos dados com as estimativas aplicadas, SÓ PARA MOSTRAR E CALCULAR
 * (resumo da carteira, reserva de emergência, destino da sobra, IA).
 * Nunca grave esta visão: o que se grava é o que a pessoa digitou.
 *
 * Em cada investimento com estimativa: valorAtualCentavos vira o bruto
 * estimado, valorAtualEm vira a data da estimativa, e o campo `estimativa`
 * guarda os detalhes (IR, líquido, de onde partiu).
 *
 * @param {object} estado Dados do app.
 * @param {object|null} historico radar.taxas.historico
 * @param {string} hoje
 * @returns {object} O mesmo estado quando nada muda; senão, uma cópia.
 */
export function comEstimativas(estado, historico, hoje) {
  if (!estado?.investimentos?.some((i) => i.taxa && !i.excluidoEm)) return estado;
  return {
    ...estado,
    investimentos: estado.investimentos.map((i) => {
      if (i.excluidoEm) return i;
      const estimativa = estimarRendaFixa(i, historico, hoje);
      return estimativa
        ? { ...i, valorAtualCentavos: estimativa.brutoCentavos, valorAtualEm: estimativa.ate, estimativa }
        : i;
    }),
  };
}
