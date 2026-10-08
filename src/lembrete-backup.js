/**
 * Lembrete de backup: quando foi o último backup e se já passou da hora
 * de fazer outro.
 *
 * Os dados ficam só no aparelho; o backup é a única cópia fora dele.
 * A data da última exportação fica no campo "ultimoBackupEm" dos dados.
 * O campo é opcional: dados sem ele contam como "nenhum backup ainda",
 * então o formato continua na versão 2.
 *
 * Funções puras: testadas no Node.
 */

import { hojeLocal } from './datas.js';
import { ehExemplo } from './inicio.js';

/** Depois de quantos dias sem backup o app chama atenção. */
export const DIAS_PARA_LEMBRAR = 7;

/**
 * Marca nos dados o momento de um backup.
 *
 * @param {object} estado
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function registrarBackup(estado, { agora = new Date() } = {}) {
  return { ...estado, ultimoBackupEm: agora.toISOString() };
}

/** Dias de calendário (no fuso do aparelho) entre dois momentos. */
function diasEntre(antes, depois) {
  const emDias = (momento) => {
    const [ano, mes, dia] = hojeLocal(momento).split('-').map(Number);
    return Date.UTC(ano, mes - 1, dia) / 86_400_000;
  };
  return emDias(depois) - emDias(antes);
}

/** Converte um texto ISO em Date; null se estiver vazio ou inválido. */
function lerMomento(texto) {
  if (typeof texto !== 'string') return null;
  const momento = new Date(texto);
  return Number.isNaN(momento.getTime()) ? null : momento;
}

/**
 * Situação do backup, pronta para a tela.
 *
 * - Dados de exemplo nunca pedem backup (não há nada real a perder).
 * - Sem nenhum backup, o prazo conta desde que os dados foram criados
 *   (o mês mais antigo): quem acabou de começar não é cobrado no 1º dia.
 *
 * @param {object} estado
 * @param {object} [opcoes] { agora, limiteDias }
 * @returns {{ ultimoBackupEm: string|null, dias: number|null, atrasado: boolean, texto: string }}
 */
export function situacaoDoBackup(estado, { agora = new Date(), limiteDias = DIAS_PARA_LEMBRAR } = {}) {
  const ultimo = lerMomento(estado.ultimoBackupEm);

  if (ultimo === null) {
    const criacoes = estado.meses.map((m) => lerMomento(m.criadoEm)).filter(Boolean);
    const inicio = criacoes.length > 0 ? new Date(Math.min(...criacoes)) : agora;
    const desdeInicio = diasEntre(inicio, agora);
    return {
      ultimoBackupEm: null,
      dias: null,
      atrasado: !ehExemplo(estado) && desdeInicio >= limiteDias,
      texto: 'Nenhum backup ainda.',
    };
  }

  const dias = Math.max(0, diasEntre(ultimo, agora));
  let texto;
  if (dias === 0) texto = 'Último backup: hoje.';
  else if (dias === 1) texto = 'Último backup: ontem.';
  else texto = `Último backup: há ${dias} dias.`;

  return {
    ultimoBackupEm: ultimo.toISOString(),
    dias,
    atrasado: !ehExemplo(estado) && dias >= limiteDias,
    texto,
  };
}
