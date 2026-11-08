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
  const texto = corpo === undefined ? '' : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
  return { status, text: async () => texto };
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
    const corpo = opcoes.body === undefined ? undefined : JSON.parse(opcoes.body);
    const pedido = { caminho, metodo: opcoes.method, corpo, token, referrerPolicy: opcoes.referrerPolicy };
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

  it('backups: envia o texto do pacote como veio, lista, baixa como texto e apaga', async () => {
    const pacote = '{"formato":"painel-financeiro","versao":3,"dados":{}}';
    const { cliente, pedidos } = montar([
      () => respostaHttp(201, { id: 'b1', criadoEm: '2026-10-14T12:00:00Z' }),
      () => respostaHttp(200, { backups: [{ id: 'b1' }], maximo: 10, tamanhoMaximoBytes: 5242880 }),
      () => respostaHttp(200, pacote),
      () => respostaHttp(204),
    ], tokens('1'));

    assert.equal((await cliente.enviarBackup(pacote)).id, 'b1');
    assert.equal((await cliente.listarBackups()).maximo, 10);
    assert.equal(await cliente.baixarBackup('b1'), pacote);
    await cliente.apagarBackup('b1');

    assert.deepEqual(pedidos.map((p) => `${p.metodo} ${p.caminho}`), [
      'POST /api/backups', 'GET /api/backups', 'GET /api/backups/b1', 'DELETE /api/backups/b1',
    ]);
    assert.deepEqual(pedidos[0].corpo, JSON.parse(pacote));
    assert.equal(pedidos[1].corpo, undefined);
    assert.ok(pedidos.every((p) => p.token === 'acesso-1'));
  });

  it('backup grande demais (413) ou inexistente (404): erro do tipo "dados" com a mensagem', async () => {
    const { cliente } = montar([
      () => respostaHttp(413, { detail: 'O backup passa do tamanho máximo aceito pelo servidor (5 MB).' }),
      () => respostaHttp(404, { detail: 'Registro não encontrado.' }),
    ], tokens('1'));

    await assert.rejects(cliente.enviarBackup('{}'), (erro) => erro.tipo === 'dados' && /5 MB/.test(erro.message));
    await assert.rejects(cliente.baixarBackup('x'), (erro) => erro.tipo === 'dados' && /apagado/.test(erro.message));
  });

  it('zerarDados: DELETE /api/conta/dados e devolve o zeradosEm', async () => {
    const { cliente, pedidos } = montar([() => respostaHttp(200, { zeradosEm: '2026-10-14T12:00:00Z' })], tokens('1'));

    const resposta = await cliente.zerarDados();

    assert.equal(resposta.zeradosEm, '2026-10-14T12:00:00Z');
    assert.equal(`${pedidos[0].metodo} ${pedidos[0].caminho}`, 'DELETE /api/conta/dados');
  });

  it('IA do servidor (5.5): GET /api/ia e POST /api/ia/gerar com o token', async () => {
    const { cliente, pedidos } = montar([
      () => respostaHttp(200, { disponivel: true, modelos: ['gemini-3.5-flash-lite'], usadosHoje: 2, limiteDiario: 50 }),
      () => respostaHttp(200, { texto: 'Pode comprar.', usadosHoje: 3, limiteDiario: 50 }),
    ], tokens('1'));

    assert.equal((await cliente.situacaoIa()).usadosHoje, 2);
    const resposta = await cliente.gerarComIa({ instrucoes: 'i', conteudo: 'c', modelo: 'gemini-3.5-flash-lite' });

    assert.equal(resposta.texto, 'Pode comprar.');
    assert.equal(`${pedidos[0].metodo} ${pedidos[0].caminho}`, 'GET /api/ia');
    assert.equal(`${pedidos[1].metodo} ${pedidos[1].caminho}`, 'POST /api/ia/gerar');
    assert.deepEqual(pedidos[1].corpo, { instrucoes: 'i', conteudo: 'c', modelo: 'gemini-3.5-flash-lite' });
    assert.equal(pedidos[1].token, 'acesso-1');
  });

  it('IA do servidor: limite do dia (429), sem chave (503) e Gemini fora (502) trazem a explicação do servidor', async () => {
    const { cliente } = montar([
      () => respostaHttp(429, { detail: 'Você já usou os 50 pedidos de IA de hoje. O limite volta amanhã.' }),
      () => respostaHttp(503, { detail: 'A IA do servidor não está configurada. Use a chave do próprio aparelho em Ajustes → IA.' }),
      () => respostaHttp(502, { detail: 'O Gemini está com problemas agora. Tente de novo em alguns minutos.' }),
      () => respostaHttp(500, { detail: 'Algo deu errado no servidor.' }),
    ], tokens('1'));
    const pedido = { instrucoes: 'i', conteudo: 'c' };

    await assert.rejects(cliente.gerarComIa(pedido), (e) => e.tipo === 'limite' && /50 pedidos/.test(e.message));
    await assert.rejects(cliente.gerarComIa(pedido), (e) => e.tipo === 'servidor' && /chave do próprio aparelho/.test(e.message));
    await assert.rejects(cliente.gerarComIa(pedido), (e) => e.tipo === 'servidor' && /Gemini está com problemas/.test(e.message));
    await assert.rejects(cliente.gerarComIa(pedido), (e) => e.tipo === 'servidor' && /\(500\)/.test(e.message));
  });
});
