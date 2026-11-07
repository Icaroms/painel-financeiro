/**
 * Orçamentos com os pés no chão (11/2026).
 *
 * O orçamento de uma categoria é um LIMITE para o dia a dia. A soma dos
 * limites não deveria passar do que sobra para o dia a dia depois das
 * obrigações do mês. Aqui ficam:
 *
 * - livreParaODiaADia: entradas do mês − contas fixas − parcelas de compras
 *   parceladas − folga mínima;
 * - alertaDosOrcamentos: avisa quando a soma dos orçamentos passa do livre;
 * - sugerirOrcamentos: divide o livre entre as categorias, pelo peso que cada
 *   uma teve nos gastos (ou pelos orçamentos atuais, sem histórico);
 * - aplicarSugestao: grava os valores escolhidos.
 *
 * Por que só as parcelas, e não as faturas inteiras: uma compra de 1x no
 * cartão é dia a dia que só é paga no mês seguinte (já está dentro do
 * orçamento do mês em que foi feita). As parcelas de compras grandes são
 * compromissos que tiram espaço do dia a dia.
 *
 * Funções puras: testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { fixoAtivoNoMes, valorDoFixoNoMes, contaComoConsumo } from './modelo.js';
import { mesDaData } from './datas.js';
import { saidasDoLancamento } from './fluxo.js';
import { entradasFixasDe, entradasAtivasNoMes, rendaDoMes } from './entradas.js';
import { LIMITES_PADRAO } from './veredito.js';

/** As sugestões são arredondadas para baixo neste passo (R$ 10). */
export const PASSO_DA_SUGESTAO = 1000;

/** Meses anteriores usados para o peso de cada categoria na sugestão. */
export const MESES_DO_PESO = 3;

function buscarMes(estado, mes) {
  return estado.meses.find((m) => m.mes === mes);
}

const categoriasAtivasDe = (estado) => estado.categorias.filter((c) => c.excluidoEm === null);

/**
 * Quanto do mês fica livre para o dia a dia.
 *
 * Entradas: a soma das entradas fixas que valem no mês (o salário de sempre,
 * mesmo que neste mês ele já estivesse no saldo); sem nenhuma cadastrada, as
 * entradas do mês (renda prevista e avulsas).
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @param {object} [limites] { colchaoSaldoCentavos }
 * @returns {{
 *   entradasCentavos: number, fonteEntradas: 'entradas-fixas'|'renda-do-mes',
 *   contasCentavos: number, parcelasCentavos: number, folgaCentavos: number, livreCentavos: number
 * }}
 */
export function livreParaODiaADia(estado, mes, limites = LIMITES_PADRAO) {
  const registro = buscarMes(estado, mes);
  if (!registro) throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);

  const fixas = entradasFixasDe(estado);
  const temFixas = fixas.length > 0;
  const entradasCentavos = temFixas
    ? entradasAtivasNoMes(fixas, mes).reduce((soma, e) => soma + e.valorCentavos, 0)
    : rendaDoMes(registro, []);

  const contasCentavos = estado.fixos
    .filter((f) => fixoAtivoNoMes(f, mes))
    .reduce((soma, f) => soma + valorDoFixoNoMes(f, registro), 0);

  // Parcelas de compras parceladas que saem neste mês (não as compras de 1x).
  const parcelasCentavos = estado.lancamentos
    .filter((l) => l.excluidoEm === null && ((l.parcelas ?? 1) > 1 || l.conversao))
    .flatMap((l) => saidasDoLancamento(l, estado.cartoes ?? []))
    .filter((s) => s.mes === mes)
    .reduce((soma, s) => soma + s.valorCentavos, 0);

  const folgaCentavos = limites.colchaoSaldoCentavos;
  return {
    entradasCentavos,
    fonteEntradas: temFixas ? 'entradas-fixas' : 'renda-do-mes',
    contasCentavos,
    parcelasCentavos,
    folgaCentavos,
    livreCentavos: entradasCentavos - contasCentavos - parcelasCentavos - folgaCentavos,
  };
}

/**
 * Aviso quando a soma dos orçamentos passa do livre do mês.
 *
 * @returns {null | { somaCentavos: number, livreCentavos: number, excessoCentavos: number, livre: object }}
 */
