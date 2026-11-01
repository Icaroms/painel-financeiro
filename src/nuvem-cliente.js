/**
 * Conversa com o servidor do Painel Financeiro (Fase 05, parte 5.3).
 *
 * Login, renovação do token, sincronização, saída, backups na nuvem (5.4)
 * e "apagar os dados da conta" (5.4). A sessão (tokens)
 * fica guardada no aparelho por quem usa este módulo (src/ui/nuvem.js),
 * fora do backup; a senha nunca é guardada.
 *
 * Tokens:
 * - token de acesso: curto (15 min), vai no cabeçalho Authorization;
 * - token de renovação: longo (30 dias), troca por um token de acesso novo.
 *   Cada troca devolve um token de renovação novo e o antigo deixa de valer.
 *
 * O "fetch" é recebido de fora, para os testes no Node usarem um falso.
 */

import { ErroValidacao } from './erros.js';

/** Endereço sugerido para o servidor rodando no próprio computador (rodar-dev). */
export const ENDERECO_PADRAO = 'http://localhost:8081';

/** Renova o token de acesso se faltar menos que isto para ele vencer. */
const FOLGA_DO_TOKEN_MS = 30 * 1000;

/**
 * Erro de comunicação com o servidor, com o tipo para a tela decidir o texto:
 * - "rede":        sem conexão (ou o servidor fora do ar);
 * - "credenciais": e-mail ou senha errados;
 * - "limite":      muitas tentativas de login;
 * - "sessao":      a sessão acabou, é preciso entrar de novo;
 * - "dados":       o servidor recusou o pedido;
 * - "servidor":    erro do servidor.
 */
export class ErroNuvem extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.name = 'ErroNuvem';
    this.tipo = tipo;
  }
}

/**
 * Confere e arruma o endereço do servidor digitado.
 * "localhost:8081/" vira "http://localhost:8081".
 *
 * @param {string} texto
 * @returns {string}
 */
