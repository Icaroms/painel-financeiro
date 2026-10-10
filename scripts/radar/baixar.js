/**
 * Robô do Radar: downloads e datas (Fase 04, parte 4.3b).
 *
 * - Os arquivos da B3 são baixados com o curl (já vem no GitHub Actions).
 *   O site da B3 é conhecido por ter a cadeia de certificados incompleta:
 *   o robô tenta primeiro com a verificação normal e, só se o erro for de
 *   certificado (código 60 do curl), tenta de novo sem verificar e avisa no log.
 *   São dados públicos, conferidos pelo formato na leitura.
 * - O ZIP é aberto com o unzip (também já vem no GitHub Actions).
 * - Dia sem pregão (fim de semana, feriado) não tem arquivo: o robô volta
 *   um dia de cada vez até achar (no máximo DIAS_PARA_TRAS).
 *
 * As funções de data são puras e testadas no Node; as de download só rodam no robô.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const executar = promisify(execFile);

/** Quantos dias para trás o robô procura um pregão (cobre feriados emendados). */
export const DIAS_PARA_TRAS = 7;

/* ------------------------------------------------------------------ */
/* Datas (puras)                                                      */
/* ------------------------------------------------------------------ */

/** "AAAA-MM-DD" → Date em UTC (meio-dia, para nunca virar o dia). */
const emUtc = (data) => new Date(`${data}T12:00:00Z`);
const comoTexto = (date) => date.toISOString().slice(0, 10);

/** Data menos N dias. */
export function menosDias(data, dias) {
  const d = emUtc(data);
  d.setUTCDate(d.getUTCDate() - dias);
  return comoTexto(d);
}

/**
 * Data menos N meses, presa ao último dia do mês quando ele não existe
 * (31/03 − 1 mês = 28 ou 29/02).
 */
export function menosMeses(data, meses) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const total = ano * 12 + (mes - 1) - meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return `${novoAno}-${String(novoMes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

/** Datas a tentar, da data pedida para trás: [data, data−1, ...] (DIAS_PARA_TRAS ao todo). */
export function datasParaTentar(data, quantidade = DIAS_PARA_TRAS) {
  return Array.from({ length: quantidade }, (_, i) => menosDias(data, i));
}

/** Datas de referência dos períodos, a partir do pregão mais recente. */
export function datasDosPeriodos(dataBase) {
  return {
    semana: menosDias(dataBase, 7),
    mes: menosMeses(dataBase, 1),
    ano: menosMeses(dataBase, 12),
  };
}

/** "Hoje" no horário de Brasília (UTC−3), em "AAAA-MM-DD". */
export function hojeEmBrasilia(agora = new Date()) {
  return comoTexto(new Date(agora.getTime() - 3 * 60 * 60 * 1000));
}

/* ------------------------------------------------------------------ */
/* Downloads (só no robô)                                             */
/* ------------------------------------------------------------------ */

/** Erro de "arquivo não existe" (dia sem pregão). */
export class SemArquivo extends Error {}

/**
 * Baixa um arquivo com o curl.
 * @returns {Promise<void>} Lança SemArquivo para 404 e Error para os outros problemas.
 */
async function curl(endereco, destino) {
  const base = ['--fail', '--silent', '--show-error', '--location', '--retry', '2', '--max-time', '120', '--output', destino];
  try {
    await executar('curl', [...base, endereco]);
  } catch (erro) {
    if (erro.code === 22 && /\b404\b/.test(erro.stderr ?? '')) throw new SemArquivo(endereco);
    if (erro.code !== 60) throw new Error(`Download falhou (curl ${erro.code}): ${endereco} ${erro.stderr ?? ''}`.trim());
    // Código 60: certificado do site com problema. Tenta de novo sem verificar.
    console.warn(`Aviso: certificado do site com problema; baixando sem verificar: ${endereco}`);
    try {
      await executar('curl', ['--insecure', ...base, endereco]);
    } catch (erro2) {
      if (erro2.code === 22 && /\b404\b/.test(erro2.stderr ?? '')) throw new SemArquivo(endereco);
      throw new Error(`Download falhou (curl ${erro2.code}): ${endereco} ${erro2.stderr ?? ''}`.trim());
    }
  }
}

/**
 * Baixa um ZIP e devolve o texto de arquivos de dentro dele, lidos em Latin-1.
 *
 * @param {string} endereco
 * @param {string[]} [padroes] Nomes (com * e ?) dos arquivos de dentro, um texto por padrão.
 *   Sem padrões: o conteúdo de todos os arquivos, como um texto só.
 * @returns {Promise<string[]>}
 */
export async function baixarZip(endereco, padroes = []) {
  const pasta = await mkdtemp(join(tmpdir(), 'radar-'));
  try {
    const zip = join(pasta, 'arquivo.zip');
    await curl(endereco, zip);
    const extrair = async (args) => {
      try {
        const { stdout } = await executar('unzip', ['-p', zip, ...args], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
        return new TextDecoder('latin1').decode(stdout);
      } catch {
        // Alguns servidores devolvem uma página (e não 404) quando o arquivo não existe.
        throw new SemArquivo(`${endereco} (não é um ZIP, ou não tem ${args.join(' ') || 'arquivos'})`);
      }
    };
    if (padroes.length === 0) return [await extrair([])];
    const textos = [];
    for (const padrao of padroes) textos.push(await extrair([padrao]));
    return textos;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

/** Baixa um ZIP e devolve o texto do(s) arquivo(s) de dentro, lido em Latin-1. */
export async function baixarZipComoTexto(endereco) {
  return (await baixarZip(endereco))[0];
}

/**
 * Procura o pregão mais próximo de uma data (para trás) e devolve o arquivo dele.
 *
 * @param {string} data "AAAA-MM-DD".
 * @param {(data: string) => string} enderecoDoDia
 * @param {(texto: string) => object} ler Função que lê o texto do arquivo.
 * @returns {Promise<object>} O que `ler` devolver.
 */
export async function pregaoMaisProximo(data, enderecoDoDia, ler) {
  let ultimoErro = null;
  for (const tentativa of datasParaTentar(data)) {
    try {
      return ler(await baixarZipComoTexto(enderecoDoDia(tentativa)));
    } catch (erro) {
      // Dia sem pregão é normal; outros erros vão para o log e o robô tenta o dia anterior.
      if (!(erro instanceof SemArquivo)) console.warn(`Aviso (${tentativa}): ${erro.message}`);
      ultimoErro = erro;
    }
  }
  throw new Error(`Nenhum pregão encontrado entre ${datasParaTentar(data).at(-1)} e ${data}. Último erro: ${ultimoErro?.message}`);
}
