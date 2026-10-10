/**
 * Service worker do Painel Financeiro: faz o app abrir e funcionar SEM internet.
 *
 * O que é: um script que o navegador instala junto com o app e que fica
 * entre a página e a internet. Cada arquivo pedido pela página passa por aqui.
 *
 * Estratégia "rede primeiro, cópia guardada como reserva":
 * 1. Na instalação, guarda uma cópia de todos os arquivos do app (lista abaixo).
 * 2. A cada pedido, tenta buscar a versão mais nova na internet e atualiza a cópia.
 * 3. Sem internet (ou se a internet demorar mais de 3 segundos), usa a cópia.
 * 4. Se o servidor RESPONDER COM ERRO (ex.: site pausado na hospedagem, que
 *    mostra "Site not available", ou um erro 500), também usa a cópia.
 * Assim, com internet o app está sempre na versão mais nova; sem internet,
 * ou com o servidor fora do ar, ele abre igual, e a página mostra um aviso
 * de que abriu com a cópia guardada (ver PAGINAS_COM_COPIA abaixo).
 *
 * Fica na raiz do site de propósito: um service worker só controla os
 * arquivos da pasta onde ele está e das pastas abaixo dela.
 *
 * Os dados financeiros NÃO passam por aqui: eles ficam no IndexedDB do aparelho.
 */

/**
 * Versão do app. Mude a cada entrega (cada PR), não só quando a LISTA de
 * arquivos mudar, e SEMPRE junto com a VERSAO_APP de src/versao-app.js
 * (o teste tests/pwa.test.js confere que as duas são iguais):
 * - ao mudar, a cópia antiga dos arquivos é apagada;
 * - uma página aberta com versão menor mostra o aviso "Há uma versão nova".
 */
const VERSAO_CACHE = 'painel-financeiro-v20';

/** Tempo máximo esperando a internet antes de usar a cópia guardada. */
const ESPERA_REDE_MS = 3000;

/** Todos os arquivos que o app precisa para abrir sem internet. */
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fontes/barlow-latin-400-normal.woff2',
  './fontes/barlow-latin-500-normal.woff2',
  './fontes/barlow-latin-600-normal.woff2',
  './fontes/barlow-semi-condensed-latin-500-normal.woff2',
  './fontes/barlow-semi-condensed-latin-600-normal.woff2',
  './icones/icone.svg',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/apple-touch-icon.png',
  './src/acoes.js',
  './src/analise.js',
  './src/backup.js',
  './src/carteira.js',
  './src/cartoes.js',
  './src/configuracao.js',
  './src/conversao.js',
  './src/dados-exemplo.js',
  './src/destino.js',
  './src/datas.js',
  './src/dinheiro.js',
  './src/erros.js',
  './src/explicacoes.js',
  './src/fixos.js',
  './src/fluxo.js',
  './src/historico.js',
  './src/ia.js',
  './src/inicio.js',
  './src/lembrete-backup.js',
  './src/meses.js',
  './src/modelo.js',
  './src/mostrador.js',
  './src/painel.js',
  './src/persistencia.js',
  './src/radar.js',
  './src/resumo-mes.js',
  './src/simulador.js',
  './src/veredito.js',
  './src/versao-app.js',
  './src/ui/analise-mes.js',
  './src/ui/app.js',
  './src/ui/arquivos.js',
  './src/ui/banco.js',
  './src/ui/configurar-ia.js',
  './src/ui/configurar.js',
  './src/ui/destino.js',
  './src/ui/explicar.js',
  './src/ui/historico.js',
  './src/ui/investir.js',
  './src/ui/mes.js',
  './src/ui/radar.js',
  './src/ui/simulador.js',
];

// Instalação: guarda a cópia de todos os arquivos.
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO_CACHE)
      .then((cache) => cache.addAll(ARQUIVOS))
      // Assume o controle sem esperar as abas antigas fecharem.
      .then(() => self.skipWaiting()),
  );
});

