/**
 * Dados dos gráficos (11/2026). Só escolhe e ordena números que o app já
 * calcula; o desenho fica em src/ui/graficos.js.
 *
 * - gastosPorMes: quanto foi gasto (consumo) em cada um dos últimos meses
 *   registrados; o mês atual vem marcado como parcial ("até hoje");
 * - saldoPrevisto: o saldo acumulado previsto para o fim de cada um dos
 *   próximos meses (a mesma previsão do Avaliar compra);
 * - gastosPorCategoria: para onde foi o dinheiro do mês, da maior categoria
 *   para a menor, com a fatia de cada uma.
 *
 * Funções puras: testadas no Node.
 */

import { mesDaData } from './datas.js';
import { lancamentosValidosDoMes } from './veredito.js';
import { resumoDoMes } from './resumo-mes.js';
import { dadosDoMes } from './meses.js';
import { projetarMeses } from './fluxo.js';

/** Quantos meses os gráficos de barras mostram. */
export const MESES_NOS_GRAFICOS = 6;

/**
 * @param {object} estado
 * @param {string} hoje "AAAA-MM-DD".
 * @param {number} [quantos]
 * @returns {{ mes: string, totalCentavos: number, parcial: boolean }[]} Do mais antigo ao atual.
 */
export function gastosPorMes(estado, hoje, quantos = MESES_NOS_GRAFICOS) {
  const atual = mesDaData(hoje);
  return estado.meses
    .map((m) => m.mes)
    .filter((m) => m <= atual)
    .sort()
    .slice(-quantos)
    .map((mes) => ({
      mes,
      totalCentavos: lancamentosValidosDoMes(estado.lancamentos, mes).reduce((t, l) => t + l.valorCentavos, 0),
      parcial: mes === atual,
    }));
}

/**
 * @param {object} estado
 * @param {string} hoje
 * @param {number} [quantos] Meses depois do atual.
 * @returns {{ mes: string, sobraCentavos: number, atual: boolean }[]} O atual e os seguintes.
 */
export function saldoPrevisto(estado, hoje, quantos = MESES_NOS_GRAFICOS - 1) {
  const atual = mesDaData(hoje);
  return projetarMeses(dadosDoMes(estado, atual), quantos)
    .map((m) => ({ mes: m.mes, sobraCentavos: m.sobraCentavos, atual: m.mes === atual }));
}

/**
 * @param {object} estado
 * @param {string} hoje
 * @returns {{ totalCentavos: number, itens: { nome: string, gastoCentavos: number, fatia: number }[] }}
 *   Só categorias com gasto no mês, da maior para a menor.
 */
export function gastosPorCategoria(estado, hoje) {
  const r = resumoDoMes(estado, mesDaData(hoje), hoje);
  const comGasto = r.categorias.filter((c) => c.gastoCentavos > 0);
  const totalCentavos = comGasto.reduce((t, c) => t + c.gastoCentavos, 0);
  return {
    totalCentavos,
    itens: comGasto
      .sort((a, b) => b.gastoCentavos - a.gastoCentavos)
      .map((c) => ({ nome: c.categoria.nome, gastoCentavos: c.gastoCentavos, fatia: c.gastoCentavos / totalCentavos })),
  };
}
