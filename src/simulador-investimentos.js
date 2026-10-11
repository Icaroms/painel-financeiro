/**
 * Simulador de investimentos (Fase 04, parte 4.5).
 *
 * Compara, lado a lado, quanto um valor inicial + um valor mensal viram
 * depois de N meses em cada opção, SE AS TAXAS DE HOJE CONTINUAREM (elas
 * mudam: é uma simulação, não uma promessa):
 * - Poupança: rendimento do mês do Banco Central (série 195, já com a TR).
 *   Sem esse dado, a regra da poupança sem a TR (0,5% ao mês com a Selic
 *   acima de 8,5%; senão 70% da Selic), e o app avisa.
 * - CDB e LCI/LCA: a % do CDI que a pessoa digita (CDI anual de hoje, do radar).
 * - Tesouro Selic, Prefixado e IPCA+: os títulos de hoje do radar, com a
 *   taxa real de compra. Para cada tipo, o primeiro título que vence depois
 *   do fim da simulação (ou o mais longo, se todos vencem antes). Títulos
 *   com juros semestrais, Renda+ e Educa+ ficam de fora (pagam em parcelas).
 *
 * Decisões de 10/10/2026: valor inicial + valor mensal (o mensal entra todo
 * mês a partir do mês que vem: total aportado = inicial + mensal × meses);
 * opções fixas + Tesouro real; ganho real descontando a inflação (o IPCA
 * dos últimos 12 meses como projeção).
 *
 * Contas:
 * - Taxa ao ano → ao mês: (1 + a)^(1/12) − 1. x% do CDI: x% da taxa diária
 *   do CDI, em 252 dias úteis.
 * - IR (tabela regressiva de src/renda-fixa.js) separado por aporte: cada
 *   depósito tem o próprio prazo (meses × 365/12 dias). LCI/LCA e poupança
 *   são isentas para pessoa física.
 * - Valor real = líquido ÷ (1 + IPCA 12 meses)^(meses/12): quanto o dinheiro
 *   compra em reais de hoje.
 * - Não entram: IOF (resgate antes de 30 dias), taxa de custódia do Tesouro
 *   (0,20% ao ano acima de R$ 10 mil no Tesouro Selic) e a variação de preço
 *   ao vender um título antes do vencimento.
 *
 * O app só mostra números: não diz qual escolher.
 * Funções puras: testadas no Node (tests/simulador-investimentos.test.js).
 */

import { ErroValidacao } from './erros.js';
import { aliquotaDoIr } from './renda-fixa.js';

/** Prazo aceito, em meses. */
export const PRAZO_MINIMO = 1;
export const PRAZO_MAXIMO = 360;

/** Valores que já vêm no formulário. */
export const PADROES = Object.freeze({ meses: 24, cdiCdb: 100, cdiLci: 90 });

/** Faixa aceita da % do CDI. */
const CDI_MINIMO = 1;
const CDI_MAXIMO = 300;

/** Selic acima disto: poupança rende 0,5% ao mês + TR (regra desde 2012). */
const SELIC_DA_REGRA_DA_POUPANCA = 8.5;

/** Tipos do Tesouro simulados (títulos sem pagamento em parcelas). */
const TIPOS_DO_TESOURO = Object.freeze([
  Object.freeze({ tipo: 'Tesouro Selic', indexador: 'selic' }),
  Object.freeze({ tipo: 'Tesouro Prefixado', indexador: 'prefixado' }),
  Object.freeze({ tipo: 'Tesouro IPCA+', indexador: 'ipca' }),
]);

/* ------------------------------------------------------------------ */
/* Pedido                                                             */
/* ------------------------------------------------------------------ */

/**
 * Confere o pedido de simulação.
 *
 * @param {object} pedido
 * @param {number} pedido.inicialCentavos Zero ou mais.
 * @param {number} pedido.mensalCentavos  Zero ou mais (os dois não podem ser zero).
 * @param {number} pedido.meses           De PRAZO_MINIMO a PRAZO_MAXIMO.
 * @param {number} pedido.cdiCdb          % do CDI do CDB.
 * @param {number} pedido.cdiLci          % do CDI da LCI/LCA.
 * @returns {object} O pedido conferido.
 */
export function validarSimulacao({ inicialCentavos, mensalCentavos, meses, cdiCdb, cdiLci }) {
  for (const [valor, campo, rotulo] of [[inicialCentavos, 'inicial', 'O valor inicial'], [mensalCentavos, 'mensal', 'O valor mensal']]) {
    if (!Number.isSafeInteger(valor) || valor < 0) throw new ErroValidacao(campo, `${rotulo} deve ser zero ou mais.`);
  }
  if (inicialCentavos === 0 && mensalCentavos === 0) {
    throw new ErroValidacao('inicial', 'Digite um valor inicial, um valor mensal ou os dois.');
  }
  if (!Number.isInteger(meses) || meses < PRAZO_MINIMO || meses > PRAZO_MAXIMO) {
    throw new ErroValidacao('meses', `O prazo deve ser de ${PRAZO_MINIMO} a ${PRAZO_MAXIMO} meses.`);
  }
  for (const [valor, campo, rotulo] of [[cdiCdb, 'cdiCdb', 'do CDB'], [cdiLci, 'cdiLci', 'da LCI/LCA']]) {
    if (!Number.isFinite(valor) || valor < CDI_MINIMO || valor > CDI_MAXIMO) {
      throw new ErroValidacao(campo, `A taxa ${rotulo} deve ser de ${CDI_MINIMO} a ${CDI_MAXIMO} (% do CDI).`);
    }
  }
  return { inicialCentavos, mensalCentavos, meses, cdiCdb, cdiLci };
}

