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

  it('responde a versão quando a página pergunta (linha "Versão do app" em Configurar)', () => {
    const texto = ler('sw.js');
    assert.match(texto, /addEventListener\('message'/);
    assert.match(texto, /evento\.data === 'versao'/);
    assert.match(texto, /postMessage\(\{ tipo: 'versao', versao: VERSAO_CACHE \}\)/);
  });
});
