/**
 * Servidor local de desenvolvimento do Painel Financeiro.
 *
 * Por que precisa de um servidor? Os arquivos usam import/export
 * (módulos), e o navegador bloqueia módulos abertos direto do disco
 * (endereço file://). Este script entrega os arquivos da pasta do
 * projeto num endereço http://localhost, como um site de verdade.
 *
 * Feito só com o Node, sem instalar nada.
 *
 * Uso:   npm run dev
 * Parar: Ctrl+C no terminal
 */

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Pasta raiz do projeto (a pasta acima de scripts/). */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Porta: 8080, ou outra definida na variável de ambiente PORTA. */
const PORTA = Number(process.env.PORTA) || 8080;

/** Tipo de cada arquivo, para o navegador saber como tratá-lo. */
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Converte o endereço pedido num caminho de arquivo DENTRO do projeto.
 * Devolve null para pedidos que tentam sair da pasta (ex.: "/../segredo")
 * ou que apontam para pastas ocultas (ex.: ".git").
 */
function caminhoSeguro(urlPedida) {
  let relativo;
  try {
    const { pathname } = new URL(urlPedida, 'http://localhost');
    relativo = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return null; // endereço malformado
  }

  if (relativo.split('/').some((parte) => parte.startsWith('.'))) return null;

  const absoluto = path.resolve(RAIZ, `.${relativo}`);
  const dentroDaRaiz = absoluto === RAIZ || absoluto.startsWith(RAIZ + path.sep);
  return dentroDaRaiz ? absoluto : null;
}

const servidor = http.createServer(async (pedido, resposta) => {
  const arquivo = caminhoSeguro(pedido.url);

  if (arquivo === null) {
    resposta.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    resposta.end('Acesso negado.');
    return;
  }

  try {
    const conteudo = await readFile(arquivo);
    resposta.writeHead(200, {
      'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // sempre a versão mais nova durante o desenvolvimento
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    resposta.end(`Arquivo não encontrado: ${pedido.url}`);
  }
});

// Só aceita conexões deste computador (127.0.0.1).
servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel Financeiro rodando em http://localhost:${PORTA}`);
  console.log('Para parar o servidor: Ctrl+C');
});
