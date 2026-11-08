/**
 * Lembretes de vencimento (11/2026): contas e faturas que vencem hoje e
 * amanhã, e as que passaram do vencimento sem serem marcadas como pagas.
 *
 * Usa os mesmos itens do calendário (src/calendario.js), então o que o
 * lembrete diz bate com o que a pessoa vê lá. Entradas não geram lembrete.
 *
 * Cada lembrete tem uma chave: o aparelho guarda as que já avisou no dia
 * para não repetir a notificação (src/ui/lembretes.js).
 *
 * Funções puras: testadas no Node.
 */

import { mesDaData, somarMeses, diasNoMes, diaDaData } from './datas.js';
import { formatarCentavos } from './dinheiro.js';
import { buscarMes } from './meses.js';
import { itensDoCalendario } from './calendario.js';

/** "2026-11-30" → "2026-12-01". */
export function diaSeguinte(data) {
  const mes = mesDaData(data);
  const dia = diaDaData(data);
  if (dia < diasNoMes(mes)) return `${mes}-${String(dia + 1).padStart(2, '0')}`;
  return `${somarMeses(mes, 1)}-01`;
}

/** "2026-11-10" → "10/11". */
const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/**
 * @param {object} estado
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ chave: string, quando: 'atrasado'|'hoje'|'amanha', titulo: string, texto: string,
 *   nome: string, valorCentavos: number, data: string }[]} Atrasados, depois hoje, depois amanhã.
 */
export function lembretesDeVencimento(estado, hoje) {
  if (!buscarMes(estado, mesDaData(hoje))) return [];
  const amanha = diaSeguinte(hoje);
  const meses = [...new Set([mesDaData(hoje), mesDaData(amanha)])];
  const saidas = meses
    .flatMap((mes) => itensDoCalendario(estado, mes, hoje).itens)
    .filter((i) => i.tipo === 'saida' && i.situacao !== 'pago');

  const lembretes = [];
  for (const item of saidas) {
    let quando = null;
    if (item.situacao === 'atrasado') quando = 'atrasado';
    else if (item.data === hoje) quando = 'hoje';
    else if (item.data === amanha) quando = 'amanha';
    if (quando === null) continue;
    const valor = formatarCentavos(item.valorCentavos);
    lembretes.push({
      chave: `${item.origem}:${item.nome}:${item.data}`,
      quando,
      titulo: { atrasado: `Atrasada: ${item.nome}`, hoje: `Vence hoje: ${item.nome}`, amanha: `Vence amanhã: ${item.nome}` }[quando],
      texto: quando === 'atrasado'
        ? `${valor}, venceu em ${dataCurta(item.data)}. Já pagou? Marque como paga no app.`
        : `${valor}. Depois de pagar, marque como paga no app.`,
      nome: item.nome,
      valorCentavos: item.valorCentavos,
      data: item.data,
    });
  }
  const ordem = { atrasado: 0, hoje: 1, amanha: 2 };
  return lembretes.sort((a, b) => ordem[a.quando] - ordem[b.quando] || a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Chave guardada depois de avisar. Inclui o "quando": a mesma conta avisa
 * de novo ao passar de "amanhã" para "hoje".
 */
export const chaveAvisada = (lembrete) => `${lembrete.quando}|${lembrete.chave}`;

/**
 * Lembretes que ainda não foram avisados neste aparelho.
 *
 * @param {object[]} lembretes De lembretesDeVencimento.
 * @param {string[]} avisados Chaves já avisadas (chaveAvisada).
 */
export function lembretesNovos(lembretes, avisados) {
  const ja = new Set(avisados ?? []);
  return lembretes.filter((l) => !ja.has(chaveAvisada(l)));
}
