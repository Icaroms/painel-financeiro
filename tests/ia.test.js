/**
 * Testes da conversa com o Gemini (Fase 03, parte 3.1).
 * Rodar com: npm test
 *
 * Nenhum teste usa a internet: a chamada recebe um "fetch" falso, que
 * devolve a resposta que cada teste quer simular. A chave é FICTÍCIA.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDERECO_API,
  MODELOS,
  MODELO_PADRAO,
  configuracaoVazia,
  criarConfiguracaoIA,
  iaDisponivel,
  mascararChave,
  nomeDoModelo,
  montarPedido,
  lerResposta,
  chamarGemini,
  testarConexao,
  criarIaDoServidor,
  textoDaSituacaoDoServidor,
  usaServidor,
} from '../src/ia.js';
import { ErroNuvem } from '../src/nuvem-cliente.js';

const CHAVE = 'AIzaSyFICTICIA-1234567890abcdefXYZ9';
const CONFIG = { chave: CHAVE, modelo: MODELO_PADRAO, ligada: true };
const MENSAGEM = { instrucoes: 'Explique em português.', conteudo: 'Saldo: R$ 100,00.' };

/** Resposta de sucesso no formato da API. */
const respostaComTexto = (texto) => ({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }] });

/** fetch falso: devolve o status e o corpo pedidos e guarda o que recebeu. */
function fetchFalso(status, corpo) {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return { status, json: async () => (corpo === undefined ? Promise.reject(new Error('sem JSON')) : corpo) };
  };
  return { fetch, chamadas };
}

describe('configuração da IA', () => {
  it('padrão: sem chave, Flash-Lite e desligada', () => {
    assert.deepEqual(configuracaoVazia(), { chave: '', modelo: 'gemini-3.5-flash-lite', ligada: false, origem: 'aparelho' });
    assert.equal(MODELOS[0].id, MODELO_PADRAO);
  });

  it('chave válida: tira os espaços das pontas e liga por padrão', () => {
    assert.deepEqual(criarConfiguracaoIA({ chave: `  ${CHAVE}  ` }), { chave: CHAVE, modelo: MODELO_PADRAO, ligada: true, origem: 'aparelho' });
    assert.equal(criarConfiguracaoIA({ chave: CHAVE, modelo: 'gemini-3.8-flash', ligada: false }).modelo, 'gemini-3.8-flash');
  });

  it('chave vazia, curta ou com espaço no meio: erro claro', () => {
    assert.throws(() => criarConfiguracaoIA({ chave: '   ' }), /Cole a chave/);
    assert.throws(() => criarConfiguracaoIA({ chave: 'AIza123' }), /incompleta/);
    assert.throws(() => criarConfiguracaoIA({ chave: 'AIzaSy FICTICIA 1234567890' }), /incompleta/);
  });

  it('modelo fora da lista: erro', () => {
    assert.throws(() => criarConfiguracaoIA({ chave: CHAVE, modelo: 'gemini-1.0-pro' }), /modelos da lista/);
  });

  it('iaDisponivel: precisa de chave e de estar ligada', () => {
    assert.equal(iaDisponivel(CONFIG), true);
    assert.equal(iaDisponivel({ ...CONFIG, ligada: false }), false);
    assert.equal(iaDisponivel(configuracaoVazia()), false);
    assert.equal(iaDisponivel(null), false);
  });

  it('mascararChave mostra só o começo e o fim', () => {
    assert.equal(mascararChave(CHAVE), 'AIzaSy…XYZ9');
    assert.equal(mascararChave(''), '');
    assert.equal(mascararChave('curta'), '•••••');
  });

  it('nomeDoModelo: nome da lista, ou o próprio id', () => {
    assert.equal(nomeDoModelo('gemini-3.5-flash-lite'), 'Flash-Lite (rápido, padrão)');
    assert.equal(nomeDoModelo('outro'), 'outro');
  });
});

describe('montarPedido', () => {
  it('POST no endereço do modelo, com a chave no cabeçalho (não no endereço)', () => {
    const { url, opcoes } = montarPedido(CONFIG, MENSAGEM);
    assert.equal(url, `${ENDERECO_API}/gemini-3.5-flash-lite:generateContent`);
    assert.ok(!url.includes(CHAVE));
    assert.equal(opcoes.method, 'POST');
    assert.equal(opcoes.headers['x-goog-api-key'], CHAVE);
    assert.equal(opcoes.headers['Content-Type'], 'application/json');
  });

  it('não informa de onde o pedido vem (a mesma regra "no-referrer" do app inteiro)', () => {
    assert.equal(montarPedido(CONFIG, MENSAGEM).opcoes.referrerPolicy, 'no-referrer');
  });

  it('as instruções vão como systemInstruction e o conteúdo como mensagem do usuário', () => {
    const corpo = JSON.parse(montarPedido(CONFIG, MENSAGEM).opcoes.body);
    assert.deepEqual(corpo, {
      systemInstruction: { parts: [{ text: 'Explique em português.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Saldo: R$ 100,00.' }] }],
    });
  });
});

