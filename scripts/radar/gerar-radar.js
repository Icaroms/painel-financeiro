/**
 * Robô do Radar de opções (Fase 04, partes 4.3a, 4.3b e 4.3c).
 *
 * Roda no GitHub Actions (.github/workflows/radar.yml), uma vez por dia:
 * 1. baixa os dados públicos:
 *    - taxas do Tesouro Direto (Tesouro Nacional);
 *    - cotações de ações e FIIs (B3): o pregão mais recente e os de
 *      1 semana, 1 mês e 12 meses antes, para as variações;
 *    - informes mensais dos FIIs (CVM): dividendos de 12 meses e valor
 *      patrimonial da cota (P/VP com o preço da B3);
 * 2. monta o arquivo radar.json;
 * 3. o workflow publica esse arquivo na branch "radar-dados", e o app lê de lá.
 *
 * Cada fonte é independente: se uma falhar (site fora do ar), o robô
 * mantém essa parte do radar anterior e publica o resto. Se TODAS falharem,
 * ele termina com erro e não publica nada.
 *
 * Uso: node scripts/radar/gerar-radar.js <caminho-do-radar.json>
 * As partes puras são testadas em tests/radar-robo.test.js e tests/radar-b3.test.js.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FONTE_TESOURO, lerCsvTesouro } from './tesouro.js';
import { enderecoDoDia, lerCotahist, montarMercado } from './b3.js';
import { datasDosPeriodos, hojeEmBrasilia, pregaoMaisProximo, baixarZip, SemArquivo } from './baixar.js';
import { enderecoDoAno, lerInformesFii, montarFiis } from './cvm.js';

/** Identificação do arquivo. O app (src/radar.js) confere estes dois valores. */
export const FORMATO_RADAR = 'painel-financeiro-radar';
export const VERSAO_RADAR = 1;

/** Tempo máximo esperando cada download feito com fetch (o CSV do Tesouro tem uns 14 MB). */
const TEMPO_LIMITE_MS = 120_000;

/**
 * Monta o radar a partir das partes já lidas. Uma parte pode ser null
 * (fonte fora do ar e sem radar anterior).
 *
 * @param {object} partes
 * @param {{ dataBase: string, titulos: object[] }|null} partes.tesouro Títulos lidos do CSV,
 *   ou a parte "tesouro" de um radar anterior (já com fonte e link).
 * @param {object|null} [partes.mercado] Resultado de montarMercado (ou o do radar anterior).
 * @param {object|null} [partes.fiis] Resultado de montarFiis (ou o do radar anterior).
 * @param {Date} [partes.agora]
 * @returns {object} O conteúdo do radar.json.
 */
export function montarRadar({ tesouro, mercado = null, fiis = null, agora = new Date() }) {
  return {
    formato: FORMATO_RADAR,
    versao: VERSAO_RADAR,
    geradoEm: agora.toISOString(),
    tesouro: tesouro
      ? { fonte: FONTE_TESOURO.nome, link: FONTE_TESOURO.pagina, dataBase: tesouro.dataBase, titulos: tesouro.titulos }
      : null,
    mercado,
    fiis,
  };
}

/** Baixa um texto com fetch, tempo limite e erro claro (usado para o Tesouro). */
async function baixarTexto(endereco) {
  const resposta = await fetch(endereco, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    headers: { 'User-Agent': 'painel-financeiro-radar (github.com/Icaroms/painel-financeiro)' },
  });
  if (!resposta.ok) throw new Error(`Download falhou (${resposta.status}): ${endereco}`);
  // O CSV do Tesouro vem em Latin-1 em alguns dias e em UTF-8 em outros:
  // tenta UTF-8 e, se aparecerem caracteres inválidos, lê de novo como Latin-1.
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('latin1').decode(bytes) : utf8;
}

/** Radar publicado ontem (para reaproveitar uma parte cuja fonte falhar hoje). */
async function radarAnterior() {
  const repositorio = process.env.GITHUB_REPOSITORY ?? 'Icaroms/painel-financeiro';
  try {
    const resposta = await fetch(`https://raw.githubusercontent.com/${repositorio}/radar-dados/radar.json`, {
      signal: AbortSignal.timeout(30_000),
    });
    return resposta.ok ? await resposta.json() : null;
  } catch {
    return null;
  }
}

/** Tesouro Direto: lê o CSV do dia. */
async function parteDoTesouro() {
  console.log('Baixando as taxas do Tesouro Direto…');
  const tesouro = lerCsvTesouro(await baixarTexto(FONTE_TESOURO.arquivo));
  console.log(`Tesouro: ${tesouro.titulos.length} títulos à venda em ${tesouro.dataBase}.`);
  return tesouro;
}

