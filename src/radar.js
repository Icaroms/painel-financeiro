/**
 * Radar de opções (Fase 04, parte 4.3).
 *
 * O radar mostra opções do mercado por números objetivos, sempre com a fonte
 * e a data. Não é recomendação: o app não diz o que comprar ou vender.
 *
 * De onde vem: um robô no GitHub (.github/workflows/radar.yml) baixa dados
 * públicos uma vez por dia e publica o arquivo radar.json na branch
 * "radar-dados". O app busca esse arquivo (só leitura: nenhum dado da
 * pessoa sai do aparelho) e guarda uma cópia no aparelho, fora do backup,
 * para mostrar sem internet.
 *
 * Partes:
 * - 4.3a: Tesouro Direto do dia (taxas do Tesouro Nacional).
 * - 4.3b: ações e FIIs da B3: maiores altas e baixas (semana, mês, 12 meses),
 *   mais negociados, com filtro por preço de 1 unidade ("cabe no bolso").
 * - 4.3c, 4.3d: dividendos dos FIIs e o comentário da IA (próximas).
 *
 * Cada parte do radar ("tesouro", "mercado") pode faltar (null) quando a
 * fonte ainda não foi baixada pelo robô; a tela mostra o que houver.
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/radar.js.
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida } from './datas.js';

/** Onde o robô publica o radar (arquivo público do repositório). */
export const ENDERECO_RADAR = 'https://raw.githubusercontent.com/Icaroms/painel-financeiro/radar-dados/radar.json';

/** Identificação do arquivo: a mesma de scripts/radar/gerar-radar.js (um teste confere). */
export const FORMATO_RADAR = 'painel-financeiro-radar';
export const VERSAO_RADAR = 1;

/** Depois de quantas horas o app busca o radar de novo ao abrir a aba Investir. */
export const HORAS_PARA_BUSCAR_DE_NOVO = 6;

/** Radar com mais de 4 dias: o app avisa que pode estar desatualizado (ex.: o robô parou). */
export const DIAS_PARA_AVISAR_ATRASO = 4;

/** Tipos de rendimento dos títulos do Tesouro, para o filtro da tela. */
export const INDEXADORES = Object.freeze([
  Object.freeze({ id: 'selic', nome: 'Selic' }),
  Object.freeze({ id: 'prefixado', nome: 'Prefixado' }),
  Object.freeze({ id: 'ipca', nome: 'IPCA+' }),
  Object.freeze({ id: 'igpm', nome: 'IGP-M+' }),
]);

/** Um título do Tesouro com os campos que a tela usa. */
function tituloValido(t) {
  return t && typeof t.nome === 'string' && typeof t.indexador === 'string'
    && ehDataValida(t.vencimento) && Number.isFinite(t.taxaCompra)
    && Number.isSafeInteger(t.precoCompraCentavos) && t.precoCompraCentavos > 0;
}

/** Um ativo da B3 com os campos que a tela usa. */
function ativoValido(a) {
  const variacaoValida = (v) => v === null || Number.isFinite(v);
  return a && typeof a.codigo === 'string' && typeof a.nome === 'string' && (a.tipo === 'acao' || a.tipo === 'fii')
    && Number.isSafeInteger(a.precoCentavos) && a.precoCentavos > 0
    && Number.isSafeInteger(a.volumeCentavos) && a.volumeCentavos >= 0
    && a.variacoes && ['semana', 'mes', 'ano'].every((p) => variacaoValida(a.variacoes[p]));
}

/**
 * Confere o arquivo baixado e devolve o radar.
 * Qualquer problema lança ErroValidacao com uma mensagem clara.
 *
 * @param {unknown} dados O JSON já convertido em objeto.
 * @returns {object} O radar (com tesouro e mercado; cada um pode ser null).
 */
