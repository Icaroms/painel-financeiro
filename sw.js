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
 * Assim, com internet o app está sempre na versão mais nova; sem internet, ele abre igual.
 *
 * Fica na raiz do site de propósito: um service worker só controla os
 * arquivos da pasta onde ele está e das pastas abaixo dela.
 *
 * Os dados financeiros NÃO passam por aqui: eles ficam no IndexedDB do aparelho.
 */

/** Mude a versão quando a LISTA de arquivos mudar: a cópia antiga é apagada. */
const VERSAO_CACHE = 'painel-financeiro-v11';

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
  './src/analise.js',
  './src/backup.js',
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
  './src/resumo-mes.js',
  './src/simulador.js',
  './src/veredito.js',
  './src/ui/analise-mes.js',
  './src/ui/app.js',
  './src/ui/arquivos.js',
  './src/ui/banco.js',
  './src/ui/configurar-ia.js',
  './src/ui/configurar.js',
  './src/ui/destino.js',
  './src/ui/explicar.js',
  './src/ui/historico.js',
  './src/ui/mes.js',
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

// Cada pedido: rede primeiro, cópia como reserva.
self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  // Só cuida de leituras (GET) de arquivos do próprio app.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const cache = await caches.open(VERSAO_CACHE);
    try {
      const resposta = await buscarComPrazo(request);
      if (resposta.ok) {
        // Guarda a versão nova para a próxima vez sem internet.
        cache.put(request, resposta.clone());
      }
      return resposta;
    } catch {
      // Sem internet: a cópia guardada. Para a página principal, qualquer
      // endereço do app abre o index.html (ex.: "/#mes").
      const copia = await cache.match(request, { ignoreSearch: true });
      if (copia) return copia;
      if (request.mode === 'navigate') {
        const inicio = await cache.match('./index.html');
        if (inicio) return inicio;
      }
      return new Response('Sem internet e sem cópia deste arquivo.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
