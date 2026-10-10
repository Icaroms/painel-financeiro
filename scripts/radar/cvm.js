/**
 * Robô do Radar (Fase 04, parte 4.3c): dividendos e valor patrimonial dos FIIs.
 *
 * Fonte oficial e gratuita: CVM, dados abertos, "FII: Documentos: Informe
 * Mensal Estruturado" (um ZIP por ano, atualizado toda semana):
 *   https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{ano}.zip
 * Dentro do ZIP há CSVs (separador ";"). O robô usa dois:
 * - "geral": o código ISIN do fundo (o mesmo do arquivo da B3), para ligar
 *   o informe ao código de negociação (HGLG11...);
 * - "complemento": o dividend yield do mês e o valor patrimonial da cota.
 *
 * O dicionário de dados da CVM fica dentro de um ZIP; por segurança o robô
 * acha cada coluna por PEDAÇO do nome (ex.: "isin", "dividend_yield"), sem
 * acento e sem diferença de maiúsculas, e escreve no log os cabeçalhos que
 * encontrou. Se uma coluna sumir, só a parte dos FIIs falha (com o cabeçalho
 * no erro) e o resto do radar segue.
 *
 * O que vai para o radar, por FII com negociação relevante na B3:
 * - dividendos em 12 meses: soma do "dividend yield do mês" informado pelo
 *   fundo à CVM nos últimos 12 meses (em %). O app mostra com esse nome
 *   ("informado pelo fundo à CVM");
 * - P/VP: preço na B3 ÷ valor patrimonial da cota (último informe).
 *
 * Funções puras: testadas no Node (tests/radar-cvm.test.js).
 */

/** De onde vêm os dados (aparece no app). */
export const FONTE_CVM = Object.freeze({
  nome: 'CVM (Informe Mensal dos FIIs) e B3',
  pagina: 'https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal',
});

/** Endereço do ZIP de um ano. */
export const enderecoDoAno = (ano) => `https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_${ano}.zip`;

/** Mínimo de meses com informe nos últimos 12 para calcular os dividendos de 12 meses. */
export const MESES_MINIMOS = 10;

/** Dividend yield de UM mês acima disto (em %) é tratado como erro de digitação do fundo e ignorado. */
export const DY_MES_MAXIMO = 5;

/** "Código ISIN" → "codigo isin" (sem acento, minúsculo, "_" e espaços iguais). */
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '_');
}

/**
 * Lê um CSV da CVM (separador ";", primeira linha = cabeçalho).
 *
 * @param {string} texto
 * @returns {{ cabecalho: string[], linhas: string[][] }} cabecalho já normalizado.
 */
export function lerCsvCvm(texto) {
  const linhas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) throw new Error('O arquivo da CVM veio vazio.');
  return {
    cabecalho: linhas[0].split(';').map(normalizar),
    linhas: linhas.slice(1).map((l) => l.split(';')),
  };
}

/**
 * Posição da coluna cujo nome tem TODOS os pedaços pedidos.
 *
 * @param {string[]} cabecalho Normalizado.
 * @param {string[]} pedacos Ex.: ['valor', 'patrimonial', 'cota'].
 * @param {string} arquivo Nome do arquivo, para a mensagem de erro.
 * @returns {number}
 */
export function acharColuna(cabecalho, pedacos, arquivo) {
  const indice = cabecalho.findIndex((nome) => pedacos.every((p) => nome.includes(p)));
  if (indice === -1) {
    throw new Error(`CVM: não achei a coluna com "${pedacos.join(' ')}" no arquivo ${arquivo}. Cabeçalho: ${cabecalho.join(';')}`);
  }
  return indice;
}

/** "0,85" ou "0.85" ou "1.234,56" → número; vazio/inválido → null. */
export function numeroCvm(texto) {
  let t = String(texto ?? '').trim().replace(/^"|"$/g, '');
  if (t === '') return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  return /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t) ? Number(t) : null;
}

