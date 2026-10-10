/**
 * IA do Painel Financeiro: conversa com a API do Gemini (Fase 03).
 *
 * Regra da fase: as REGRAS do app calculam; a IA só EXPLICA. Ela recebe
 * os números já prontos e responde em português. Ela nunca decide a cor
 * do veredito e não grava nada.
 *
 * Decisões (10/10/2026):
 * - a chave é da pessoa, digitada no aparelho; fica fora do backup
 *   (src/ui/banco.js grava a configuração separada dos dados);
 * - modelo padrão: Flash-Lite (rápido, com mais folga no plano gratuito);
 * - podem ir nomes de categorias e de contas, junto com os números;
 *   nunca nome, e-mail ou dados de login da pessoa.
 *
 * Este arquivo não depende do navegador: a chamada recebe o "fetch" como
 * parâmetro, e os testes passam um fetch falso (sem internet).
 */

import { ErroValidacao } from './erros.js';

/** Endereço da API (versão v1beta, a das documentações atuais). */
export const ENDERECO_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Onde a pessoa cria a chave. */
export const ENDERECO_CRIAR_CHAVE = 'https://aistudio.google.com/app/apikey';

/** Modelos oferecidos em Configurar (o primeiro é o padrão). */
export const MODELOS = Object.freeze([
  Object.freeze({ id: 'gemini-3.5-flash-lite', nome: 'Flash-Lite (rápido, padrão)' }),
  Object.freeze({ id: 'gemini-3.8-flash', nome: 'Flash (respostas mais elaboradas)' }),
]);
export const MODELO_PADRAO = MODELOS[0].id;

/** Tempo máximo esperando a resposta. */
export const TEMPO_LIMITE_MS = 30000;

/* ------------------------------------------------------------------ */
/* Configuração                                                       */
/* ------------------------------------------------------------------ */

/** Configuração de quem ainda não cadastrou a chave. */
export function configuracaoVazia() {
  return { chave: '', modelo: MODELO_PADRAO, ligada: false };
}

/**
 * Valida e monta a configuração da IA.
 *
 * @param {object}  dados
 * @param {string}  dados.chave  A chave do Google AI Studio.
 * @param {string}  [dados.modelo]
 * @param {boolean} [dados.ligada]
 * @returns {{ chave: string, modelo: string, ligada: boolean }}
 */
export function criarConfiguracaoIA({ chave, modelo = MODELO_PADRAO, ligada = true }) {
  const limpa = typeof chave === 'string' ? chave.trim() : '';
  if (limpa === '') {
    throw new ErroValidacao('chave', 'Cole a chave do Google AI Studio.');
  }
  if (/\s/.test(limpa) || limpa.length < 20) {
    throw new ErroValidacao('chave', 'Essa chave parece incompleta. Copie de novo no Google AI Studio.');
  }
  if (!MODELOS.some((m) => m.id === modelo)) {
    throw new ErroValidacao('modelo', 'Escolha um dos modelos da lista.');
  }
  if (typeof ligada !== 'boolean') {
    throw new ErroValidacao('ligada', 'O campo "usar a IA" deve ser verdadeiro ou falso.');
  }
  return { chave: limpa, modelo, ligada };
}

/**
 * Diz se a IA pode ser usada: tem chave e está ligada.
 *
 * @param {object|null|undefined} config
 * @returns {boolean}
 */
export function iaDisponivel(config) {
  return Boolean(config?.ligada && config?.chave);
}

/**
 * Mostra só o começo e o fim da chave: "AIzaSy…9k2Q".
 *
 * @param {string} chave
 * @returns {string}
 */
export function mascararChave(chave) {
  if (!chave) return '';
  if (chave.length <= 10) return '•'.repeat(chave.length);
  return `${chave.slice(0, 6)}…${chave.slice(-4)}`;
}

/** Nome do modelo para a tela. */
export function nomeDoModelo(id) {
  return MODELOS.find((m) => m.id === id)?.nome ?? id;
}

/* ------------------------------------------------------------------ */
/* Pedido e resposta                                                  */
/* ------------------------------------------------------------------ */

/**
 * Monta o pedido HTTP para a API (sem enviar).
 *
 * A chave vai no cabeçalho "x-goog-api-key" (não no endereço), como na
 * documentação do Gemini: assim ela não aparece em históricos de endereço.
 *
 * referrerPolicy "strict-origin": o app inteiro não informa a outros sites
 * de onde a pessoa veio (netlify.toml, Referrer-Policy: no-referrer). Só
 * neste pedido o navegador envia a ORIGEM do app (ex.: https://meuapp.netlify.app/,
 * sem caminho). É isso que permite restringir a chave ao endereço do app
 * no Google Cloud: um pedido sem origem seria recusado pela chave restrita.
 *
 * @param {object} config     { chave, modelo }
 * @param {object} mensagem
 * @param {string} mensagem.instrucoes O papel da IA e as regras de resposta.
 * @param {string} mensagem.conteudo   Os números e a pergunta.
 * @returns {{ url: string, opcoes: object }}
 */
