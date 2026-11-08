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
 * Fase 05, parte 5.5 (11/2026): a IA pode vir de duas ORIGENS:
 * - "aparelho": a chave da pessoa, guardada só neste aparelho (como antes);
 * - "servidor": o servidor da conta chama o Gemini com a chave dele
 *   (variável de ambiente), com um limite de pedidos por dia. O aparelho
 *   não precisa de chave; precisa estar conectado à conta.
 * O pedido (instruções + conteúdo) é o mesmo nas duas origens.
 *
 * Este arquivo não depende do navegador: a chamada recebe o "fetch" como
 * parâmetro, e os testes passam um fetch falso (sem internet). A IA do
 * servidor chega pronta em config.servidor (criarIaDoServidor), sem ser
 * gravada junto com a configuração.
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

/** De onde vem a IA. */
export const ORIGENS = Object.freeze({ APARELHO: 'aparelho', SERVIDOR: 'servidor' });

/** Tempo máximo esperando a resposta. */
export const TEMPO_LIMITE_MS = 30000;

/* ------------------------------------------------------------------ */
/* Configuração                                                       */
/* ------------------------------------------------------------------ */

/** Configuração de quem ainda não cadastrou a chave. */
export function configuracaoVazia() {
  return { chave: '', modelo: MODELO_PADRAO, ligada: false, origem: ORIGENS.APARELHO };
}

/**
 * Valida e monta a configuração da IA.
 *
 * Com a origem "servidor", a chave do aparelho é opcional (se houver uma
 * salva, ela continua guardada para quando a pessoa voltar para o aparelho).
 *
 * @param {object}  dados
 * @param {string}  [dados.chave]  A chave do Google AI Studio.
 * @param {string}  [dados.modelo]
 * @param {boolean} [dados.ligada]
 * @param {'aparelho'|'servidor'} [dados.origem]
 * @returns {{ chave: string, modelo: string, ligada: boolean, origem: string }}
 */
export function criarConfiguracaoIA({ chave, modelo = MODELO_PADRAO, ligada = true, origem = ORIGENS.APARELHO }) {
  if (!Object.values(ORIGENS).includes(origem)) {
    throw new ErroValidacao('origem', 'Escolha de onde vem a IA: deste aparelho ou do servidor.');
  }
  const limpa = typeof chave === 'string' ? chave.trim() : '';
  if (limpa === '' && origem === ORIGENS.APARELHO) {
    throw new ErroValidacao('chave', 'Cole a chave do Google AI Studio.');
  }
  if (limpa !== '' && (/\s/.test(limpa) || limpa.length < 20)) {
    throw new ErroValidacao('chave', 'Essa chave parece incompleta. Copie de novo no Google AI Studio.');
  }
  if (!MODELOS.some((m) => m.id === modelo)) {
    throw new ErroValidacao('modelo', 'Escolha um dos modelos da lista.');
  }
  if (typeof ligada !== 'boolean') {
    throw new ErroValidacao('ligada', 'O campo "usar a IA" deve ser verdadeiro ou falso.');
  }
  return { chave: limpa, modelo, ligada, origem };
}

/** A configuração usa a IA do servidor? (configurações antigas não têm "origem": são do aparelho) */
export const usaServidor = (config) => config?.origem === ORIGENS.SERVIDOR;

/**
 * Diz se a IA pode ser usada: está ligada e tem de onde vir (a chave do
 * aparelho, ou a conta conectada quando a origem é o servidor).
 *
 * @param {object|null|undefined} config
 * @returns {boolean}
 */