/* ------------------------------------------------------------------ */
/* Taxas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Taxa ao ano de "x% do CDI": x% da taxa diária, em 252 dias úteis.
 * @param {number} cdiAnual % ao ano (ex.: 13.65).
 * @param {number} percentual % do CDI (ex.: 110).
 * @returns {number} % ao ano.
 */
export function anualDoCdi(cdiAnual, percentual) {
  const diaria = (1 + cdiAnual / 100) ** (1 / 252) - 1;
  return ((1 + diaria * (percentual / 100)) ** 252 - 1) * 100;
}

/** % ao ano → % ao mês. */
export const mensalDoAnual = (anual) => ((1 + anual / 100) ** (1 / 12) - 1) * 100;

/** 13.6512 → "13,65%". */
const porcento = (n) => `${n.toFixed(2).replace('.', ',')}%`;

/** "2026-10-10" + N meses → "AAAA-MM-DD" (preso ao último dia do mês). */
export function maisMeses(data, meses) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return `${novoAno}-${String(novoMes).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

/** "2029-03-01" → "01/03/2029". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/**
 * Título do Tesouro de um tipo para o prazo: o primeiro que vence no fim da
 * simulação ou depois; se todos vencem antes, o mais longo.
 *
 * @param {object[]} titulos radar.tesouro.titulos
 * @param {string} tipo Ex.: "Tesouro Prefixado".
 * @param {string} fim "AAAA-MM-DD" (hoje + meses).
 * @returns {object|null}
 */
export function tituloParaOPrazo(titulos, tipo, fim) {
  const doTipo = titulos.filter((t) => t.tipo === tipo).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return doTipo.find((t) => t.vencimento >= fim) ?? doTipo.at(-1) ?? null;
}

/**
 * Opções da simulação, com a taxa de cada uma.
 *
 * @param {object} radar Radar lido (precisa de radar.taxas; radar.tesouro é opcional).
 * @param {object} pedido Pedido conferido (validarSimulacao).
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ id: string, nome: string, taxa: string, mensal: number, isento: boolean, nota: string }[]}
 *   mensal: % ao mês usada na conta; nota: aviso da opção ('' quando não há).
 */
export function opcoesDaSimulacao(radar, pedido, hoje) {
  const { taxas } = radar;
  const cdi = taxas.cdi.anual;
  const opcoes = [];

  // Poupança
  if (taxas.poupanca) {
    opcoes.push({
      id: 'poupanca', nome: 'Poupança', taxa: `${porcento(taxas.poupanca.mensal)} ao mês (com a TR)`,
      mensal: taxas.poupanca.mensal, isento: true, nota: '',
    });
  } else {
    const regra = taxas.selicMeta.valor > SELIC_DA_REGRA_DA_POUPANCA ? 0.5 : mensalDoAnual(taxas.selicMeta.valor * 0.7);
    opcoes.push({
      id: 'poupanca', nome: 'Poupança', taxa: `${porcento(regra)} ao mês`,
      mensal: regra, isento: true, nota: 'Sem a TR (o rendimento do Banco Central não veio no radar): na prática rende um pouco mais.',
    });
  }

  // CDB e LCI/LCA pela % do CDI digitada
  const cdb = anualDoCdi(cdi, pedido.cdiCdb);
  opcoes.push({
    id: 'cdb', nome: `CDB ${String(pedido.cdiCdb).replace('.', ',')}% do CDI`, taxa: `${porcento(cdb)} ao ano`,
    mensal: mensalDoAnual(cdb), isento: false, nota: '',
  });
  const lci = anualDoCdi(cdi, pedido.cdiLci);
  opcoes.push({
    id: 'lci', nome: `LCI/LCA ${String(pedido.cdiLci).replace('.', ',')}% do CDI`, taxa: `${porcento(lci)} ao ano, sem IR`,
    mensal: mensalDoAnual(lci), isento: true,
    nota: pedido.meses < 9 ? 'LCI e LCA costumam ter prazo mínimo (carência) de 9 meses ou mais: confira no banco.' : '',
  });

  // Tesouro: títulos reais de hoje
  const fim = maisMeses(hoje, pedido.meses);
  for (const { tipo, indexador } of TIPOS_DO_TESOURO) {
    const titulo = radar.tesouro ? tituloParaOPrazo(radar.tesouro.titulos, tipo, fim) : null;
    if (!titulo) continue;
    let anual;
    let taxa;
    if (indexador === 'selic') {
      anual = ((1 + cdi / 100) * (1 + titulo.taxaCompra / 100) - 1) * 100;
      taxa = `Selic + ${porcento(titulo.taxaCompra)} ≈ ${porcento(anual)} ao ano`;
    } else if (indexador === 'prefixado') {
      anual = titulo.taxaCompra;
      taxa = `${porcento(anual)} ao ano`;
    } else {
      anual = ((1 + taxas.ipca.acumulado12m / 100) * (1 + titulo.taxaCompra / 100) - 1) * 100;
      taxa = `IPCA + ${porcento(titulo.taxaCompra)} ≈ ${porcento(anual)} ao ano`;
    }
    let nota = '';
    if (titulo.vencimento < fim) {
      nota = `Vence em ${dataLonga(titulo.vencimento)}, antes do fim: a conta supõe reaplicar à mesma taxa.`;
    } else if (indexador !== 'selic' && titulo.vencimento > maisMeses(fim, 6)) {
      nota = `Vence em ${dataLonga(titulo.vencimento)}: vendendo antes, o preço pode estar maior ou menor (preço de mercado).`;
    }
    if (indexador === 'ipca') nota = `${nota} IPCA projetado pelo dos últimos 12 meses.`.trim();
    opcoes.push({ id: `tesouro-${indexador}`, nome: titulo.nome, taxa, mensal: mensalDoAnual(anual), isento: false, nota });
  }
  return opcoes;
}

/* ------------------------------------------------------------------ */
/* Simulação                                                          */
/* ------------------------------------------------------------------ */

/**
 * Simula uma opção.
 *
 * @param {{ mensal: number, isento: boolean }} opcao De opcoesDaSimulacao.
 * @param {{ inicialCentavos: number, mensalCentavos: number, meses: number }} pedido
 * @param {number} ipca12 IPCA dos últimos 12 meses (%), usado como projeção.
 * @returns {{ aportadoCentavos: number, brutoCentavos: number, irCentavos: number, liquidoCentavos: number,
 *   rendimentoLiquidoCentavos: number, realCentavos: number, ganhoRealPercentual: number }}
 *   realCentavos: o líquido em reais de hoje (descontada a inflação projetada).
 *   ganhoRealPercentual: quanto o poder de compra cresceu sobre o total aportado.
 */
export function simularOpcao(opcao, { inicialCentavos, mensalCentavos, meses }, ipca12) {
  const taxaMes = opcao.mensal / 100;
  // Aportes: o inicial no mês 0 e o mensal nos meses 1..meses (o último entra no fim, sem render).
  const aportes = [{ centavos: inicialCentavos, mes: 0 }];
  if (mensalCentavos > 0) for (let mes = 1; mes <= meses; mes += 1) aportes.push({ centavos: mensalCentavos, mes });

  let bruto = 0;
  let ir = 0;
  let aportado = 0;
  for (const { centavos, mes } of aportes) {
    if (centavos === 0) continue;
    const prazo = meses - mes;
    const final = centavos * (1 + taxaMes) ** prazo;
    aportado += centavos;
    bruto += final;
    if (!opcao.isento) ir += (final - centavos) * (aliquotaDoIr(Math.round((prazo * 365) / 12)) / 100);
  }
  const brutoCentavos = Math.round(bruto);
  const irCentavos = Math.round(ir);
  const liquidoCentavos = brutoCentavos - irCentavos;
  const realCentavos = Math.round(liquidoCentavos / (1 + ipca12 / 100) ** (meses / 12));
  return {
    aportadoCentavos: aportado,
    brutoCentavos,
    irCentavos,
    liquidoCentavos,
    rendimentoLiquidoCentavos: liquidoCentavos - aportado,
    realCentavos,
    ganhoRealPercentual: aportado === 0 ? 0 : ((realCentavos - aportado) / aportado) * 100,
  };
}

/**
 * Simulação completa: todas as opções, da que termina com mais dinheiro
 * líquido para a que termina com menos.
 *
 * @param {object|null} radar Radar lido.
 * @param {object} pedido Ver validarSimulacao.
 * @param {string} hoje
 * @returns {{ resultados: object[], cdi: object, ipca12: number, dataDoTesouro: string|null }}
 *   resultados: [{ ...opcao, ...simularOpcao }].
 */
export function simularInvestimentos(radar, pedido, hoje) {
  if (!radar?.taxas) {
    throw new ErroValidacao('radar', 'O simulador usa as taxas do Banco Central do radar: toque em "Atualizar radar", mais abaixo.');
  }
  const conferido = validarSimulacao(pedido);
  const ipca12 = radar.taxas.ipca.acumulado12m;
  const resultados = opcoesDaSimulacao(radar, conferido, hoje)
    .map((opcao) => ({ ...opcao, ...simularOpcao(opcao, conferido, ipca12) }))
    .sort((a, b) => b.liquidoCentavos - a.liquidoCentavos);
  return { resultados, cdi: radar.taxas.cdi, ipca12, dataDoTesouro: radar.tesouro?.dataBase ?? null };
}