export function montarPedido(config, { instrucoes, conteudo }) {
  return {
    url: `${ENDERECO_API}/${encodeURIComponent(config.modelo)}:generateContent`,
    opcoes: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.chave },
      referrerPolicy: 'strict-origin',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucoes }] },
        contents: [{ role: 'user', parts: [{ text: conteudo }] }],
      }),
    },
  };
}

/** Motivo de erro que a API manda em error.details[].reason. */
function motivoDoErro(corpo) {
  const detalhes = corpo?.error?.details ?? [];
  return detalhes.map((d) => d?.reason).find(Boolean) ?? '';
}

/**
 * Lê a resposta da API e devolve o texto ou uma mensagem de erro clara.
 *
 * @param {number} status Código HTTP.
 * @param {object|null} corpo O JSON da resposta (null se não veio JSON).
 * @returns {{ ok: true, texto: string } | { ok: false, erro: string }}
 */
export function lerResposta(status, corpo) {
  if (status >= 200 && status < 300) {
    const candidato = corpo?.candidates?.[0];
    // Partes de "pensamento" (thought) não são a resposta: ficam de fora.
    const texto = (candidato?.content?.parts ?? [])
      .filter((p) => typeof p?.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();
    if (texto !== '') return { ok: true, texto };
    if (corpo?.promptFeedback?.blockReason || candidato?.finishReason === 'SAFETY') {
      return { ok: false, erro: 'O Gemini não quis responder a este pedido. Tente de novo mais tarde.' };
    }
    return { ok: false, erro: 'O Gemini respondeu vazio. Tente de novo.' };
  }

  const motivo = motivoDoErro(corpo);
  if (motivo === 'API_KEY_INVALID' || (status === 400 && /api key/i.test(corpo?.error?.message ?? ''))) {
    return { ok: false, erro: 'Chave inválida. Confira se copiou a chave inteira do Google AI Studio.' };
  }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      erro: 'A chave não tem permissão para o Gemini. No Google AI Studio, crie uma chave nova ou restrinja esta à "Gemini API".',
    };
  }
  if (status === 404) {
    return { ok: false, erro: 'Modelo não encontrado. Em Configurar, escolha o outro modelo da lista.' };
  }
  if (status === 429) {
    return { ok: false, erro: 'O limite de uso do Gemini acabou por enquanto. Tente de novo mais tarde (o limite diário volta no dia seguinte).' };
  }
  if (status >= 500) {
    return { ok: false, erro: 'O Gemini está com problemas agora. Tente de novo em alguns minutos.' };
  }
  return { ok: false, erro: `O Gemini recusou o pedido (código ${status}).` };
}

/**
 * Envia o pedido e devolve o texto da IA ou um erro claro.
 * Nunca lança erro de rede: tudo vira { ok: false, erro }.
 *
 * @param {object} config   { chave, modelo }
 * @param {object} mensagem { instrucoes, conteudo }
 * @param {object} [opcoes]
 * @param {Function} [opcoes.fetch]       Padrão: o fetch do navegador.
 * @param {number}   [opcoes.tempoLimiteMs]
 * @returns {Promise<{ ok: true, texto: string } | { ok: false, erro: string }>}
 */
export async function chamarGemini(config, mensagem, { fetch = globalThis.fetch, tempoLimiteMs = TEMPO_LIMITE_MS } = {}) {
  if (!config?.chave) {
    return { ok: false, erro: 'Cadastre a chave do Gemini em Configurar.' };
  }

  const { url, opcoes } = montarPedido(config, mensagem);
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);

  try {
    const resposta = await fetch(url, { ...opcoes, signal: controle.signal });
    let corpo = null;
    try {
      corpo = await resposta.json();
    } catch {
      corpo = null; // resposta sem JSON: lerResposta trata pelo código
    }
    return lerResposta(resposta.status, corpo);
  } catch (falha) {
    if (falha?.name === 'AbortError') {
      return { ok: false, erro: 'O Gemini demorou demais para responder. Tente de novo.' };
    }
    return { ok: false, erro: 'Sem conexão com o Gemini. Confira a internet e tente de novo.' };
  } finally {
    clearTimeout(relogio);
  }
}

/* ------------------------------------------------------------------ */
/* Teste de conexão                                                   */
/* ------------------------------------------------------------------ */

/** Pedido mínimo para o botão "Testar conexão" (gasta quase nada do limite). */
export const MENSAGEM_DE_TESTE = Object.freeze({
  instrucoes: 'Você é um teste de conexão. Responda só com a palavra OK.',
  conteudo: 'Teste de conexão do Painel Financeiro.',
});

/**
 * Testa a chave e o modelo.
 *
 * @param {object} config
 * @param {object} [opcoes] { fetch, tempoLimiteMs }
 * @returns {Promise<{ ok: boolean, mensagem: string }>}
 */
export async function testarConexao(config, opcoes = {}) {
  const resultado = await chamarGemini(config, MENSAGEM_DE_TESTE, opcoes);
  return resultado.ok
    ? { ok: true, mensagem: `Conexão OK: o ${nomeDoModelo(config.modelo).split(' (')[0]} respondeu.` }
    : { ok: false, mensagem: resultado.erro };
}