export function iaDisponivel(config) {
  if (!config?.ligada) return false;
  if (usaServidor(config)) return Boolean(config.servidor?.pronto());
  return Boolean(config.chave);
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
 * O pedido não informa de onde vem: referrerPolicy "no-referrer", a mesma
 * regra do app inteiro (netlify.toml), escrita aqui também para valer em
 * qualquer servidor (o do "npm run dev" não manda essa regra). Enviar a
 * origem só faria sentido para restringir a chave por site, e isso não
 * existe para as chaves do AI Studio (presas a uma conta de serviço),
 * como visto em 10/10/2026.
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
      referrerPolicy: 'no-referrer',
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
    return { ok: false, erro: 'Modelo não encontrado. Em Ajustes → IA, escolha o outro modelo da lista.' };
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
  if (usaServidor(config)) {
    if (!config.servidor) return { ok: false, erro: ERRO_SEM_CONTA };
    return config.servidor.gerar(mensagem, config.modelo);
  }
  if (!config?.chave) {
    return { ok: false, erro: 'Cadastre a chave do Gemini em Ajustes → IA.' };
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
/* IA pelo servidor (Fase 05, parte 5.5)                              */
/* ------------------------------------------------------------------ */

const ERRO_SEM_CONTA = 'Para usar a IA do servidor, entre na sua conta em Ajustes → Conta.';

/** Mensagem clara para um erro do servidor (ErroNuvem) num pedido de IA. */
function mensagemDoErroDoServidor(falha) {
  if (falha?.tipo === 'rede') return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (falha?.tipo === 'sessao') return 'A sessão da conta terminou. Entre de novo em Ajustes → Conta.';
  return falha?.message || 'O servidor não respondeu como esperado. Tente de novo.';
}

/**
 * A IA do servidor, no formato que chamarGemini usa (config.servidor).
 *
 * @param {object} opcoes
 * @param {() => boolean} opcoes.conectado A conta está conectada neste aparelho?
 * @param {(pedido: { instrucoes: string, conteudo: string, modelo: string }) => Promise<{ texto: string, usadosHoje: number, limiteDiario: number }>} opcoes.gerar
 *   POST /api/ia/gerar (lança ErroNuvem se falhar).
 * @param {() => Promise<{ disponivel: boolean, modelos: string[], usadosHoje: number, limiteDiario: number }>} opcoes.situacao
 *   GET /api/ia (lança ErroNuvem se falhar).
 */
export function criarIaDoServidor({ conectado, gerar, situacao }) {
  return {
    pronto: () => Boolean(conectado()),
    /** @returns {Promise<{ ok: true, texto: string, usadosHoje: number, limiteDiario: number } | { ok: false, erro: string }>} */
    async gerar(mensagem, modelo) {
      if (!conectado()) return { ok: false, erro: ERRO_SEM_CONTA };
      try {
        const r = await gerar({ instrucoes: mensagem.instrucoes, conteudo: mensagem.conteudo, modelo });
        const texto = typeof r?.texto === 'string' ? r.texto.trim() : '';
        if (texto === '') return { ok: false, erro: 'A IA do servidor respondeu vazio. Tente de novo.' };
        return { ok: true, texto, usadosHoje: r.usadosHoje, limiteDiario: r.limiteDiario };
      } catch (falha) {
        return { ok: false, erro: mensagemDoErroDoServidor(falha) };
      }
    },
    /** @returns {Promise<{ ok: true, disponivel: boolean, usadosHoje: number, limiteDiario: number } | { ok: false, erro: string }>} */
    async situacao() {
      if (!conectado()) return { ok: false, erro: ERRO_SEM_CONTA };
      try {
        const r = await situacao();
        return { ok: true, disponivel: Boolean(r?.disponivel), usadosHoje: r?.usadosHoje ?? 0, limiteDiario: r?.limiteDiario ?? 0 };
      } catch (falha) {
        return { ok: false, erro: mensagemDoErroDoServidor(falha) };
      }
    },
  };
}

/**
 * Texto da situação da IA do servidor para Ajustes → IA.
 *
 * @param {{ ok: boolean, erro?: string, disponivel?: boolean, usadosHoje?: number, limiteDiario?: number }} situacao
 * @returns {{ texto: string, ok: boolean }}
 */
export function textoDaSituacaoDoServidor(situacao) {
  if (!situacao.ok) return { texto: situacao.erro, ok: false };
  if (!situacao.disponivel) {
    return { texto: 'O servidor não tem a chave do Gemini configurada. Use a chave deste aparelho.', ok: false };
  }
  return { texto: `IA do servidor disponível · usados hoje: ${situacao.usadosHoje} de ${situacao.limiteDiario}`, ok: true };
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
  if (!resultado.ok) return { ok: false, mensagem: resultado.erro };
  const modelo = nomeDoModelo(config.modelo).split(' (')[0];
  return usaServidor(config)
    ? { ok: true, mensagem: `Conexão OK: o ${modelo} respondeu pelo servidor (usados hoje: ${resultado.usadosHoje} de ${resultado.limiteDiario}).` }
    : { ok: true, mensagem: `Conexão OK: o ${modelo} respondeu.` };
}