describe('lerResposta', () => {
  it('sucesso: junta as partes de texto', () => {
    const corpo = { candidates: [{ content: { parts: [{ text: 'Cabe ' }, { text: 'no mês.' }] } }] };
    assert.deepEqual(lerResposta(200, corpo), { ok: true, texto: 'Cabe no mês.' });
  });

  it('partes de "pensamento" não entram na resposta', () => {
    const corpo = { candidates: [{ content: { parts: [{ text: 'rascunho', thought: true }, { text: 'Resposta.' }] } }] };
    assert.deepEqual(lerResposta(200, corpo), { ok: true, texto: 'Resposta.' });
  });

  it('sucesso sem texto: vazio ou bloqueado', () => {
    assert.match(lerResposta(200, { candidates: [{ content: { parts: [] } }] }).erro, /vazio/);
    assert.match(lerResposta(200, { promptFeedback: { blockReason: 'SAFETY' } }).erro, /não quis responder/);
  });

  it('erros da API viram mensagens em português', () => {
    const chaveInvalida = { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } };
    assert.match(lerResposta(400, chaveInvalida).erro, /Chave inválida/);
    assert.match(lerResposta(403, { error: { status: 'PERMISSION_DENIED' } }).erro, /não tem permissão/);
    assert.match(lerResposta(404, null).erro, /Modelo não encontrado/);
    assert.match(lerResposta(429, null).erro, /limite de uso/);
    assert.match(lerResposta(503, null).erro, /problemas agora/);
    assert.match(lerResposta(418, null).erro, /código 418/);
  });
});

describe('chamarGemini', () => {
  it('envia o pedido e devolve o texto', async () => {
    const { fetch, chamadas } = fetchFalso(200, respostaComTexto('Explicação.'));
    const resultado = await chamarGemini(CONFIG, MENSAGEM, { fetch });
    assert.deepEqual(resultado, { ok: true, texto: 'Explicação.' });
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].opcoes.headers['x-goog-api-key'], CHAVE);
    assert.ok(chamadas[0].opcoes.signal, 'o pedido tem como ser cancelado (tempo limite)');
  });

  it('sem chave: não chama a internet', async () => {
    const { fetch, chamadas } = fetchFalso(200, respostaComTexto('x'));
    const resultado = await chamarGemini(configuracaoVazia(), MENSAGEM, { fetch });
    assert.match(resultado.erro, /Cadastre a chave/);
    assert.equal(chamadas.length, 0);
  });

  it('sem internet: mensagem clara, sem lançar erro', async () => {
    const fetch = async () => { throw new TypeError('Failed to fetch'); };
    const resultado = await chamarGemini(CONFIG, MENSAGEM, { fetch });
    assert.deepEqual(resultado, { ok: false, erro: 'Sem conexão com o Gemini. Confira a internet e tente de novo.' });
  });

  it('demorou demais: cancela e avisa', async () => {
    // fetch que só termina quando o pedido é cancelado.
    const fetch = (url, { signal }) => new Promise((_, rejeitar) => {
      signal.addEventListener('abort', () => rejeitar(Object.assign(new Error('cancelado'), { name: 'AbortError' })));
    });
    const resultado = await chamarGemini(CONFIG, MENSAGEM, { fetch, tempoLimiteMs: 10 });
    assert.match(resultado.erro, /demorou demais/);
  });

  it('erro sem JSON no corpo: usa o código HTTP', async () => {
    const { fetch } = fetchFalso(500, undefined);
    const resultado = await chamarGemini(CONFIG, MENSAGEM, { fetch });
    assert.match(resultado.erro, /problemas agora/);
  });
});

describe('testarConexao', () => {
  it('ok: diz qual modelo respondeu', async () => {
    const { fetch } = fetchFalso(200, respostaComTexto('OK'));
    assert.deepEqual(await testarConexao(CONFIG, { fetch }), { ok: true, mensagem: 'Conexão OK: o Flash-Lite respondeu.' });
  });

  it('erro: repassa a mensagem clara', async () => {
    const { fetch } = fetchFalso(429, null);
    const resultado = await testarConexao(CONFIG, { fetch });
    assert.equal(resultado.ok, false);
    assert.match(resultado.mensagem, /limite de uso/);
  });
});