export function alertaDosOrcamentos(estado, mes, limites = LIMITES_PADRAO) {
  const somaCentavos = categoriasAtivasDe(estado).reduce((soma, c) => soma + c.orcamentoCentavos, 0);
  const livre = livreParaODiaADia(estado, mes, limites);
  if (somaCentavos <= Math.max(livre.livreCentavos, 0)) return null;
  return {
    somaCentavos,
    livreCentavos: livre.livreCentavos,
    excessoCentavos: somaCentavos - Math.max(livre.livreCentavos, 0),
    livre,
  };
}

/**
 * Sugere um orçamento para cada categoria ativa, dividindo o livre do mês.
 *
 * Peso de cada categoria, nesta ordem:
 * 1. o que foi consumido nela no mês atual e nos 3 anteriores (sem compras
 *    parceladas e sem contas fixas convertidas);
 * 2. sem gastos ainda: o orçamento atual dela;
 * 3. sem nada: partes iguais.
 *
 * @param {object} estado
 * @param {string} mes
 * @param {object} [limites]
 * @returns {{
 *   ok: boolean, motivo?: string, livre: object, base?: 'gastos'|'orcamentos'|'iguais',
 *   itens: { categoria: object, atualCentavos: number, sugeridoCentavos: number }[]
 * }}
 */
export function sugerirOrcamentos(estado, mes, limites = LIMITES_PADRAO) {
  const livre = livreParaODiaADia(estado, mes, limites);
  const categorias = categoriasAtivasDe(estado);
  if (categorias.length === 0) {
    return { ok: false, motivo: 'Cadastre ao menos uma categoria.', livre, itens: [] };
  }
  if (livre.livreCentavos <= 0) {
    return {
      ok: false,
      motivo: livre.entradasCentavos === 0
        ? 'Cadastre o salário em "Entradas fixas" para o app saber quanto entra por mês.'
        : 'As contas fixas e as parcelas já ocupam todas as entradas do mês: não sobra nada para dividir.',
      livre,
      itens: [],
    };
  }

  const meses = new Set(estado.meses.map((m) => m.mes).filter((m) => m <= mes).sort().slice(-(MESES_DO_PESO + 1)));
  const gastos = new Map(categorias.map((c) => [c.id, 0]));
  for (const l of estado.lancamentos) {
    if (!contaComoConsumo(l) || (l.parcelas ?? 1) > 1 || !meses.has(mesDaData(l.data)) || !gastos.has(l.categoriaId)) continue;
    gastos.set(l.categoriaId, gastos.get(l.categoriaId) + l.valorCentavos);
  }
  const totalGastos = [...gastos.values()].reduce((a, b) => a + b, 0);
  const totalOrcamentos = categorias.reduce((soma, c) => soma + c.orcamentoCentavos, 0);

  let base;
  let peso;
  if (totalGastos > 0) {
    base = 'gastos';
    peso = (c) => gastos.get(c.id) / totalGastos;
  } else if (totalOrcamentos > 0) {
    base = 'orcamentos';
    peso = (c) => c.orcamentoCentavos / totalOrcamentos;
  } else {
    base = 'iguais';
    peso = () => 1 / categorias.length;
  }

  const itens = categorias.map((categoria) => ({
    categoria,
    atualCentavos: categoria.orcamentoCentavos,
    sugeridoCentavos: Math.floor((livre.livreCentavos * peso(categoria)) / PASSO_DA_SUGESTAO) * PASSO_DA_SUGESTAO,
  }));
  return { ok: true, livre, base, itens };
}

/**
 * Grava os orçamentos escolhidos.
 *
 * @param {object} estado
 * @param {{ categoriaId: string, orcamentoCentavos: number }[]} valores
 * @param {object} [opcoes] { agora }
 */
export function aplicarSugestao(estado, valores, { agora = new Date() } = {}) {
  const porId = new Map(valores.map((v) => [v.categoriaId, v.orcamentoCentavos]));
  for (const valor of porId.values()) {
    if (!Number.isSafeInteger(valor) || valor < 0) {
      throw new ErroValidacao('orcamento', 'O orçamento deve ser zero ou positivo.');
    }
  }
  const momento = agora.toISOString();
  return {
    ...estado,
    categorias: estado.categorias.map((c) => (porId.has(c.id) && c.excluidoEm === null && porId.get(c.id) !== c.orcamentoCentavos
      ? { ...c, orcamentoCentavos: porId.get(c.id), atualizadoEm: momento }
      : c)),
  };
}
