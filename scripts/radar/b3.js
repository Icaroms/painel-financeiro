/**
 * Robô do Radar (Fase 04, parte 4.3b): cotações de ações e FIIs da B3.
 *
 * Fonte oficial e gratuita: arquivo diário da "Série Histórica de Cotações"
 * da B3 (COTAHIST), um ZIP com um texto de colunas de tamanho fixo
 * (245 caracteres por linha), em Latin-1:
 *   https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{DDMMAAAA}.ZIP
 *
 * Posições conferidas no documento oficial "SeriesHistoricas_Layout.pdf"
 * (registro de cotação, TIPREG = 01). Os preços têm 2 casas decimais
 * implícitas (sem vírgula): "0000000001234" = R$ 12,34.
 *
 * O que entra no radar:
 * - ações do lote padrão (CODBDI 02, mercado à vista TPMERC 010);
 * - FIIs (CODBDI 12, mercado à vista);
 * - só os com negociação relevante no dia (LIQUIDEZ_MINIMA), para não
 *   aparecer papel quase sem negócio, que "dispara" com uma ordem só.
 *
 * Variação de preço (semana, mês, 12 meses): fechamento de hoje contra o
 * fechamento do pregão daquela data. Os preços da B3 NÃO são ajustados por
 * dividendos nem por desdobramentos/grupamentos: quando a mudança parece
 * um desdobramento (o preço vira 1/2, 1/10, 3x...), a variação fica vazia,
 * para não mostrar uma "queda de 90%" que não aconteceu.
 *
 * Funções puras: testadas no Node (tests/radar-b3.test.js).
 */

/** Endereço do arquivo diário de uma data ("2026-10-09" → ...COTAHIST_D09102026.ZIP). */
export function enderecoDoDia(data) {
  const [ano, mes, dia] = data.split('-');
  return `https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D${dia}${mes}${ano}.ZIP`;
}

/** De onde vêm os dados (aparece no app, junto com a data). */
export const FONTE_B3 = Object.freeze({
  nome: 'B3 (Série Histórica de Cotações)',
  pagina: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/',
});

/** Volume mínimo negociado no dia para entrar no radar, em centavos. */
export const LIQUIDEZ_MINIMA = Object.freeze({
  acao: 100_000_000, // R$ 1 milhão
  fii: 30_000_000, // R$ 300 mil
});

/** Classificação dos papéis que entram no radar: CODBDI → tipo. */
const TIPO_POR_CODBDI = Object.freeze({ '02': 'acao', 12: 'fii' });

/** Pedaço da linha pelas posições do layout (contadas a partir de 1, inclusive). */
const campo = (linha, inicio, fim) => linha.slice(inicio - 1, fim);

/**
 * Lê uma linha de cotação (TIPREG 01). Outras linhas (cabeçalho 00, rodapé 99) → null.
 *
 * @param {string} linha
 * @returns {{ data: string, codbdi: string, codigo: string, tpmerc: string, nome: string,
 *   especificacao: string, precoCentavos: number, negocios: number, volumeCentavos: number,
 *   fator: number, isin: string }|null} precoCentavos: último preço do dia, já por 1 unidade (FATCOT).
 *   isin: código ISIN (CODISI, 231-242), que liga o FII ao informe da CVM (parte 4.3c).
 */
export function lerLinhaCotahist(linha) {
  if (linha.length < 217 || campo(linha, 1, 2) !== '01') return null;
  const data = campo(linha, 3, 10);
  const fator = Number(campo(linha, 211, 217)) || 1;
  return {
    data: `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`,
    codbdi: campo(linha, 11, 12).trim(),
    codigo: campo(linha, 13, 24).trim(),
    tpmerc: campo(linha, 25, 27),
    nome: campo(linha, 28, 39).trim(),
    especificacao: campo(linha, 40, 49).trim(),
    // PREULT (109-121) em centavos; com FATCOT 1000 o preço é do lote de mil.
    precoCentavos: Math.round(Number(campo(linha, 109, 121)) / fator),
    negocios: Number(campo(linha, 148, 152)),
    volumeCentavos: Number(campo(linha, 171, 188)),
    fator,
    isin: campo(linha, 231, 242).trim(),
  };
}