describe('IA pelo servidor (Fase 05, parte 5.5)', () => {
  /** IA do servidor com um "nuvem" falso. */
  function servidorFalso({ conectado = true, gerar, situacao } = {}) {
    const pedidos = [];
    const ia = criarIaDoServidor({
      conectado: () => conectado,
      gerar: async (pedido) => { pedidos.push(pedido); return gerar(pedido); },
      situacao: async () => situacao(),
    });
    return { ia, pedidos };
  }
  const NO_SERVIDOR = { chave: '', modelo: 'gemini-3.8-flash', ligada: true, origem: 'servidor' };

  it('configuração: com o servidor, a chave do aparelho é opcional (e continua validada se vier)', () => {
    assert.deepEqual(criarConfiguracaoIA({ chave: '', origem: 'servidor' }), { chave: '', modelo: MODELO_PADRAO, ligada: true, origem: 'servidor' });
    assert.equal(criarConfiguracaoIA({ chave: CHAVE, origem: 'servidor' }).chave, CHAVE, 'a chave salva fica guardada');
    assert.throws(() => criarConfiguracaoIA({ chave: 'curta', origem: 'servidor' }), /incompleta/);
    assert.throws(() => criarConfiguracaoIA({ chave: CHAVE, origem: 'nuvem' }), /de onde vem a IA/);
  });

  it('configuração antiga (sem "origem") continua sendo do aparelho', () => {
    assert.equal(usaServidor(CONFIG), false);
    assert.equal(iaDisponivel(CONFIG), true);
  });

  it('iaDisponivel: no servidor, precisa da conta conectada (não da chave)', () => {
    const { ia } = servidorFalso();
    assert.equal(iaDisponivel({ ...NO_SERVIDOR, servidor: ia }), true);
    assert.equal(iaDisponivel({ ...NO_SERVIDOR, ligada: false, servidor: ia }), false);
    assert.equal(iaDisponivel({ ...NO_SERVIDOR, servidor: servidorFalso({ conectado: false }).ia }), false);
    assert.equal(iaDisponivel(NO_SERVIDOR), false, 'sem a IA do servidor entregue pela tela');
  });

  it('chamarGemini: com o servidor, manda o mesmo pedido (e o modelo) e não usa o fetch', async () => {
    const { ia, pedidos } = servidorFalso({ gerar: () => ({ texto: '  Pode comprar.  ', usadosHoje: 4, limiteDiario: 50 }) });
    const naoUsar = async () => { throw new Error('não devia chamar o Google'); };

    const resultado = await chamarGemini({ ...NO_SERVIDOR, servidor: ia }, MENSAGEM, { fetch: naoUsar });

    assert.deepEqual(resultado, { ok: true, texto: 'Pode comprar.', usadosHoje: 4, limiteDiario: 50 });
    assert.deepEqual(pedidos, [{ ...MENSAGEM, modelo: 'gemini-3.8-flash' }]);
  });

  it('erros do servidor viram mensagens claras (nunca lança)', async () => {
    const falhas = [
      [new ErroNuvem('limite', 'Você já usou os 50 pedidos de IA de hoje. O limite volta amanhã.'), /50 pedidos/],
      [new ErroNuvem('rede', 'Sem conexão com o servidor. O que mudar fica guardado e vai depois.'), /Confira a internet/],
      [new ErroNuvem('sessao', 'A sessão terminou.'), /Entre de novo em Ajustes → Conta/],
    ];
    for (const [falha, esperado] of falhas) {
      const { ia } = servidorFalso({ gerar: () => { throw falha; } });
      const r = await chamarGemini({ ...NO_SERVIDOR, servidor: ia }, MENSAGEM);
      assert.equal(r.ok, false);
      assert.match(r.erro, esperado);
    }
    const vazio = await chamarGemini({ ...NO_SERVIDOR, servidor: servidorFalso({ gerar: () => ({ texto: ' ' }) }).ia }, MENSAGEM);
    assert.match(vazio.erro, /respondeu vazio/);
  });

  it('sem conta conectada: pede para entrar, sem chamar o servidor', async () => {
    const { ia, pedidos } = servidorFalso({ conectado: false, gerar: () => ({ texto: 'x' }) });
    const r = await chamarGemini({ ...NO_SERVIDOR, servidor: ia }, MENSAGEM);
    assert.match(r.erro, /entre na sua conta em Ajustes → Conta/);
    assert.equal(pedidos.length, 0);
    assert.match((await chamarGemini(NO_SERVIDOR, MENSAGEM)).erro, /Ajustes → Conta/);
  });

  it('testarConexao pelo servidor mostra o uso do dia', async () => {
    const { ia } = servidorFalso({ gerar: () => ({ texto: 'OK', usadosHoje: 1, limiteDiario: 50 }) });
    const r = await testarConexao({ ...NO_SERVIDOR, servidor: ia });
    assert.deepEqual(r, { ok: true, mensagem: 'Conexão OK: o Flash respondeu pelo servidor (usados hoje: 1 de 50).' });
  });

  it('situação: texto para Ajustes → IA', async () => {
    const ligada = servidorFalso({ situacao: () => ({ disponivel: true, usadosHoje: 3, limiteDiario: 50 }) }).ia;
    assert.deepEqual(textoDaSituacaoDoServidor(await ligada.situacao()),
      { texto: 'IA do servidor disponível · usados hoje: 3 de 50', ok: true });

    const semChave = servidorFalso({ situacao: () => ({ disponivel: false, usadosHoje: 0, limiteDiario: 50 }) }).ia;
    assert.match(textoDaSituacaoDoServidor(await semChave.situacao()).texto, /não tem a chave do Gemini/);

    const desconectado = servidorFalso({ conectado: false }).ia;
    assert.deepEqual(textoDaSituacaoDoServidor(await desconectado.situacao()),
      { texto: 'Para usar a IA do servidor, entre na sua conta em Ajustes → Conta.', ok: false });
  });
});

