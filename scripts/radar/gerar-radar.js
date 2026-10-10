/**
 * Robô do Radar de opções (Fase 04, parte 4.3a).
 *
 * Roda no GitHub Actions (.github/workflows/radar.yml), uma vez por dia:
 * 1. baixa os dados públicos (por enquanto, as taxas do Tesouro Direto);
 * 2. monta o arquivo radar.json;
 * 3. o workflow publica esse arquivo na branch "radar-dados", e o app lê de lá.
 *
 * Se alguma fonte falhar, o robô termina com erro e NÃO publica nada: o app
 * continua com o último radar bom (o da branch e o guardado no aparelho).
 *
 * Uso: node scripts/radar/gerar-radar.js <caminho-do-radar.json>
 * Teste local (sem internet): as partes puras ficam em tests/radar-robo.test.js.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FONTE_TESOURO, lerCsvTesouro } from './tesouro.js';

/** Identificação do arquivo. O app (src/radar.js) confere estes dois valores. */
export const FORMATO_RADAR = 'painel-financeiro-radar';
export const VERSAO_RADAR = 1;

/** Tempo máximo esperando cada download (2 minutos: o CSV do Tesouro tem uns 14 MB). */
const TEMPO_LIMITE_MS = 120_000;

/**
 * Monta o radar a partir dos dados já lidos.
 *
 * @param {object} partes
 * @param {{ dataBase: string, titulos: object[] }} partes.tesouro
 * @param {Date} [partes.agora]
 * @returns {object} O conteúdo do radar.json.
 */
export function montarRadar({ tesouro, agora = new Date() }) {
  return {
    formato: FORMATO_RADAR,
    versao: VERSAO_RADAR,
    geradoEm: agora.toISOString(),
    tesouro: {
      fonte: FONTE_TESOURO.nome,
      link: FONTE_TESOURO.pagina,
      dataBase: tesouro.dataBase,
      titulos: tesouro.titulos,
    },
  };
}

/** Baixa um texto com tempo limite e erro claro. */
async function baixarTexto(endereco) {
  const resposta = await fetch(endereco, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    headers: { 'User-Agent': 'painel-financeiro-radar (github.com/Icaroms/painel-financeiro)' },
  });
  if (!resposta.ok) throw new Error(`Download falhou (${resposta.status}): ${endereco}`);
  // O CSV do Tesouro vem em Latin-1 (ISO-8859-1) em alguns dias e em UTF-8 em outros:
  // tenta UTF-8 e, se aparecerem caracteres inválidos, lê de novo como Latin-1.
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('latin1').decode(bytes) : utf8;
}

/** Ponto de entrada do robô. */
async function principal() {
  const saida = process.argv[2];
  if (!saida) throw new Error('Informe onde gravar o radar: node scripts/radar/gerar-radar.js <arquivo.json>');

  console.log('Baixando as taxas do Tesouro Direto…');
  const tesouro = lerCsvTesouro(await baixarTexto(FONTE_TESOURO.arquivo));
  console.log(`Tesouro: ${tesouro.titulos.length} títulos à venda em ${tesouro.dataBase}.`);

  const radar = montarRadar({ tesouro });
  await mkdir(dirname(saida), { recursive: true });
  await writeFile(saida, `${JSON.stringify(radar, null, 2)}\n`, 'utf8');
  console.log(`Radar gravado em ${saida}.`);
}

// Só roda quando chamado pela linha de comando (os testes importam sem rodar).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((erro) => {
    console.error(`Erro no robô do radar: ${erro.message}`);
    process.exitCode = 1;
  });
}