/** "2026-08-31" ou "31/08/2026" → "2026-08"; inválido → null. */
export function mesCvm(texto) {
  const t = String(texto ?? '').trim().replace(/^"|"$/g, '');
  let partes = /^(\d{4})-(\d{2})-\d{2}/.exec(t);
  if (partes) return `${partes[1]}-${partes[2]}`;
  partes = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(t);
  return partes ? `${partes[2]}-${partes[1]}` : null;
}

/** Só os dígitos do CNPJ ("11.222.333/0001-44" → "11222333000144"). */
const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

/**
 * Lê os arquivos "geral" e "complemento" (de um ou mais anos) e devolve,
 * por ISIN, os meses informados (a versão mais nova de cada mês).
 *
 * @param {{ geral: string[], complemento: string[] }} textos Conteúdos dos CSVs.
 * @returns {{ fundos: Map<string, { cnpj: string, meses: Map<string, { dy: number|null, vpCota: number|null }> }>,
 *   escalaDy: 'fracao'|'porcentagem', cabecalhos: object }}
 *   dy: dividend yield do mês já em % (ex.: 0,85 = 0,85%).
 */
export function lerInformesFii({ geral, complemento }) {
  // 1) geral: CNPJ → ISIN (o mais recente que aparecer).
  const isinDoCnpj = new Map();
  const cabecalhos = {};
  for (const texto of geral) {
    const { cabecalho, linhas } = lerCsvCvm(texto);
    cabecalhos.geral = cabecalho;
    const iCnpj = acharColuna(cabecalho, ['cnpj'], 'geral');
    const iIsin = acharColuna(cabecalho, ['isin'], 'geral');
    for (const l of linhas) {
      const isin = String(l[iIsin] ?? '').trim().replace(/^"|"$/g, '').toUpperCase();
      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) isinDoCnpj.set(soDigitos(l[iCnpj]), isin);
    }
  }

  // 2) complemento: CNPJ + mês → DY do mês e valor patrimonial da cota (versão mais nova).
  const registros = new Map(); // "cnpj|mes" → { versao, dy, vpCota }
  for (const texto of complemento) {
    const { cabecalho, linhas } = lerCsvCvm(texto);
    cabecalhos.complemento = cabecalho;
    const iCnpj = acharColuna(cabecalho, ['cnpj'], 'complemento');
    const iData = acharColuna(cabecalho, ['data', 'referencia'], 'complemento');
    const iVersao = cabecalho.findIndex((n) => n === 'versao' || n.endsWith('_versao'));
    const iDy = acharColuna(cabecalho, ['dividend', 'yield'], 'complemento');
    const iVp = acharColuna(cabecalho, ['valor', 'patrimonial', 'cota'], 'complemento');
    for (const l of linhas) {
      const mes = mesCvm(l[iData]);
      if (!mes) continue;
      const chave = `${soDigitos(l[iCnpj])}|${mes}`;
      const versao = iVersao === -1 ? 0 : (numeroCvm(l[iVersao]) ?? 0);
      if ((registros.get(chave)?.versao ?? -1) > versao) continue;
      registros.set(chave, { versao, dy: numeroCvm(l[iDy]), vpCota: numeroCvm(l[iVp]) });
    }
  }

  // 3) Escala do DY: a mediana de um DY mensal típico é perto de 0,8 (%); como fração seria 0,008.
  const positivos = [...registros.values()].map((r) => r.dy).filter((v) => v !== null && v > 0).sort((a, b) => a - b);
  const mediana = positivos.length ? positivos[Math.floor(positivos.length / 2)] : 1;
  const escalaDy = mediana < 0.05 ? 'fracao' : 'porcentagem';

  // 4) Agrupa por ISIN.
  const fundos = new Map();
  for (const [chave, r] of registros) {
    const [cnpj, mes] = chave.split('|');
    const isin = isinDoCnpj.get(cnpj);
    if (!isin) continue;
    if (!fundos.has(isin)) fundos.set(isin, { cnpj, meses: new Map() });
    fundos.get(isin).meses.set(mes, {
      // Arredonda em 4 casas: 0,009 × 100 não pode virar 0,9000000000000001.
      dy: r.dy === null ? null : Math.round((escalaDy === 'fracao' ? r.dy * 100 : r.dy) * 1e4) / 1e4,
      vpCota: r.vpCota,
    });
  }
  return { fundos, escalaDy, cabecalhos };
}