/** B3: pregão mais recente + os de referência das variações. */
async function parteDoMercado() {
  console.log('Baixando as cotações da B3…');
  const atual = await pregaoMaisProximo(hojeEmBrasilia(), enderecoDoDia, lerCotahist);
  console.log(`B3: pregão de ${atual.data} com ${atual.papeis.size} ações e FIIs.`);

  const referencias = {};
  for (const [periodo, data] of Object.entries(datasDosPeriodos(atual.data))) {
    try {
      referencias[periodo] = await pregaoMaisProximo(data, enderecoDoDia, lerCotahist);
      console.log(`B3 (${periodo}): pregão de ${referencias[periodo].data}.`);
    } catch (erro) {
      // Sem esse pregão, a variação desse período fica vazia (o resto continua).
      console.warn(`Aviso: sem o pregão de referência de ${periodo} (${data}): ${erro.message}`);
    }
  }

  const mercado = montarMercado({ atual, referencias });
  console.log(`B3: ${mercado.ativos.length} ativos com liquidez entram no radar.`);
  return mercado;
}

/** CVM: informes mensais dos FIIs do ano do pregão e do ano anterior (12 meses podem cruzar a virada do ano). */
async function parteDosFiis(mercado) {
  if (!mercado) throw new Error('sem as cotações da B3, não dá para calcular o P/VP');
  console.log('Baixando os informes mensais dos FIIs (CVM)…');
  const ano = Number(mercado.dataBase.slice(0, 4));
  const geral = [];
  const complemento = [];
  for (const a of [ano - 1, ano]) {
    try {
      const [textoGeral, textoComplemento] = await baixarZip(enderecoDoAno(a), ['*geral*', '*complemento*']);
      geral.push(textoGeral);
      complemento.push(textoComplemento);
      console.log(`CVM: informes de ${a} baixados.`);
    } catch (erro) {
      // No começo do ano o arquivo do ano novo pode ainda não existir.
      if (!(erro instanceof SemArquivo)) throw erro;
      console.warn(`Aviso: sem os informes de ${a} na CVM.`);
    }
  }
  if (geral.length === 0) throw new Error('nenhum arquivo de informes da CVM');

  const { fundos, escalaDy, cabecalhos } = lerInformesFii({ geral, complemento });
  console.log(`CVM: ${fundos.size} FIIs com ISIN; dividend yield do mês veio como ${escalaDy}.`);
  console.log(`CVM (cabeçalho do complemento): ${cabecalhos.complemento.join(';').slice(0, 400)}`);
  const fiis = montarFiis({ ativos: mercado.ativos, dataBase: mercado.dataBase, fundos });
  const comDado = fiis.itens.filter((f) => f.dividendos12m !== null).length;
  console.log(`CVM: ${fiis.itens.length} FIIs com liquidez ligados ao informe (${comDado} com 12 meses), até ${fiis.mesReferencia}.`);
  return fiis;
}

/** Ponto de entrada do robô. */
async function principal() {
  const saida = process.argv[2];
  if (!saida) throw new Error('Informe onde gravar o radar: node scripts/radar/gerar-radar.js <arquivo.json>');

  const anterior = await radarAnterior();
  let novas = 0;

  let tesouro = null;
  try {
    tesouro = await parteDoTesouro();
    novas += 1;
  } catch (erro) {
    console.warn(`Aviso: Tesouro Direto falhou (${erro.message}). ${anterior?.tesouro ? 'Mantendo a parte do radar anterior.' : ''}`);
    tesouro = anterior?.tesouro ?? null;
  }

  let mercado = null;
  try {
    mercado = await parteDoMercado();
    novas += 1;
  } catch (erro) {
    console.warn(`Aviso: B3 falhou (${erro.message}). ${anterior?.mercado ? 'Mantendo a parte do radar anterior.' : ''}`);
    mercado = anterior?.mercado ?? null;
  }

  let fiis = null;
  try {
    fiis = await parteDosFiis(mercado);
    novas += 1;
  } catch (erro) {
    console.warn(`Aviso: FIIs (CVM) falhou (${erro.message}). ${anterior?.fiis ? 'Mantendo a parte do radar anterior.' : ''}`);
    fiis = anterior?.fiis ?? null;
  }

  if (novas === 0) throw new Error('Todas as fontes falharam: nada foi publicado (o app continua com o último radar).');

  const radar = montarRadar({ tesouro, mercado, fiis });
  await mkdir(dirname(saida), { recursive: true });
  await writeFile(saida, `${JSON.stringify(radar)}\n`, 'utf8');
  console.log(`Radar gravado em ${saida}.`);
}

// Só roda quando chamado pela linha de comando (os testes importam sem rodar).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((erro) => {
    console.error(`Erro no robô do radar: ${erro.message}`);
    process.exitCode = 1;
  });
}
