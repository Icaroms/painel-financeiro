/**
 * Digitação de dinheiro "de banco" em todos os campos de valor do app.
 *
 * Os números entram pela direita, começando pelos centavos: 9 → "0,09",
 * 95 → "0,95", 9550 → "95,50". A regra fica em src/dinheiro.js
 * (mascararDinheiro, testada no Node); aqui só se liga a regra aos campos.
 *
 * Quais campos: todo <input> dentro de ".campo-dinheiro" (os campos com
 * "R$" na frente) e o valor da tela Lançar (".valor-linha"). Um campo com
 * data-sinal aceita "-" (ex.: o saldo da conta, que pode estar negativo).
 *
 * Um único "ouvinte" no documento cobre também os campos criados depois
 * (formulários de Configurar, Mês e Investir). Ele roda na fase de CAPTURA,
 * antes dos ouvintes de cada tela: quando a tela lê o campo, o valor já
 * está formatado.
 */

import { mascararDinheiro } from '../dinheiro.js';

/** O campo é de dinheiro? */
function ehCampoDeDinheiro(alvo) {
  return alvo instanceof HTMLInputElement && Boolean(alvo.closest('.campo-dinheiro, .valor-linha'));
}

/** Formata o campo e deixa o cursor no fim (como no banco). */
function formatar(campo) {
  const formatado = mascararDinheiro(campo.value, { comSinal: campo.hasAttribute('data-sinal') });
  if (formatado !== campo.value) campo.value = formatado;
  const fim = campo.value.length;
  try {
    campo.setSelectionRange(fim, fim);
  } catch {
    // Alguns tipos de campo não aceitam seleção: o valor já está certo.
  }
}

/** Liga a digitação de banco em todos os campos de dinheiro (chamar uma vez). */
export function ligarCamposDeDinheiro() {
  document.addEventListener('input', (evento) => {
    if (ehCampoDeDinheiro(evento.target)) formatar(evento.target);
  }, true);

  // Ao tocar no campo, o cursor vai para o fim: os números sempre entram pela direita.
  document.addEventListener('focusin', (evento) => {
    if (!ehCampoDeDinheiro(evento.target)) return;
    const campo = evento.target;
    // Teclado só de números (sem vírgula: ela entra sozinha). Com sinal, mantém o teclado com "-".
    if (!campo.hasAttribute('data-sinal')) campo.inputMode = 'numeric';
    requestAnimationFrame(() => {
      const fim = campo.value.length;
      try {
        // Só move o cursor se nada estiver selecionado: "selecionar tudo" para trocar o valor continua valendo.
        if (campo.selectionStart !== campo.selectionEnd) return;
        campo.setSelectionRange(fim, fim);
      } catch {
        // sem seleção: nada a fazer
      }
    });
  });
}