export function lerRadar(dados) {
  if (!dados || typeof dados !== 'object' || dados.formato !== FORMATO_RADAR) {
    throw new ErroValidacao('radar', 'O arquivo do radar não é do Painel Financeiro.');
  }
  if (!Number.isInteger(dados.versao) || dados.versao > VERSAO_RADAR) {
    throw new ErroValidacao('radar', 'O radar foi gerado por uma versão mais nova do app: toque em "Procurar atualização" em Configurar.');
  }
  if (Number.isNaN(Date.parse(dados.geradoEm))) {
    throw new ErroValidacao('radar', 'O arquivo do radar não diz quando foi gerado.');
  }
  const tesouro = dados.tesouro ?? null;
  if (tesouro && (!ehDataValida(tesouro.dataBase) || !Array.isArray(tesouro.titulos) || !tesouro.titulos.every(tituloValido))) {
    throw new ErroValidacao('radar', 'A parte do Tesouro Direto do radar está incompleta.');
  }
  const mercado = dados.mercado ?? null;
  if (mercado && (!ehDataValida(mercado.dataBase) || !mercado.referencias || !Array.isArray(mercado.ativos) || !mercado.ativos.every(ativoValido))) {
    throw new ErroValidacao('radar', 'A parte de ações e FIIs do radar está incompleta.');
  }
  if (!tesouro && !mercado) {
    throw new ErroValidacao('radar', 'O radar veio vazio.');
  }
  return { ...dados, tesouro, mercado };
}

/**
 * Já é hora de buscar o radar de novo?
 *
 * @param {string|null|undefined} buscadoEm ISO de quando o app buscou pela última vez.
 * @param {Date} [agora]
 * @returns {boolean} true sem busca anterior ou depois de HORAS_PARA_BUSCAR_DE_NOVO.
 */
export function deveBuscarRadar(buscadoEm, agora = new Date()) {
  const momento = Date.parse(buscadoEm ?? '');
  if (Number.isNaN(momento)) return true;
  return agora.getTime() - momento >= HORAS_PARA_BUSCAR_DE_NOVO * 60 * 60 * 1000;
}

/**
 * O radar está atrasado (o robô pode ter parado)?
 *
 * @param {object} radar
 * @param {Date} [agora]
 * @returns {boolean}
 */
export function radarAtrasado(radar, agora = new Date()) {
  return agora.getTime() - Date.parse(radar.geradoEm) > DIAS_PARA_AVISAR_ATRASO * 24 * 60 * 60 * 1000;
}

/** 13.5 → "13,50%"; -0.01 → "0,01%" (o sinal vai no texto da taxa). */
function porcentagem(valor) {
  return `${Math.abs(valor).toFixed(2).replace('.', ',')}%`;
}

/**
 * Texto da taxa de compra, do jeito que o Tesouro Direto mostra:
 * - Selic:     "Selic + 0,07% ao ano"
 * - IPCA:      "IPCA + 7,20% ao ano"
 * - IGP-M:     "IGP-M + 6,00% ao ano"
 * - prefixado: "13,52% ao ano"
 *
 * @param {{ indexador: string, taxaCompra: number }} titulo
 * @returns {string}
 */
export function textoDaTaxa({ indexador, taxaCompra }) {
  const sinal = taxaCompra < 0 ? '−' : '+';
  if (indexador === 'selic') return `Selic ${sinal} ${porcentagem(taxaCompra)} ao ano`;
  if (indexador === 'ipca') return `IPCA ${sinal} ${porcentagem(taxaCompra)} ao ano`;
  if (indexador === 'igpm') return `IGP-M ${sinal} ${porcentagem(taxaCompra)} ao ano`;
  return `${taxaCompra < 0 ? '−' : ''}${porcentagem(taxaCompra)} ao ano`;
}

/**
 * Títulos do Tesouro do radar, com filtro por tipo de rendimento.
 *
 * @param {object} radar
 * @param {string} [indexador] '' (todos) ou um dos INDEXADORES.
 * @returns {object[]}
 */
export function titulosDoTesouro(radar, indexador = '') {
  return (radar.tesouro?.titulos ?? []).filter((t) => !indexador || t.indexador === indexador);
}

/* ------------------------------------------------------------------ */
/* Ações e FIIs (parte 4.3b)                                          */
/* ------------------------------------------------------------------ */

