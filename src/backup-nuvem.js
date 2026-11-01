/**
 * Backups na nuvem (Fase 05, parte 5.4): montar o envio, conferir o tamanho
 * e descrever cada backup para a tela.
 *
 * O backup na nuvem é o MESMO pacote do arquivo de backup (src/persistencia.js),
 * então restaurar usa as mesmas regras de leitura (lerBackup, em src/backup.js).
 *
 * Regras:
 * - o servidor guarda os 10 mais recentes de cada conta;
 * - antes de enviar, o tamanho é comparado com o limite que o servidor informa
 *   (5 MB por padrão), para não falhar sem explicação;
 * - o app envia um backup sozinho quando o último da nuvem tem 7 dias ou mais.
 *
 * Funções puras: testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { empacotar } from './persistencia.js';
import { hojeLocal } from './datas.js';

/** Limite usado até o servidor informar o dele (o mesmo do arquivo de backup). */
export const TAMANHO_MAXIMO_PADRAO = 5 * 1024 * 1024;

/** Depois de quantos dias sem backup na nuvem o app envia um sozinho (e avisa, se não conseguir). */
export const DIAS_PARA_BACKUP_NUVEM = 7;

/** Tamanho de um texto em bytes, como ele viaja (UTF-8). */
export function tamanhoEmBytes(texto) {
  return new TextEncoder().encode(texto).length;
}

/** "820 bytes", "45 KB", "1,4 MB". */
export function textoDoTamanho(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Monta o texto do backup e confere o tamanho.
 *
 * @param {object} dados Os dados do app (já com o ultimoBackupEm deste envio).
 * @param {object} [opcoes]
 * @param {Date} [opcoes.agora]
 * @param {number} [opcoes.tamanhoMaximo] Em bytes (o servidor informa na lista).
 * @returns {{ texto: string, bytes: number }}
 */
export function prepararBackupNuvem(dados, { agora = new Date(), tamanhoMaximo = TAMANHO_MAXIMO_PADRAO } = {}) {
  const texto = JSON.stringify(empacotar(dados, { agora }));
  const bytes = tamanhoEmBytes(texto);
  if (bytes > tamanhoMaximo) {
    throw new ErroValidacao(
      'backup',
      `O backup tem ${textoDoTamanho(bytes)} e a nuvem aceita até ${textoDoTamanho(tamanhoMaximo)}. `
        + 'Use "Exportar backup" para guardar um arquivo.',
    );
  }
  return { texto, bytes };
}

/** O backup mais recente de uma lista (o "criadoEm" maior), ou null. */
export function ultimoBackupDaLista(backups) {
  let ultimo = null;
  for (const backup of backups ?? []) {
    const momento = Date.parse(backup.criadoEm);
    if (!Number.isNaN(momento) && (ultimo === null || momento > Date.parse(ultimo))) ultimo = backup.criadoEm;
  }
  return ultimo;
}

/** Dias de calendário (no fuso do aparelho) entre dois momentos. */
function diasEntre(antes, depois) {
  const emDias = (momento) => {
    const [ano, mes, dia] = hojeLocal(momento).split('-').map(Number);
    return Date.UTC(ano, mes - 1, dia) / 86_400_000;
  };
  return emDias(depois) - emDias(antes);
}

/**
 * Situação do backup na nuvem, pronta para a tela.
 *
 * @param {string|null} ultimoEm O criadoEm do backup mais recente (ou null).
 * @param {object} [opcoes] { agora, limiteDias }
 * @returns {{ dias: number|null, atrasado: boolean, texto: string }}
 */
export function situacaoDoBackupNuvem(ultimoEm, { agora = new Date(), limiteDias = DIAS_PARA_BACKUP_NUVEM } = {}) {
  const momento = typeof ultimoEm === 'string' ? new Date(ultimoEm) : null;
  if (momento === null || Number.isNaN(momento.getTime())) {
    return { dias: null, atrasado: false, texto: 'Nenhum backup na nuvem ainda.' };
  }
  const dias = Math.max(0, diasEntre(momento, agora));
  let texto;
  if (dias === 0) texto = 'Último backup na nuvem: hoje.';
  else if (dias === 1) texto = 'Último backup na nuvem: ontem.';
  else texto = `Último backup na nuvem: há ${dias} dias.`;
  return { dias, atrasado: dias >= limiteDias, texto };
}

/** O app deve enviar um backup sozinho? (nenhum ainda, ou o último tem 7 dias ou mais) */
export function precisaDeBackupAutomatico(ultimoEm, opcoes = {}) {
  const situacao = situacaoDoBackupNuvem(ultimoEm, opcoes);
  return situacao.dias === null || situacao.atrasado;
}

/** "1 mês" / "3 meses". */
function contar(quantos, singular, plural) {
  return `${quantos} ${quantos === 1 ? singular : plural}`;
}

/**
 * Descrição de um backup da lista, em partes (a data é formatada à parte,
 * no fuso do aparelho).
 *
 * @param {{ criadoEm: string, tamanhoBytes: number, resumo: object }} backup
 * @param {object} [opcoes]
 * @param {string} [opcoes.fuso] Fuso para a data (nos testes, fixo).
 * @returns {{ quando: string, conteudo: string, tamanho: string }}
 */
export function descreverBackup(backup, { fuso } = {}) {
  const quando = new Date(backup.criadoEm).toLocaleString('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', ...(fuso ? { timeZone: fuso } : {}),
  });
  const resumo = backup.resumo ?? {};
  const partes = [
    contar(resumo.meses ?? 0, 'mês', 'meses'),
    contar(resumo.lancamentos ?? 0, 'lançamento', 'lançamentos'),
  ];
  if ((resumo.investimentos ?? 0) > 0) partes.push(contar(resumo.investimentos, 'investimento', 'investimentos'));
  return { quando, conteudo: partes.join(', '), tamanho: textoDoTamanho(backup.tamanhoBytes ?? 0) };
}
