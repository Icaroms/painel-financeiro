/**
 * Versão do app e aviso de "cópia guardada".
 *
 * O service worker (sw.js) responde à página com:
 * - a versão que está rodando ("painel-financeiro-v14");
 * - se ESTA página abriu com a cópia guardada no aparelho, e por quê:
 *   'servidor-com-erro' (ex.: site pausado na hospedagem) ou
 *   'sem-internet' (sem internet, ou a internet demorou mais de 3 segundos).
 *
 * Aqui ficam só os textos que a página mostra. Funções puras: testadas no Node.
 */

/** Motivos que o sw.js informa quando a página abriu com a cópia guardada. */
export const MOTIVOS_DA_COPIA = Object.freeze({
  servidorComErro: 'servidor-com-erro',
  semInternet: 'sem-internet',
});

/**
 * Número curto da versão: "painel-financeiro-v14" vira "v14".
 * Um texto em outro formato volta como veio.
 *
 * @param {string} versao Nome da versão do cache (VERSAO_CACHE do sw.js).
 * @returns {string}
 */
export function numeroDaVersao(versao) {
  const texto = String(versao ?? '');
  return /-(v\d+)$/.exec(texto)?.[1] ?? texto;
}

/**
 * Texto da faixa de aviso quando a página abriu com a cópia guardada.
 *
 * @param {string|null|undefined} motivo Um dos MOTIVOS_DA_COPIA, ou nada.
 * @param {string} versao Nome da versão do cache ("painel-financeiro-v14").
 * @returns {string|null} null quando não há o que avisar (abriu pela internet).
 */
export function textoDoAvisoDaCopia(motivo, versao) {
  const numero = numeroDaVersao(versao);
  if (motivo === MOTIVOS_DA_COPIA.servidorComErro) {
    return `O servidor do app está fora do ar agora. O app abriu com a cópia guardada neste aparelho (${numero}): ` +
      'ele funciona normalmente e os seus dados continuam aqui. Novidades publicadas só chegam quando o servidor voltar.';
  }
  if (motivo === MOTIVOS_DA_COPIA.semInternet) {
    return `Sem internet (ou internet lenta): o app abriu com a cópia guardada neste aparelho (${numero}). ` +
      'Tudo funciona, menos o que precisa de internet, como a IA.';
  }
  return null;
}