/**
 * Lê o arquivo do dia inteiro e devolve só as ações e os FIIs à vista.
 *
 * @param {string} texto Conteúdo do TXT (já descompactado).
 * @returns {{ data: string, papeis: Map<string, object> }} papeis: código → registro (com "tipo").
 */
export function lerCotahist(texto) {
  const papeis = new Map();
  let data = null;
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    const r = lerLinhaCotahist(linha);
    if (!r) continue;
    data ??= r.data;
    const tipo = TIPO_POR_CODBDI[r.codbdi];
    if (!tipo || r.tpmerc !== '010' || r.precoCentavos <= 0) continue;
    papeis.set(r.codigo, { ...r, tipo });
  }
  if (!data) throw new Error('O arquivo da B3 não tem nenhuma linha de cotação.');
  return { data, papeis };
}

/**
 * A mudança de preço parece um desdobramento ou grupamento? (o preço vira
 * perto de 1/n ou n vezes o anterior, com n inteiro de 2 a 100)
 *
 * @param {number} antes Centavos.
 * @param {number} depois Centavos.
 * @returns {boolean}
 */
export function pareceDesdobramento(antes, depois) {
  if (antes <= 0 || depois <= 0) return false;
  const razao = depois > antes ? depois / antes : antes / depois;
  if (razao < 1.9) return false;
  const inteiro = Math.round(razao);
  return inteiro >= 2 && inteiro <= 100 && Math.abs(razao - inteiro) / inteiro < 0.04;
}

/**
 * Variação percentual do preço, com 1 casa decimal. null quando não há
 * preço de referência ou quando parece desdobramento.
 *
 * @param {number|undefined} antesCentavos
 * @param {number} agoraCentavos
 * @returns {number|null}
 */
export function variacao(antesCentavos, agoraCentavos) {
  if (!antesCentavos || antesCentavos <= 0) return null;
  if (pareceDesdobramento(antesCentavos, agoraCentavos)) return null;
  return Math.round(((agoraCentavos - antesCentavos) / antesCentavos) * 1000) / 10;
}

/**
 * Monta a parte "mercado" do radar.
 *
 * @param {object} dados
 * @param {{ data: string, papeis: Map }} dados.atual O pregão mais recente.
 * @param {{ semana?: object, mes?: object, ano?: object }} dados.referencias
 *   Pregões de 1 semana, 1 mês e 12 meses antes (cada um { data, papeis }), quando houver.
 * @returns {{ dataBase: string, referencias: object, ativos: object[] }}
 *   ativos: ordenados por volume (maior primeiro).
 */
export function montarMercado({ atual, referencias }) {
  const periodos = ['semana', 'mes', 'ano'];
  const ativos = [...atual.papeis.values()]
    .filter((p) => p.volumeCentavos >= LIQUIDEZ_MINIMA[p.tipo])
    .map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      tipo: p.tipo,
      precoCentavos: p.precoCentavos,
      volumeCentavos: p.volumeCentavos,
      negocios: p.negocios,
      isin: p.isin,
      variacoes: Object.fromEntries(periodos.map((periodo) => [
        periodo,
        variacao(referencias[periodo]?.papeis.get(p.codigo)?.precoCentavos, p.precoCentavos),
      ])),
    }))
    .sort((a, b) => b.volumeCentavos - a.volumeCentavos);

  return {
    fonte: FONTE_B3.nome,
    link: FONTE_B3.pagina,
    dataBase: atual.data,
    // Data do pregão usado em cada período (null = não deu para baixar).
    referencias: Object.fromEntries(periodos.map((periodo) => [periodo, referencias[periodo]?.data ?? null])),
    ativos,
  };
}
