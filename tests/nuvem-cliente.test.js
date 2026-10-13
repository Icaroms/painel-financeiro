/**
 * Testes da conversa com o servidor (Fase 05, parte 5.3), com um "fetch" falso.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ErroNuvem, criarClienteNuvem, normalizarEndereco } from '../src/nuvem-cliente.js';
import { ErroValidacao } from '../src/erros.js';

const AGORA_MS = Date.parse('2026-10-13T15:00:00.000Z');
const DAQUI_A_15_MIN = '2026-10-13T15:15:00Z';
const VENCIDO = '2026-10-13T14:00:00Z';

/** Resposta HTTP de mentira. */
function respostaHttp(status, corpo) {
  return { status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) };
}

/**
 * Monta o cliente com um servidor falso. "respostas" é uma lista de funções
 * (uma por pedido, na ordem) que recebem { caminho, corpo, token }.
 */
function montar(respostas, sessaoInicial = null) {
  let sessao = sessaoInicial;
  const pedidos = [];
  const buscar = async (url, opcoes) => {
    const caminho = url.replace('http://localhost:8081', '');
    const token = opcoes.headers.Authorization?.replace('Bearer ', '') ?? null;
    const pedido = { caminho, corpo: JSON.parse(opcoes.body), token, referrerPolicy: opcoes.referrerPolicy };
    pedidos.push(pedido);
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`pedido inesperado: ${caminho}`);
    return proxima(pedido);
  };
  const cliente = criarClienteNuvem({
    endereco: 'http://localhost:8081',
    obterSessao: () => sessao,
    salvarSessao: async (nova) => { sessao = nova; },
    buscar,
    agoraMs: () => AGORA_MS,
  });
  return { cliente, pedidos, sessao: () => sessao };
}

const tokens = (sufixo, expiraEm = DAQUI_A_15_MIN) => ({
  token: `acesso-${sufixo}`, tipo: 'Bearer', expiraEm, tokenRenovacao: `renovacao-${sufixo}`,
  renovacaoExpiraEm: '2026-11-12T15:00:00Z',
});

describe('normalizarEndereco', () => {
  it('completa o http:// e tira a barra do fim', () => {
    assert.equal(normalizarEndereco('localhost:8081/'), 'http://localhost:8081');
    assert.equal(normalizarEndereco(' https://api.exemplo.com/ '), 'https://api.exemplo.com');
  });

  it('recusa vazio, endereço inválido e http:// fora do próprio computador', () => {
    assert.throws(() => normalizarEndereco(''), ErroValidacao);
    assert.throws(() => normalizarEndereco('http://'), ErroValidacao);
    assert.throws(() => normalizarEndereco('http://api.exemplo.com'), /https/);
  });
});

describe('criarClienteNuvem', () => {
  it('entrar: guarda a sessão e nunca a senha', async () => {
    const { cliente, pedidos, sessao } = montar([() => respostaHttp(200, tokens('1'))]);

    await cliente.entrar('eu@exemplo.com', 'senha-secreta-123');

    assert.equal(pedidos[0].caminho, '/api/auth/login');
    assert.equal(pedidos[0].referrerPolicy, 'no-referrer');
    assert.equal(sessao().token, 'acesso-1');
    assert.equal(sessao().tokenRenovacao, 'renovacao-1');
    assert.equal(JSON.stringify(sessao()).includes('senha-secreta'), false);
  });

  it('entrar com senha errada ou muitas tentativas: erro com o tipo certo', async () => {
    const errada = montar([() => respostaHttp(401, { detail: 'E-mail ou senha incorretos.' })]);
    await assert.rejects(errada.cliente.entrar('a@b.c', 'x'), (erro) => erro instanceof ErroNuvem && erro.tipo === 'credenciais');

    const bloqueado = montar([() => respostaHttp(429, { detail: 'Muitas tentativas.' })]);
    await assert.rejects(bloqueado.cliente.entrar('a@b.c', 'x'), (erro) => erro.tipo === 'limite' && /Muitas/.test(erro.message));
  });

  it('sem internet: erro do tipo "rede"', async () => {
    const { cliente } = montar([() => { throw new TypeError('Failed to fetch'); }]);
    await assert.rejects(cliente.entrar('a@b.c', 'x'), (erro) => erro.tipo === 'rede');
  });

  it('sincronizar: manda o token de acesso', async () => {
    const { cliente, pedidos } = montar([() => respostaHttp(200, { cursor: 'C' })], tokens('1'));

    const resposta = await cliente.sincronizar({ desde: null, listas: {} });

    assert.equal(resposta.cursor, 'C');
    assert.equal(pedidos[0].caminho, '/api/sync');
    assert.equal(pedidos[0].token, 'acesso-1');
  });

  it('token de acesso vencido: renova antes e guarda os tokens novos', async () => {
    const { cliente, pedidos, sessao } = montar([
      () => respostaHttp(200, tokens('2')),
      () => respostaHttp(200, { cursor: 'C' }),
    ], tokens('1', VENCIDO));

    await cliente.sincronizar({});

    assert.deepEqual(pedidos.map((p) => p.caminho), ['/api/auth/renovar', '/api/sync']);
    assert.equal(pedidos[0].corpo.tokenRenovacao, 'renovacao-1');
    assert.equal(pedidos[1].token, 'acesso-2');
    assert.equal(sessao().tokenRenovacao, 'renovacao-2');
  });

  it('servidor responde 401 no meio: renova uma vez e repete o pedido', async () => {
    const { cliente, pedidos } = montar([
      () => respostaHttp(401, {}),
      () => respostaHttp(200, tokens('2')),
      () => respostaHttp(200, { cursor: 'C' }),
    ], tokens('1'));

    await cliente.sincronizar({});

    assert.deepEqual(pedidos.map((p) => p.caminho), ['/api/sync', '/api/auth/renovar', '/api/sync']);
  });

  it('renovação recusada: apaga a sessão e pede para entrar de novo', async () => {
    const { cliente, sessao } = montar([
      () => respostaHttp(401, {}),
      () => respostaHttp(401, { detail: 'Sessão encerrada. Entre de novo.' }),
    ], tokens('1'));

    await assert.rejects(cliente.sincronizar({}), (erro) => erro.tipo === 'sessao');
    assert.equal(sessao(), null);
  });

  it('sem sessão: nem tenta falar com o servidor', async () => {
    const { cliente, pedidos } = montar([]);
    await assert.rejects(cliente.sincronizar({}), (erro) => erro.tipo === 'sessao');
    assert.equal(pedidos.length, 0);
  });

  it('sair: avisa o servidor e apaga a sessão, mesmo sem internet', async () => {
    const comRede = montar([() => respostaHttp(204)], tokens('1'));
    await comRede.cliente.sair();
    assert.equal(comRede.pedidos[0].caminho, '/api/auth/sair');
    assert.equal(comRede.sessao(), null);

    const semRede = montar([() => { throw new TypeError('Failed to fetch'); }], tokens('1'));
    await semRede.cliente.sair();
    assert.equal(semRede.sessao(), null);
  });
});
