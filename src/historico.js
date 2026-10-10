/**
 * Histórico de gastos: todos os gastos de todos os meses, com filtros,
 * e os totais por semana (de segunda a domingo).
 *
 * Exemplo do uso por semana:
 *   Transporte → semana de 02/11 a 08/11 → R$ 60,00 (4 gastos)
 *
 * As semanas atravessam os meses: a semana de 26/10 a 01/11 junta os
 * gastos do fim de outubro e do dia 1º de novembro.
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/historico.js.
 */

import { somarDias, inicioDaSemana } from './datas.js';
import { categoriasAtivas } from './configuracao.js';
import { contaComoConsumo } from './modelo.js';

/**
 * Lançamentos que contam como gasto: não excluídos e que não vieram da
 * conversão de uma conta fixa (a compra convertida aconteceu antes de o
 * app existir; ela aparece só nas faturas, não no histórico de gastos).
 */
function gastosValidos(estado) {
  return estado.lancamentos.filter(contaComoConsumo);
}

/** Filtra por categoria; null = todas. */
function daCategoria(gastos, categoriaId) {
  return categoriaId === null ? gastos : gastos.filter((l) => l.categoriaId === categoriaId);
}

/**
 * Categorias para o filtro: as ativas e também as removidas que têm gastos
 * (para o histórico antigo continuar encontrável).
 *
 * @param {object} estado
 * @returns {{ id: string, nome: string, removida: boolean }[]}
 */
export function categoriasDoHistorico(estado) {
  const ativas = categoriasAtivas(estado);
  const comGasto = new Set(gastosValidos(estado).map((l) => l.categoriaId));
  return estado.categorias
    .filter((c) => ativas.includes(c) || comGasto.has(c.id))
    .map((c) => ({ id: c.id, nome: c.nome, removida: c.excluidoEm !== null }));
}

/**
 * Meses para o filtro, do mais recente para o mais antigo.
 *
 * @param {object} estado
 * @returns {string[]} "AAAA-MM".
 */
export function mesesDoHistorico(estado) {
  return estado.meses.map((m) => m.mes).sort().reverse();
}

/**
 * Lista de gastos com filtro de categoria e de mês.
 *
 * @param {object} estado
 * @param {object} filtro
 * @param {string|null} filtro.categoriaId null = todas.
 * @param {string|null} filtro.mes         "AAAA-MM"; null = todos os meses.
 * @returns {{ gastos: { lancamento: object, nomeCategoria: string }[], totalCentavos: number }}
 */
export function filtrarGastos(estado, { categoriaId = null, mes = null } = {}) {
  const nomes = new Map(estado.categorias.map((c) => [c.id, c.nome]));

  const selecionados = daCategoria(gastosValidos(estado), categoriaId)
    .filter((l) => mes === null || l.data.startsWith(`${mes}-`))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));

  return {
    gastos: selecionados.map((lancamento) => ({
      lancamento,
      nomeCategoria: nomes.get(lancamento.categoriaId) ?? 'Sem categoria',
    })),
    totalCentavos: selecionados.reduce((soma, l) => soma + l.valorCentavos, 0),
  };
}

/**
 * Totais por semana (segunda a domingo), da semana de hoje para trás.
 *
 * - Começa na semana do primeiro gasto e vai até a semana de hoje,
 *   INCLUINDO as semanas sem gasto (elas contam R$ 0,00 na média).
 * - A média usa só as semanas COMPLETAS: a semana de hoje ainda está
 *   em andamento e puxaria a média para baixo.
 *
 * @param {object}      estado
 * @param {string|null} categoriaId null = todas as categorias.
 * @param {string}      hoje        "AAAA-MM-DD".
 * @returns {{
 *   semanas: { inicio: string, fim: string, totalCentavos: number, quantidade: number, atual: boolean }[],
 *   mediaCentavos: number|null,
 *   semanasCompletas: number
 * }}
 */
export function semanasDeGastos(estado, categoriaId, hoje) {
  const gastos = daCategoria(gastosValidos(estado), categoriaId)
    .filter((l) => l.data <= hoje); // gasto com data no futuro ainda não aconteceu

  const semanaDeHoje = inicioDaSemana(hoje);
  if (gastos.length === 0) {
    return { semanas: [], mediaCentavos: null, semanasCompletas: 0 };
  }

  // Soma por segunda-feira da semana.
  const porSemana = new Map();
  for (const l of gastos) {
    const inicio = inicioDaSemana(l.data);
    const atual = porSemana.get(inicio) ?? { totalCentavos: 0, quantidade: 0 };
    porSemana.set(inicio, { totalCentavos: atual.totalCentavos + l.valorCentavos, quantidade: atual.quantidade + 1 });
  }

  const primeira = [...porSemana.keys()].sort()[0];
  const semanas = [];
  for (let inicio = semanaDeHoje; inicio >= primeira; inicio = somarDias(inicio, -7)) {
    const soma = porSemana.get(inicio) ?? { totalCentavos: 0, quantidade: 0 };
    semanas.push({ inicio, fim: somarDias(inicio, 6), ...soma, atual: inicio === semanaDeHoje });
  }

  const completas = semanas.filter((s) => !s.atual);
  const mediaCentavos = completas.length === 0
    ? null
    : Math.round(completas.reduce((soma, s) => soma + s.totalCentavos, 0) / completas.length);

  return { semanas, mediaCentavos, semanasCompletas: completas.length };
}

/**
 * Total de uma categoria na semana de hoje (para a régua da aba Mês).
 *
 * @param {object} estado
 * @param {string} categoriaId
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ inicio: string, fim: string, totalCentavos: number }}
 */
export function gastoDaSemanaAtual(estado, categoriaId, hoje) {
  const inicio = inicioDaSemana(hoje);
  const fim = somarDias(inicio, 6);
  const totalCentavos = daCategoria(gastosValidos(estado), categoriaId)
    .filter((l) => l.data >= inicio && l.data <= fim)
    .reduce((soma, l) => soma + l.valorCentavos, 0);
  return { inicio, fim, totalCentavos };
}

/** Quantos itens cada página das listas do histórico mostra. */
export const ITENS_POR_PAGINA = 5;

/**
 * Divide uma lista em páginas de tamanho fixo.
 *
 * A página pedida é ajustada para ficar entre a primeira e a última:
 * se a lista encolher (um filtro novo, por exemplo), a tela nunca fica
 * presa numa página que não existe mais.
 *
 * @param {any[]}  lista
 * @param {number} pagina   Começa em 1.
 * @param {number} [tamanho] Padrão: ITENS_POR_PAGINA (5).
 * @returns {{ itens: any[], pagina: number, totalPaginas: number, totalItens: number }}
 */
export function paginar(lista, pagina, tamanho = ITENS_POR_PAGINA) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  const atual = Math.min(Math.max(Number.isInteger(pagina) ? pagina : 1, 1), totalPaginas);
  const inicio = (atual - 1) * tamanho;
  return {
    itens: lista.slice(inicio, inicio + tamanho),
    pagina: atual,
    totalPaginas,
    totalItens: lista.length,
  };
}
