/**
 * Versão do app, aviso de "cópia guardada" e aviso de "versão nova".
 *
 * VERSAO_APP é a versão do CÓDIGO desta página. Ela é igual à VERSAO_CACHE
 * do sw.js (um teste confere): as duas mudam juntas a cada entrega (PR).
 *
 * O service worker (sw.js) responde à página com:
 * - a versão DELE ("painel-financeiro-v15"). Se for maior que a VERSAO_APP,
 *   chegou uma publicação nova enquanto a página estava aberta (comum no
 *   iPhone, onde o app fica dias aberto em segundo plano);
 * - se ESTA página abriu com a cópia guardada no aparelho, e por quê:
 *   'servidor-com-erro' (ex.: site pausado na hospedagem) ou
 *   'sem-internet' (sem internet, ou a internet demorou mais de 3 segundos).
 *
 * Aqui ficam só os textos que a página mostra. Funções puras: testadas no Node.
 */

/** Versão do código desta página. Mude junto com a VERSAO_CACHE do sw.js. */
export const VERSAO_APP = 'painel-financeiro-v26';

/**
 * De quanto em quanto tempo, no máximo, o app pergunta ao servidor se há
 * versão nova quando volta para a tela (30 minutos). O navegador já confere
 * sozinho quando o app é ABERTO; isto cobre o app que ficou aberto em
 * segundo plano.
 */
export const INTERVALO_VERIFICAR_VERSAO_MS = 30 * 60 * 1000;

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

/**
 * Número inteiro da versão: "painel-financeiro-v15" vira 15.
 * @returns {number|null} null se o texto não estiver no formato.
 */
function numeroInteiro(versao) {
  const encontrado = /-v(\d+)$/.exec(String(versao ?? ''));
  return encontrado ? Number(encontrado[1]) : null;
}

/**
 * Há versão nova? Só quando a versão do service worker é MAIOR que a desta
 * página. Se for menor (a página veio da internet antes de o service worker
 * novo terminar de instalar), não há nada a avisar: ele chega em seguida.
 *
 * @param {string} versaoDoServiceWorker Ex.: "painel-financeiro-v16".
 * @param {string} [versaoDaPagina] Padrão: VERSAO_APP.
 * @returns {boolean}
 */
export function haVersaoNova(versaoDoServiceWorker, versaoDaPagina = VERSAO_APP) {
  const doServiceWorker = numeroInteiro(versaoDoServiceWorker);
  const daPagina = numeroInteiro(versaoDaPagina);
  if (doServiceWorker === null || daPagina === null) return false;
  return doServiceWorker > daPagina;
}

/**
 * Texto da faixa de versão nova.
 * @param {string} versao Versão nova ("painel-financeiro-v16").
 * @returns {string}
 */
export function textoDaVersaoNova(versao) {
  return `Há uma versão nova do app (${numeroDaVersao(versao)}). ` +
    'Toque em Atualizar quando terminar o que está fazendo: os seus dados continuam aqui.';
}

/**
 * Já é hora de perguntar de novo se há versão nova?
 * @param {number} agoraMs Date.now().
 * @param {number} ultimaMs Momento da última pergunta (Date.now()).
 * @returns {boolean}
 */
export function deveVerificarVersao(agoraMs, ultimaMs) {
  return agoraMs - ultimaMs >= INTERVALO_VERIFICAR_VERSAO_MS;
}

/** Resultados do botão "Procurar atualização" (Configurar). */
export const RESULTADOS_DA_PROCURA = Object.freeze({
  ultima: 'ultima',           // já está na última versão
  nova: 'nova',               // há versão nova pronta: falta tocar em Atualizar
  instalando: 'instalando',   // achou versão nova e ela está instalando agora
  erro: 'erro',               // sem internet ou servidor fora do ar
  semSuporte: 'sem-suporte',  // navegador sem service worker
});

/**
 * Texto mostrado depois de tocar em "Procurar atualização".
 *
 * @param {string} resultado Um dos RESULTADOS_DA_PROCURA.
 * @param {string} [versao] Versão desta página (padrão: VERSAO_APP).
 * @returns {string}
 */
export function textoDaProcura(resultado, versao = VERSAO_APP) {
  switch (resultado) {
    case RESULTADOS_DA_PROCURA.ultima:
      return `Você já está na última versão (${numeroDaVersao(versao)}).`;
    case RESULTADOS_DA_PROCURA.nova:
      return 'Há uma versão nova: toque em Atualizar, no topo da tela.';
    case RESULTADOS_DA_PROCURA.instalando:
      return 'Versão nova encontrada. Em instantes aparece o botão Atualizar, no topo da tela.';
    case RESULTADOS_DA_PROCURA.erro:
      return 'Não deu para procurar agora: sem internet ou servidor fora do ar. Tente mais tarde.';
    default:
      return 'Este navegador não instala atualizações do app sozinho: recarregue a página para pegar a versão nova.';
  }
}