/** "2026-08" menos N meses. */
function mesMenos(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Dividendos de 12 meses e valor patrimonial de um fundo.
 *
 * @param {Map<string, { dy: number|null, vpCota: number|null }>} meses
 * @returns {{ ultimoMes: string, dividendos12m: number|null, mesesComDados: number, vpCotaCentavos: number|null }|null}
 *   dividendos12m em %, com 2 casas; null com menos de MESES_MINIMOS meses.
 */
export function resumoDoFundo(meses) {
  const ordenados = [...meses.keys()].sort();
  if (ordenados.length === 0) return null;
  const ultimoMes = ordenados.at(-1);
  const janela = Array.from({ length: 12 }, (_, i) => mesMenos(ultimoMes, i));
  const validos = janela
    .map((m) => meses.get(m)?.dy)
    .filter((dy) => dy !== null && dy !== undefined && dy >= 0 && dy <= DY_MES_MAXIMO);
  const soma = validos.reduce((s, dy) => s + dy, 0);
  const vp = meses.get(ultimoMes)?.vpCota;
  return {
    ultimoMes,
    dividendos12m: validos.length >= MESES_MINIMOS ? Math.round(soma * 100) / 100 : null,
    mesesComDados: validos.length,
    vpCotaCentavos: vp && vp > 0 ? Math.round(vp * 100) : null,
  };
}

/**
 * Monta a parte "fiis" do radar: só FIIs com negociação relevante na B3
 * (os do mercado) e com informe recente na CVM.
 *
 * @param {object} dados
 * @param {object[]} dados.ativos Ativos do mercado (montarMercado), com o ISIN de cada FII.
 * @param {string} dados.dataBase Data do pregão da B3.
 * @param {Map} dados.fundos Resultado de lerInformesFii().fundos.
 * @returns {{ fonte: string, link: string, dataBase: string, mesReferencia: string|null, itens: object[] }}
 *   itens: do maior dividendo de 12 meses para o menor (sem dado, no fim).
 */
export function montarFiis({ ativos, dataBase, fundos }) {
  const resumos = ativos
    .filter((a) => a.tipo === 'fii' && a.isin && fundos.has(a.isin))
    .map((a) => ({ ativo: a, resumo: resumoDoFundo(fundos.get(a.isin).meses) }))
    .filter((x) => x.resumo);

  // Mês de referência: o mais recente informado; fundo com informe velho (3+ meses antes) fica de fora.
  const mesReferencia = resumos.map((x) => x.resumo.ultimoMes).sort().at(-1) ?? null;
  const itens = resumos
    .filter((x) => x.resumo.ultimoMes >= mesMenos(mesReferencia, 2))
    .map(({ ativo, resumo }) => ({
      codigo: ativo.codigo,
      nome: ativo.nome,
      precoCentavos: ativo.precoCentavos,
      volumeCentavos: ativo.volumeCentavos,
      dividendos12m: resumo.dividendos12m,
      pvp: resumo.vpCotaCentavos ? Math.round((ativo.precoCentavos / resumo.vpCotaCentavos) * 100) / 100 : null,
      ultimoMes: resumo.ultimoMes,
    }))
    .sort((a, b) => (b.dividendos12m ?? -1) - (a.dividendos12m ?? -1));

  return { fonte: FONTE_CVM.nome, link: FONTE_CVM.pagina, dataBase, mesReferencia, itens };
}