export function normalizarEndereco(texto) {
  let limpo = String(texto ?? '').trim();
  if (limpo === '') throw new ErroValidacao('endereco', 'Informe o endereço do servidor.');
  if (!/^https?:\/\//i.test(limpo)) limpo = `http://${limpo}`;
  let url;
  try {
    url = new URL(limpo);
  } catch {
    throw new ErroValidacao('endereco', 'Endereço inválido. Exemplo: http://localhost:8081');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && !local) {
    throw new ErroValidacao('endereco', 'Use https:// (só o servidor no próprio computador pode usar http://).');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Lê o corpo da resposta: o texto e, se for JSON, o objeto (ou null). */
async function lerCorpo(resposta) {
  const texto = await resposta.text();
  if (!texto) return { texto: '', json: null };
  try {
    return { texto, json: JSON.parse(texto) };
  } catch {
    return { texto, json: null };
  }
}

/**
 * Cria o cliente do servidor.
 *
 * @param {object} opcoes
 * @param {string} opcoes.endereco Ex.: "http://localhost:8081" (já normalizado).
 * @param {() => object|null} opcoes.obterSessao A sessão guardada, ou null.
 * @param {(sessao: object|null) => Promise<void>} opcoes.salvarSessao Guarda (null apaga).
 * @param {typeof fetch} [opcoes.buscar] O fetch a usar (nos testes, um falso).
 * @param {() => number} [opcoes.agoraMs] Relógio (nos testes, fixo).
 */
export function criarClienteNuvem({ endereco, obterSessao, salvarSessao, buscar = globalThis.fetch?.bind(globalThis), agoraMs = () => Date.now() }) {
  /**
   * Um pedido ao servidor.
   *
   * @param {string} caminho Ex.: "/api/sync".
   * @param {object} [opcoes]
   * @param {string} [opcoes.metodo] "POST" (padrão), "GET" ou "DELETE".
   * @param {object} [opcoes.corpo] Objeto enviado como JSON (só no POST).
   * @param {string} [opcoes.texto] Corpo já pronto em JSON (ex.: o backup), no lugar de "corpo".
   * @param {string} [opcoes.token] Token de acesso.
   * @returns {Promise<{ status: number, texto: string, json: any }>}
   */
  async function pedir(caminho, { metodo = 'POST', corpo, texto, token } = {}) {
    const cabecalhos = {};
    if (metodo === 'POST') cabecalhos['Content-Type'] = 'application/json';
    if (token) cabecalhos.Authorization = `Bearer ${token}`;
    let resposta;
    try {
      resposta = await buscar(`${endereco}${caminho}`, {
        method: metodo,
        headers: cabecalhos,
        body: metodo === 'POST' ? (texto ?? JSON.stringify(corpo ?? {})) : undefined,
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new ErroNuvem('rede', 'Sem conexão com o servidor. O que mudar fica guardado e vai depois.');
    }
    return { status: resposta.status, ...(await lerCorpo(resposta)) };
  }

  /** Converte a resposta de login/renovação na sessão guardada. */
  function sessaoDa(json) {
    return {
      token: json.token,
      expiraEm: json.expiraEm,
      tokenRenovacao: json.tokenRenovacao,
      renovacaoExpiraEm: json.renovacaoExpiraEm,
    };
  }

  function erroDoServidor({ status, json }) {
    const detalhe = json?.detail ?? 'O servidor não respondeu como esperado.';
    if (status === 400 || status === 413) return new ErroNuvem('dados', detalhe);
    if (status === 404) return new ErroNuvem('dados', 'Não encontrado no servidor (pode ter sido apagado).');
    if (status === 429) return new ErroNuvem('limite', detalhe);
    return new ErroNuvem('servidor', `Erro do servidor (${status}). Tente de novo em instantes.`);
  }

  async function renovar() {
    const sessao = obterSessao();
    if (!sessao?.tokenRenovacao) throw new ErroNuvem('sessao', 'Entre na sua conta para sincronizar.');
    const resposta = await pedir('/api/auth/renovar', { corpo: { tokenRenovacao: sessao.tokenRenovacao } });
    if (resposta.status === 401) {
      await salvarSessao(null);
      throw new ErroNuvem('sessao', 'A sessão terminou. Entre de novo para sincronizar.');
    }
    if (resposta.status !== 200) throw erroDoServidor(resposta);
    const nova = sessaoDa(resposta.json);
    await salvarSessao(nova);
    return nova;
  }

  /** Pedido com token; renova uma vez se o token venceu. */
  async function comToken(caminho, opcoes = {}) {
    let sessao = obterSessao();
    if (!sessao?.token) throw new ErroNuvem('sessao', 'Entre na sua conta para sincronizar.');
    const expira = Date.parse(sessao.expiraEm);
    if (Number.isNaN(expira) || expira - agoraMs() < FOLGA_DO_TOKEN_MS) sessao = await renovar();

    let resposta = await pedir(caminho, { ...opcoes, token: sessao.token });
    if (resposta.status === 401) {
      sessao = await renovar();
      resposta = await pedir(caminho, { ...opcoes, token: sessao.token });
      if (resposta.status === 401) {
        await salvarSessao(null);
        throw new ErroNuvem('sessao', 'A sessão terminou. Entre de novo para sincronizar.');
      }
    }
    return resposta;
  }

  return {
    /** Login: guarda a sessão e devolve. */
    async entrar(email, senha) {
      const resposta = await pedir('/api/auth/login', { corpo: { email, senha } });
      if (resposta.status === 401) throw new ErroNuvem('credenciais', 'E-mail ou senha incorretos.');
      if (resposta.status !== 200) throw erroDoServidor(resposta);
      const sessao = sessaoDa(resposta.json);
      await salvarSessao(sessao);
      return sessao;
    },

    /** POST /api/sync. */
    async sincronizar(pedido) {
      const resposta = await comToken('/api/sync', { corpo: pedido });
      if (resposta.status !== 200) throw erroDoServidor(resposta);
      return resposta.json;
    },

    /** POST /api/backups com o texto do pacote; devolve o resumo do backup guardado. */
    async enviarBackup(textoDoPacote) {
      const resposta = await comToken('/api/backups', { texto: textoDoPacote });
      if (resposta.status !== 201) throw erroDoServidor(resposta);
      return resposta.json;
    },

    /** GET /api/backups: { backups, maximo, tamanhoMaximoBytes }. */
    async listarBackups() {
      const resposta = await comToken('/api/backups', { metodo: 'GET' });
      if (resposta.status !== 200) throw erroDoServidor(resposta);
      return resposta.json;
    },

    /** GET /api/backups/{id}: o pacote, como TEXTO (para lerBackup). */
    async baixarBackup(id) {
      const resposta = await comToken(`/api/backups/${encodeURIComponent(id)}`, { metodo: 'GET' });
      if (resposta.status !== 200) throw erroDoServidor(resposta);
      return resposta.texto;
    },

    /** DELETE /api/backups/{id}. */
    async apagarBackup(id) {
      const resposta = await comToken(`/api/backups/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
      if (resposta.status !== 204) throw erroDoServidor(resposta);
    },

    /** DELETE /api/conta/dados: { zeradosEm }. */
    async zerarDados() {
      const resposta = await comToken('/api/conta/dados', { metodo: 'DELETE' });
      if (resposta.status !== 200) throw erroDoServidor(resposta);
      return resposta.json;
    },

    /** Sai: avisa o servidor (se der) e apaga a sessão do aparelho. */
    async sair() {
      const sessao = obterSessao();
      if (sessao?.tokenRenovacao) {
        try {
          await pedir('/api/auth/sair', { corpo: { tokenRenovacao: sessao.tokenRenovacao } });
        } catch {
          // Sem internet: a sessão do aparelho é apagada mesmo assim e vence sozinha no servidor.
        }
      }
      await salvarSessao(null);
    },
  };
}
