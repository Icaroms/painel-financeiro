/**
 * Testes da configuração de PWA (app instalável e offline).
 * Rodar com: npm test
 *
 * Estes testes leem os arquivos do projeto e conferem se eles combinam
 * entre si. O erro mais comum num PWA é esquecer um arquivo novo na
 * lista do service worker: o app funciona com internet e quebra sem ela.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { VERSAO_APP } from '../src/versao-app.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = (caminho) => readFileSync(join(RAIZ, caminho), 'utf8');

/** Lê a lista ARQUIVOS de dentro do sw.js. */
function arquivosDoServiceWorker() {
  const texto = ler('sw.js');
  const bloco = /const ARQUIVOS = \[([\s\S]*?)\];/.exec(texto);
  assert.ok(bloco, 'sw.js deve ter a lista "const ARQUIVOS = [...]".');
  return [...bloco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Converte um item da lista ("./src/x.js") no caminho do arquivo ("src/x.js"). */
const caminhoDoItem = (item) => (item === './' ? 'index.html' : item.replace(/^\.\//, ''));

/** Arquivos de uma pasta com uma extensão, no formato da lista ("./pasta/arquivo"). */
function arquivosDaPasta(pasta, extensao) {
  return readdirSync(join(RAIZ, pasta))
    .filter((nome) => nome.endsWith(extensao))
    .map((nome) => `./${pasta}/${nome}`);
}

describe('manifest.webmanifest', () => {
  const manifest = JSON.parse(ler('manifest.webmanifest'));

  it('tem os campos que o navegador usa para instalar o app', () => {
    assert.equal(manifest.name, 'Painel Financeiro');
    assert.equal(manifest.short_name, 'Painel');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.lang, 'pt-BR');
  });

  it('tem ícones 192 e 512, e os arquivos existem', () => {
    const tamanhos = manifest.icons.map((i) => i.sizes);
    assert.ok(tamanhos.includes('192x192'));
    assert.ok(tamanhos.includes('512x512'));
    for (const icone of manifest.icons) {
      assert.ok(existsSync(join(RAIZ, icone.src)), `ícone não encontrado: ${icone.src}`);
    }
  });
});

describe('sw.js (service worker)', () => {
  const lista = arquivosDoServiceWorker();

  it('tem uma versão de cache', () => {
    assert.match(ler('sw.js'), /const VERSAO_CACHE = 'painel-financeiro-v\d+';/);
  });

  it('a versão do sw.js é igual à VERSAO_APP de src/versao-app.js (mudam juntas)', () => {
    const versaoDoSw = /const VERSAO_CACHE = '([^']+)';/.exec(ler('sw.js'))[1];
    assert.equal(versaoDoSw, VERSAO_APP, 'mude a VERSAO_CACHE do sw.js e a VERSAO_APP de src/versao-app.js juntas');
  });

  it('todo arquivo da lista existe', () => {
    for (const item of lista) {
      assert.ok(existsSync(join(RAIZ, caminhoDoItem(item))), `arquivo da lista não existe: ${item}`);
    }
  });

  it('nenhum arquivo do app ficou de fora da lista', () => {
    const obrigatorios = [
      './index.html',
      './manifest.webmanifest',
      './css/app.css',
      ...arquivosDaPasta('src', '.js'),
      ...arquivosDaPasta('src/ui', '.js'),
      ...arquivosDaPasta('fontes', '.woff2'),
      ...arquivosDaPasta('icones', '.png'),
      ...arquivosDaPasta('icones', '.svg'),
    ];
    for (const arquivo of obrigatorios) {
      assert.ok(lista.includes(arquivo), `falta na lista do sw.js: ${arquivo}`);
    }
  });

  it('a lista não tem itens repetidos', () => {
    assert.equal(new Set(lista).size, lista.length);
  });
});

describe('index.html', () => {
  const html = ler('index.html');

  it('aponta para o manifest e para o ícone do iPhone', () => {
    assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
    assert.match(html, /<link rel="apple-touch-icon" href="icones\/apple-touch-icon.png">/);
  });

  it('não depende de fontes da internet', () => {
    assert.doesNotMatch(html, /fonts\.googleapis\.com/);
    assert.doesNotMatch(ler('css/app.css'), /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it('as fontes do CSS existem', () => {
    const fontes = [...ler('css/app.css').matchAll(/url\('\.\.\/(fontes\/[^']+)'\)/g)].map((m) => m[1]);
    assert.equal(fontes.length, 5);
    for (const fonte of fontes) {
      assert.ok(existsSync(join(RAIZ, fonte)), `fonte não encontrada: ${fonte}`);
    }
  });

  it('tem os avisos do topo (cópia guardada e versão nova), antes das vistas', () => {
    const avisos = html.indexOf('<div class="avisos-topo">');
    assert.ok(avisos > html.indexOf('<body>'), 'os avisos ficam dentro do body');
    assert.ok(avisos < html.indexOf('<main'), 'os avisos ficam antes da primeira vista');
    for (const id of ['aviso-copia', 'aviso-copia-texto', 'aviso-copia-fechar', 'aviso-versao', 'aviso-versao-texto', 'aviso-versao-atualizar']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /<div class="aviso-topo aviso-copia" id="aviso-copia" role="status" hidden>/);
    assert.match(html, /<div class="aviso-topo aviso-versao" id="aviso-versao" role="status" hidden>/);
  });

  it('tem o botão "Procurar atualização" junto da versão, em Configurar', () => {
    const configurar = html.slice(html.indexOf('id="tela-configurar"'));
    assert.match(configurar, /id="versao-app"[\s\S]*id="botao-procurar-atualizacao"[^>]*>Procurar atualização<[\s\S]*id="procura-atualizacao" role="status"/);
  });
});

/**
 * Roda o sw.js de verdade num "navegador de mentira" (sem internet nenhuma):
 * - a "rede" responde o que o teste mandar (ou falha, como sem internet);
 * - a "cópia guardada" é um Map que o teste preenche.
 * Devolve a função pedir(endereco, { modo }) que passa um pedido pelo
 * service worker e devolve a resposta que a página receberia.
 */
function serviceWorkerDeTeste({ rede, guardados = {} }) {
  const ORIGEM = 'https://app.exemplo';
  const enderecoCompleto = (pedido) => new URL(typeof pedido === 'string' ? pedido : pedido.url, `${ORIGEM}/`);
  const chave = (pedido) => {
    const endereco = enderecoCompleto(pedido);
    return `${endereco.origin}${endereco.pathname}`; // sem "?..." (como o ignoreSearch)
  };

  const cache = new Map(Object.entries(guardados).map(([endereco, texto]) => [chave(endereco), texto]));
  const ouvintes = {};
  const contexto = {
    self: {
      location: { origin: ORIGEM },
      addEventListener: (tipo, funcao) => { ouvintes[tipo] = funcao; },
    },
    caches: {
      open: async () => ({
        match: async (pedido) => (cache.has(chave(pedido)) ? new Response(cache.get(chave(pedido)), { status: 200 }) : undefined),
        put: async (pedido, resposta) => { cache.set(chave(pedido), await resposta.text()); },
      }),
    },
    fetch: async (pedido) => rede(pedido),
    Response,
    URL,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(ler('sw.js'), contexto);

  /**
   * Um pedido passando pelo service worker.
   * pagina: id da aba. Na navegação (modo 'navigate') é a aba que VAI abrir.
   */
  async function pedir(caminho, { modo = 'cors', pagina = 'aba-1' } = {}) {
    let resposta;
    ouvintes.fetch({
      request: { method: 'GET', url: `${ORIGEM}${caminho}`, mode: modo },
      clientId: modo === 'navigate' ? '' : pagina,
      resultingClientId: modo === 'navigate' ? pagina : '',
      respondWith: (promessa) => { resposta = promessa; },
    });
    return resposta;
  }

  /** A aba pergunta a versão; devolve o que o service worker respondeu. */
  function perguntarVersao(pagina = 'aba-1') {
    let recebido;
    ouvintes.message({ data: 'versao', source: { id: pagina, postMessage: (dados) => { recebido = dados; } } });
    return recebido;
  }
  return { pedir, perguntarVersao, cache, chave };
}

describe('sw.js: de onde vem cada resposta', () => {
  const servidorRespondendo = (status, texto) => async () => new Response(texto, { status });
  const semInternet = async () => { throw new TypeError('Failed to fetch'); };

  it('com internet: a versão nova do servidor, e ela vira a nova cópia guardada', async () => {
    const sw = serviceWorkerDeTeste({ rede: servidorRespondendo(200, 'nova'), guardados: { './src/app.js': 'antiga' } });
    const resposta = await sw.pedir('/src/app.js');
    assert.equal(await resposta.text(), 'nova');
    await new Promise((pronto) => setTimeout(pronto, 0)); // o put guarda sem a página esperar
    assert.equal(sw.cache.get(sw.chave('./src/app.js')), 'nova');
  });

  it('servidor com erro (ex.: site pausado, 503): usa a cópia guardada', async () => {
    const sw = serviceWorkerDeTeste({ rede: servidorRespondendo(503, 'Site not available'), guardados: { './src/app.js': 'guardada' } });
    const resposta = await sw.pedir('/src/app.js');
    assert.equal(resposta.status, 200);
    assert.equal(await resposta.text(), 'guardada');
    assert.equal(sw.cache.get(sw.chave('./src/app.js')), 'guardada'); // a página de erro NÃO substitui a cópia
  });

  it('servidor com erro na página principal: abre o index.html guardado', async () => {
    const sw = serviceWorkerDeTeste({ rede: servidorRespondendo(404, 'Not found'), guardados: { './index.html': 'app' } });
    const resposta = await sw.pedir('/qualquer-endereco', { modo: 'navigate' });
    assert.equal(await resposta.text(), 'app');
  });

  it('servidor com erro e sem cópia: mostra o erro do servidor como veio', async () => {
    const sw = serviceWorkerDeTeste({ rede: servidorRespondendo(404, 'Not found') });
    const resposta = await sw.pedir('/nao-existe.js');
    assert.equal(resposta.status, 404);
    assert.equal(await resposta.text(), 'Not found');
  });

  it('sem internet: usa a cópia guardada (ignorando o "?..." do endereço)', async () => {
    const sw = serviceWorkerDeTeste({ rede: semInternet, guardados: { './css/app.css': 'estilos' } });
    assert.equal(await (await sw.pedir('/css/app.css?v=2')).text(), 'estilos');
  });

  it('sem internet e sem cópia: aviso claro com erro 503', async () => {
    const sw = serviceWorkerDeTeste({ rede: semInternet });
    const resposta = await sw.pedir('/nao-guardado.js');
    assert.equal(resposta.status, 503);
    assert.equal(await resposta.text(), 'Sem internet e sem cópia deste arquivo.');
  });
});

describe('sw.js: versão e aviso da cópia guardada', () => {
  const versaoDoSw = /const VERSAO_CACHE = '([^']+)';/.exec(ler('sw.js'))[1];
  const semInternet = async () => { throw new TypeError('Failed to fetch'); };
  const guardados = { './index.html': 'app', './src/ui/app.js': 'js' };

  it('abriu pela internet: responde a versão e copia null', async () => {
    const sw = serviceWorkerDeTeste({ rede: async () => new Response('app', { status: 200 }) });
    await sw.pedir('/', { modo: 'navigate' });
    // { ... }: o objeto vem do "mundo" do service worker (outro protótipo); a cópia compara só os valores
    assert.deepEqual({ ...sw.perguntarVersao() }, { tipo: 'versao', versao: versaoDoSw, copia: null });
  });

  it('servidor com erro: a aba que abriu com a cópia recebe "servidor-com-erro"', async () => {
    const sw = serviceWorkerDeTeste({ rede: async () => new Response('Site not available', { status: 503 }), guardados });
    await sw.pedir('/', { modo: 'navigate' });
    assert.equal(sw.perguntarVersao().copia, 'servidor-com-erro');
  });

  it('sem internet: "sem-internet" (também quando só um arquivo veio da cópia)', async () => {
    const sw = serviceWorkerDeTeste({ rede: semInternet, guardados });
    await sw.pedir('/src/ui/app.js');
    assert.equal(sw.perguntarVersao().copia, 'sem-internet');
  });

  it('cada aba recebe só o seu aviso, e uma vez só', async () => {
    const sw = serviceWorkerDeTeste({ rede: semInternet, guardados });
    await sw.pedir('/', { modo: 'navigate', pagina: 'aba-1' });
    assert.equal(sw.perguntarVersao('aba-2').copia, null); // outra aba: abriu sem a cópia
    assert.equal(sw.perguntarVersao('aba-1').copia, 'sem-internet');
    assert.equal(sw.perguntarVersao('aba-1').copia, null); // já respondido
  });

  it('sem cópia para devolver: nada é anotado', async () => {
    const sw = serviceWorkerDeTeste({ rede: semInternet });
    await sw.pedir('/nao-guardado.js');
    assert.equal(sw.perguntarVersao().copia, null);
  });

  it('guarda no máximo 20 abas (as mais antigas saem primeiro)', async () => {
    const sw = serviceWorkerDeTeste({ rede: semInternet, guardados });
    for (let i = 1; i <= 21; i += 1) await sw.pedir('/', { modo: 'navigate', pagina: `aba-${i}` });
    assert.equal(sw.perguntarVersao('aba-1').copia, null);
    assert.equal(sw.perguntarVersao('aba-2').copia, 'sem-internet');
    assert.equal(sw.perguntarVersao('aba-21').copia, 'sem-internet');
  });
});