// Ativação: apaga cópias de versões antigas.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((nome) => nome !== VERSAO_CACHE).map((nome) => caches.delete(nome)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Espera a internet por no máximo ESPERA_REDE_MS. */
function buscarComPrazo(pedido) {
  return new Promise((resolver, rejeitar) => {
    const prazo = setTimeout(() => rejeitar(new Error('A internet demorou demais.')), ESPERA_REDE_MS);
    fetch(pedido).then(
      (resposta) => { clearTimeout(prazo); resolver(resposta); },
      (erro) => { clearTimeout(prazo); rejeitar(erro); },
    );
  });
}

/**
 * Páginas que abriram com a cópia guardada: id da página (aba) → motivo.
 * Motivos (os mesmos de src/versao-app.js):
 * - 'servidor-com-erro': o servidor respondeu com erro (ex.: site pausado);
 * - 'sem-internet': sem internet, ou a internet demorou demais.
 * Fica só na memória do service worker: a página pergunta logo ao abrir.
 */
const PAGINAS_COM_COPIA = new Map();

/** Quantas páginas anotar no máximo (as mais antigas saem primeiro). */
const MAXIMO_PAGINAS_ANOTADAS = 20;

/**
 * Anota que a página deste pedido recebeu a cópia guardada.
 * - Para a página principal (navegação), o id é o da página que VAI abrir
 *   (resultingClientId).
 * - Para os outros arquivos (CSS, JS…), é o da página que pediu (clientId).
 */
function anotarCopia(evento, motivo) {
  const id = evento.resultingClientId || evento.clientId;
  if (!id) return;
  PAGINAS_COM_COPIA.delete(id); // reinserir deixa esta página como a mais nova
  PAGINAS_COM_COPIA.set(id, motivo);
  while (PAGINAS_COM_COPIA.size > MAXIMO_PAGINAS_ANOTADAS) {
    PAGINAS_COM_COPIA.delete(PAGINAS_COM_COPIA.keys().next().value);
  }
}

// A página pergunta "qual versão está rodando?" (linha "Versão do app" em
// Configurar). A resposta traz:
// - versao: a versão DESTE service worker (mostra se o aparelho já recebeu
//   a última publicação);
// - copia: se ESTA página abriu com a cópia guardada, o motivo; senão, null.
self.addEventListener('message', (evento) => {
  if (evento.data !== 'versao') return;
  const id = evento.source?.id;
  const copia = (id && PAGINAS_COM_COPIA.get(id)) || null;
  if (id) PAGINAS_COM_COPIA.delete(id); // já respondido: não precisa guardar
  evento.source?.postMessage({ tipo: 'versao', versao: VERSAO_CACHE, copia });
});

/**
 * A cópia guardada de um pedido, ou null se não houver.
 * Para a página principal, qualquer endereço do app abre o index.html
 * (ex.: "/#mes" ou um endereço que não existe).
 */
async function copiaGuardada(cache, pedido) {
  const copia = await cache.match(pedido, { ignoreSearch: true });
  if (copia) return copia;
  if (pedido.mode === 'navigate') {
    const inicio = await cache.match('./index.html');
    if (inicio) return inicio;
  }
  return null;
}

// Cada pedido: rede primeiro, cópia como reserva.
self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  // Só cuida de leituras (GET) de arquivos do próprio app.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const cache = await caches.open(VERSAO_CACHE);
    let resposta;
    try {
      resposta = await buscarComPrazo(request);
    } catch {
      // Sem internet (ou a internet demorou demais): a cópia guardada.
      const copia = await copiaGuardada(cache, request);
      if (copia) {
        anotarCopia(evento, 'sem-internet');
        return copia;
      }
      return new Response('Sem internet e sem cópia deste arquivo.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (resposta.ok) {
      // Deu certo: guarda a versão nova para a próxima vez sem internet.
      cache.put(request, resposta.clone());
      return resposta;
    }

    // O servidor respondeu, mas com erro (ex.: 503 do site pausado, 404, 500).
    // A cópia guardada é melhor que a página de erro; sem cópia, mostra o erro
    // do servidor como ele veio (assim um arquivo que não existe continua dando 404).
    const copia = await copiaGuardada(cache, request);
    if (copia) {
      anotarCopia(evento, 'servidor-com-erro');
      return copia;
    }
    return resposta;
  })());
});
