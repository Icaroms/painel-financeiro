/**
 * Robô do Radar (Fase 04, parte 4.3a): leitura das taxas do Tesouro Direto.
 *
 * Fonte oficial e gratuita: conjunto de dados "Taxas dos Títulos Ofertados
 * pelo Tesouro Direto", do Tesouro Nacional, no portal Tesouro Transparente
 * (atualizado todo dia útil). É um CSV com o histórico desde 2002:
 *
 *   Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
 *   Tesouro Selic;01/03/2031;09/10/2026;0,07;0,08;17.123,45;17.100,00;17.100,00
 *
 * Colunas conferidas no documento de metadados do conjunto (Taxa.pdf):
 * datas em DD/MM/AAAA, valores com ponto no milhar e vírgula nos centavos.
 *
 * Daqui sai a lista do dia: só a data base mais recente e só os títulos
 * à venda (preço de compra maior que zero).
 *
 * Este arquivo roda no robô (GitHub Actions, Node), não no app.
 * Funções puras: testadas no Node (tests/radar-robo.test.js).
 */

/** De onde vêm os dados (aparece no app, junto com a data). */
export const FONTE_TESOURO = Object.freeze({
  nome: 'Tesouro Nacional (Tesouro Transparente)',
  pagina: 'https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto',
  arquivo: 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv',
});

/** Colunas que o robô usa (o nome é comparado sem acentos e sem diferença de maiúsculas). */
const COLUNAS = Object.freeze({
  tipo: 'tipo titulo',
  vencimento: 'data vencimento',
  dataBase: 'data base',
  taxaCompra: 'taxa compra manha',
  precoCompra: 'pu compra manha',
});

/** "Tipo Título" → "tipo titulo". */
function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** "09/10/2026" → "2026-10-09"; texto fora do formato → null. */
export function dataDoTesouro(texto) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : null;
}

/** "1.234,56" → 1234.56; "-0,01" → -0.01; vazio ou inválido → null. */
export function numeroDoTesouro(texto) {
  const limpo = String(texto ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (limpo === '' || !/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  return Number(limpo);
}

/**
 * Indexador do título, pelo nome do tipo:
 * - Selic: rende a Selic + a taxa;
 * - IPCA (inclui Renda+ e Educa+): rende a inflação + a taxa;
 * - IGP-M: rende o IGP-M + a taxa;
 * - prefixado: a taxa é o rendimento inteiro, conhecido na compra.
 *
 * @param {string} tipo Ex.: "Tesouro IPCA+ com Juros Semestrais".
 * @returns {'selic'|'ipca'|'igpm'|'prefixado'|'outro'}
 */
export function indexadorDoTipo(tipo) {
  const t = normalizar(tipo);
  if (t.includes('selic')) return 'selic';
  if (t.includes('igpm') || t.includes('igp-m')) return 'igpm';
  if (t.includes('ipca') || t.includes('renda+') || t.includes('educa+')) return 'ipca';
  if (t.includes('prefixado')) return 'prefixado';
  return 'outro';
}

/**
 * Lê o CSV inteiro e devolve os títulos à venda na data mais recente.
 *
 * @param {string} texto Conteúdo do CSV.
 * @returns {{ dataBase: string, titulos: {
 *   nome: string, tipo: string, indexador: string, vencimento: string,
 *   taxaCompra: number, precoCompraCentavos: number
 * }[] }} titulos: por tipo e depois por vencimento.
 */
export function lerCsvTesouro(texto) {
  const linhas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) throw new Error('O arquivo do Tesouro veio vazio.');

  // Os valores usam vírgula nos centavos, então o separador das colunas é o ponto e vírgula.
  const separador = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = linhas[0].split(separador).map(normalizar);
  const indice = {};
  for (const [campo, nome] of Object.entries(COLUNAS)) {
    indice[campo] = cabecalho.indexOf(nome);
    if (indice[campo] === -1) {
      throw new Error(`O arquivo do Tesouro mudou: não achei a coluna "${nome}". Cabeçalho: ${linhas[0]}`);
    }
  }

  const registros = linhas.slice(1).map((linha) => {
    const c = linha.split(separador);
    return {
      tipo: (c[indice.tipo] ?? '').trim(),
      vencimento: dataDoTesouro(c[indice.vencimento]),
      dataBase: dataDoTesouro(c[indice.dataBase]),
      taxaCompra: numeroDoTesouro(c[indice.taxaCompra]),
      precoCompra: numeroDoTesouro(c[indice.precoCompra]),
    };
  }).filter((r) => r.tipo && r.vencimento && r.dataBase);

  if (registros.length === 0) throw new Error('O arquivo do Tesouro não tem nenhuma linha válida.');
  const dataBase = registros.reduce((maior, r) => (r.dataBase > maior ? r.dataBase : maior), '');

  const titulos = registros
    .filter((r) => r.dataBase === dataBase && r.precoCompra !== null && r.precoCompra > 0 && r.taxaCompra !== null)
    .map((r) => ({
      nome: `${r.tipo} ${r.vencimento.slice(0, 4)}`,
      tipo: r.tipo,
      indexador: indexadorDoTipo(r.tipo),
      vencimento: r.vencimento,
      taxaCompra: r.taxaCompra,
      precoCompraCentavos: Math.round(r.precoCompra * 100),
    }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR') || a.vencimento.localeCompare(b.vencimento));

  if (titulos.length === 0) throw new Error(`Nenhum título à venda na data ${dataBase}.`);
  return { dataBase, titulos };
}