/** Listas do mercado. */
export const LISTAS_DO_MERCADO = Object.freeze([
  Object.freeze({ id: 'altas', nome: 'Maiores altas' }),
  Object.freeze({ id: 'baixas', nome: 'Maiores baixas' }),
  Object.freeze({ id: 'negociados', nome: 'Mais negociados' }),
]);

/** Períodos das variações ("no mês" é o texto que aparece depois da porcentagem). */
export const PERIODOS = Object.freeze([
  Object.freeze({ id: 'semana', nome: 'Semana', texto: 'na semana' }),
  Object.freeze({ id: 'mes', nome: 'Mês', texto: 'no mês' }),
  Object.freeze({ id: 'ano', nome: '12 meses', texto: 'em 12 meses' }),
]);

/** Faixas de preço de 1 unidade (centavos). A faixa "investir" é a parte Investir da sobra do mês. */
export const FAIXAS_DE_PRECO = Object.freeze([
  Object.freeze({ id: '', nome: 'Qualquer preço', maximoCentavos: null }),
  Object.freeze({ id: 'ate-10', nome: 'Até R$ 10', maximoCentavos: 1000 }),
  Object.freeze({ id: 'ate-50', nome: 'Até R$ 50', maximoCentavos: 5000 }),
  Object.freeze({ id: 'ate-100', nome: 'Até R$ 100', maximoCentavos: 10000 }),
]);

/** Quantos itens cada lista mostra no máximo (5 por página na tela). */
export const LIMITE_DA_LISTA = 20;

/** O período tem preço de referência no radar? (o robô pode não ter achado o pregão) */
export function periodoDisponivel(radar, periodo) {
  return Boolean(radar.mercado?.referencias?.[periodo]);
}

/**
 * Monta uma lista do mercado.
 * - altas: só variação positiva, da maior para a menor;
 * - baixas: só variação negativa, da maior queda para a menor;
 * - negociados: pelo volume do dia, do maior para o menor.
 *
 * @param {object} radar
 * @param {object} filtro
 * @param {'acao'|'fii'} filtro.tipo
 * @param {'altas'|'baixas'|'negociados'} filtro.lista
 * @param {'semana'|'mes'|'ano'} filtro.periodo
 * @param {number|null} [filtro.precoMaximoCentavos] Preço máximo de 1 unidade (null = qualquer).
 * @returns {object[]} No máximo LIMITE_DA_LISTA ativos.
 */
export function listaDoMercado(radar, { tipo, lista, periodo, precoMaximoCentavos = null }) {
  const ativos = (radar.mercado?.ativos ?? [])
    .filter((a) => a.tipo === tipo)
    .filter((a) => precoMaximoCentavos === null || a.precoCentavos <= precoMaximoCentavos);

  let ordenados;
  if (lista === 'negociados') {
    ordenados = [...ativos].sort((a, b) => b.volumeCentavos - a.volumeCentavos);
  } else {
    const sinal = lista === 'altas' ? 1 : -1;
    ordenados = ativos
      .filter((a) => a.variacoes[periodo] !== null && sinal * a.variacoes[periodo] > 0)
      .sort((a, b) => sinal * (b.variacoes[periodo] - a.variacoes[periodo]));
  }
  return ordenados.slice(0, LIMITE_DA_LISTA);
}

/** 8.2 → "+8,2%"; -3.1 → "−3,1%"; null → "—". */
export function textoDaVariacao(valor) {
  if (valor === null || valor === undefined) return '—';
  const numero = Math.abs(valor).toFixed(1).replace('.', ',');
  if (valor > 0) return `+${numero}%`;
  if (valor < 0) return `−${numero}%`;
  return `${numero}%`;
}

/** Volume em reais, curto: "R$ 1,2 bi", "R$ 45,3 mi", "R$ 300 mil". */
export function textoDoVolume(centavos) {
  const reais = centavos / 100;
  const umaCasa = (n) => n.toFixed(1).replace('.', ',');
  if (reais >= 1e9) return `R$ ${umaCasa(reais / 1e9)} bi`;
  if (reais >= 1e6) return `R$ ${umaCasa(reais / 1e6)} mi`;
  return `R$ ${Math.round(reais / 1e3)} mil`;
}
