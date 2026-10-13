/**
 * Seção "Conta e nuvem" da vista Configurar e o indicador do rodapé
 * (Fase 05, parte 5.3).
 *
 * A pessoa informa o endereço do servidor, o e-mail e a senha. Depois disso
 * o app sincroniza sozinho: ao abrir, ao voltar a internet, ao voltar para
 * o app e alguns segundos depois de cada alteração. O app continua
 * funcionando sem internet; o que mudar fica pendente e vai depois.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. O que enviar e como
 * juntar a resposta ficam em src/sincronizacao.js, e a conversa com o
 * servidor em src/nuvem-cliente.js (os dois testados no Node).
 *
 * Quem usa este módulo (src/ui/app.js) entrega:
 * - obterDados(): os dados do app agora;
 * - podeSincronizar(): false enquanto os dados forem o exemplo;
 * - aplicarDaNuvem(dados): troca os dados pelos juntados, redesenha e grava;
 * - substituirPelaNuvem(dados): troca TODOS os dados pelos do servidor;
 * - lerGuardado() / gravarGuardado(nuvem): o registro "nuvem" do aparelho.
 */

import { ErroValidacao } from '../erros.js';
import { ENDERECO_PADRAO, ErroNuvem, criarClienteNuvem, normalizarEndereco } from '../nuvem-cliente.js';
import {
  aplicarResposta,
  dadosDoServidor,
  estadoDepoisDeAdotar,
  estadoInicial,
  montarPedido,
  pendentes,
  temDadosNoServidor,
} from '../sincronizacao.js';

/** Espera depois de uma alteração, para juntar várias num envio só. */
const ESPERA_DEPOIS_DE_ALTERAR_MS = 3000;

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** "22:15" a partir de um texto ISO. */
function horaDe(texto) {
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "1 alteração" / "3 alterações". */
function alteracoes(total) {
  return total === 1 ? '1 alteração' : `${total} alterações`;
}

/**
 * Liga a seção da nuvem.
 *
 * @param {object} opcoes Ver o comentário do topo.
 * @returns {{ carregar: () => Promise<void>, renderizar: () => void, agendar: (esperaMs?: number) => void,
 *   sincronizar: () => Promise<void>, dadosTrocados: () => void }}
 */
export function iniciarNuvem({ obterDados, podeSincronizar, aplicarDaNuvem, substituirPelaNuvem, lerGuardado, gravarGuardado }) {
  const el = {
    situacao: elemento('nuvem-situacao'),
    detalhe: elemento('nuvem-detalhe'),
    form: elemento('form-nuvem'),
    endereco: elemento('nuvem-endereco'),
    email: elemento('nuvem-email'),
    senha: elemento('nuvem-senha'),
    erro: elemento('nuvem-erro'),
    entrar: elemento('nuvem-entrar'),
    conectado: elemento('nuvem-conectado'),
    sincronizarAgora: elemento('nuvem-sincronizar'),
    sair: elemento('nuvem-sair'),
    indicador: elemento('nuvem-indicador'),
  };

  /** O registro "nuvem" do aparelho. */
  let guardado = { endereco: ENDERECO_PADRAO, email: '', sessao: null, sincronizacao: null };
  /** Sincronização em andamento (para nunca rodar duas ao mesmo tempo). */
  let emAndamento = null;
  /** Pedir outra sincronização assim que a atual terminar. */
  let deNovo = false;
  /** Enquanto os dados vindos do servidor são aplicados, alterações não agendam envio. */
  let aplicando = false;
  let temporizador = null;
  /** Último problema, para mostrar na tela: { tipo, mensagem } ou null. */
  let problema = null;

  async function guardar(novo) {
    guardado = novo;
    try {
      await gravarGuardado(guardado);
    } catch {
      // Sem gravar no aparelho, a sessão vale só até fechar o app.
    }
  }

  function cliente() {
    return criarClienteNuvem({
      endereco: guardado.endereco,
      obterSessao: () => guardado.sessao,
      salvarSessao: (sessao) => guardar({ ...guardado, sessao }),
    });
  }

  const conectado = () => Boolean(guardado.sessao);

  function renderizar() {
    const dados = obterDados();
    const estado = guardado.sincronizacao ?? estadoInicial();
    const quantos = dados ? pendentes(dados, estado).total : 0;

    el.form.hidden = conectado();
    el.conectado.hidden = !conectado();
    el.endereco.value = guardado.endereco ?? ENDERECO_PADRAO;
    if (!el.email.value) el.email.value = guardado.email ?? '';

    let situacao;
    let indicador = '';
    let atencao = false;
    if (!conectado()) {
      situacao = problema?.tipo === 'sessao' ? problema.mensagem : 'Não conectado: os dados ficam só neste aparelho.';
      atencao = problema?.tipo === 'sessao';
      indicador = atencao ? 'Nuvem: entre de novo' : '';
    } else if (emAndamento) {
      situacao = `Conectado como ${guardado.email}. Sincronizando…`;
      indicador = 'Nuvem: sincronizando…';
    } else if (problema) {
      situacao = `Conectado como ${guardado.email}. ${problema.mensagem}`;
      indicador = quantos > 0 ? `Nuvem: ${alteracoes(quantos)} esperando` : 'Nuvem: sem conexão';
      atencao = true;
    } else if (!podeSincronizar()) {
      situacao = `Conectado como ${guardado.email}. Os dados de exemplo não são sincronizados: use "Usar de verdade".`;
      indicador = 'Nuvem: exemplo não sincroniza';
    } else {
      const quando = estado.ultimaEm ? ` Última sincronização às ${horaDe(estado.ultimaEm)}.` : '';
      situacao = quantos > 0
        ? `Conectado como ${guardado.email}. ${alteracoes(quantos)} esperando envio.${quando}`
        : `Conectado como ${guardado.email}. Tudo sincronizado.${quando}`;
      indicador = quantos > 0 ? `Nuvem: ${alteracoes(quantos)} esperando` : `Nuvem: sincronizado ${horaDe(estado.ultimaEm)}`.trim();
    }

    el.situacao.textContent = situacao;
    const recusados = estado.recusados ?? [];
    el.detalhe.textContent = recusados.length > 0
      ? `O servidor recusou ${recusados.length === 1 ? '1 registro' : `${recusados.length} registros`}: ${
        recusados.slice(0, 3).map((r) => Object.values(r.campos ?? {})[0] ?? r.lista).join(' ')}`
      : '';
    el.indicador.textContent = indicador;
    el.indicador.hidden = indicador === '';
    el.indicador.classList.toggle('atencao', atencao);
  }

  /** Mostra o erro de uma sincronização (sem interromper o app). */
  function registrarProblema(erro) {
    if (erro instanceof ErroNuvem) {
      problema = { tipo: erro.tipo, mensagem: erro.message };
    } else {
      console.error(erro);
      problema = { tipo: 'servidor', mensagem: 'Não foi possível sincronizar agora.' };
    }
  }

  /**
   * Primeira sincronização deste aparelho: se a conta já tem dados no
   * servidor, pergunta se é para usá-los aqui (trocando os daqui) ou juntar.
   *
   * @returns {Promise<boolean>} true se os dados do servidor foram adotados.
   */
  async function primeiraVez(api) {
    const tudo = await api.sincronizar({ desde: null, listas: {}, configuracao: null });
    if (!temDadosNoServidor(tudo)) return false;

    const usarDaNuvem = window.confirm(
      'Esta conta já tem dados no servidor.\n\n'
      + 'OK: usar os dados do servidor neste aparelho (os dados daqui são substituídos).\n'
      + 'Cancelar: juntar os dados deste aparelho com os do servidor.',
    );
    if (!usarDaNuvem) return false;

    const dados = dadosDoServidor(tudo);
    if (!dados) return false; // servidor sem o mínimo (mês e formas de pagamento): junta
    aplicando = true;
    try {
      await substituirPelaNuvem(dados);
    } finally {
      aplicando = false;
    }
    await guardar({ ...guardado, sincronizacao: estadoDepoisDeAdotar(dados, tudo) });
    // O app pode ter criado o mês atual ao adotar os dados: envia na sequência.
    agendar(500);
    return true;
  }

  async function executar() {
    const api = cliente();
    let estado = guardado.sincronizacao ?? estadoInicial();

    if (estado.cursor === null && await primeiraVez(api)) return;

    const pedido = montarPedido(obterDados(), estado);
    const resposta = await api.sincronizar(pedido);
    // Os dados podem ter mudado durante o pedido: junta sobre os de agora.
    const juncao = aplicarResposta(obterDados(), estado, pedido, resposta);
    estado = juncao.estado;
    if (juncao.mudou) {
      aplicando = true;
      try {
        await aplicarDaNuvem(juncao.dados);
      } finally {
        aplicando = false;
      }
    }
    await guardar({ ...guardado, sincronizacao: estado });
  }

  /** Sincroniza agora (ou na sequência, se já houver uma em andamento). */
  async function sincronizar() {
    if (!conectado() || !podeSincronizar() || obterDados() === null) {
      renderizar();
      return;
    }
    if (emAndamento) {
      deNovo = true;
      return emAndamento;
    }
    clearTimeout(temporizador);
    emAndamento = (async () => {
      renderizar();
      try {
        await executar();
        problema = null;
      } catch (erro) {
        registrarProblema(erro);
      } finally {
        emAndamento = null;
        renderizar();
      }
    })();
    await emAndamento;
    if (deNovo) {
      deNovo = false;
      await sincronizar();
    }
  }

  /** Sincroniza daqui a pouco (várias alterações seguidas viram um envio só). */
  function agendar(esperaMs = ESPERA_DEPOIS_DE_ALTERAR_MS) {
    if (aplicando || !conectado()) {
      renderizar();
      return;
    }
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { sincronizar(); }, esperaMs);
    renderizar();
  }

  el.form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    el.erro.textContent = '';
    let endereco;
    try {
      endereco = normalizarEndereco(el.endereco.value);
    } catch (erro) {
      if (!(erro instanceof ErroValidacao)) throw erro;
      el.erro.textContent = erro.message;
      return;
    }
    const email = el.email.value.trim();
    const senha = el.senha.value;
    if (!email || !senha) {
      el.erro.textContent = 'Informe o e-mail e a senha.';
      return;
    }

    el.entrar.disabled = true;
    try {
      // Outra conta ou outro servidor: a sincronização começa do zero.
      const mesmaConta = guardado.endereco === endereco && guardado.email === email;
      await guardar({
        endereco, email, sessao: null, sincronizacao: mesmaConta ? guardado.sincronizacao : null,
      });
      await cliente().entrar(email, senha);
      el.senha.value = '';
      problema = null;
      await sincronizar();
    } catch (erro) {
      el.erro.textContent = erro instanceof ErroNuvem ? erro.message : 'Não foi possível entrar agora.';
      if (!(erro instanceof ErroNuvem)) console.error(erro);
    } finally {
      el.entrar.disabled = false;
      renderizar();
    }
  });

  el.sincronizarAgora.addEventListener('click', () => { sincronizar(); });

  el.sair.addEventListener('click', async () => {
    const quantos = obterDados() ? pendentes(obterDados(), guardado.sincronizacao ?? estadoInicial()).total : 0;
    const aviso = quantos > 0
      ? `Há ${alteracoes(quantos)} ainda não enviadas. Sair mesmo assim? Os dados continuam neste aparelho.`
      : 'Sair da conta neste aparelho? Os dados continuam aqui.';
    if (!window.confirm(aviso)) return;
    await cliente().sair();
    await guardar({ ...guardado, sessao: null, sincronizacao: null });
    problema = null;
    renderizar();
  });

  // Internet de volta ou o app de volta à tela: sincroniza.
  window.addEventListener('online', () => agendar(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') agendar(500);
  });

  return {
    /** Lê a conta guardada no aparelho (chamar uma vez, no início). */
    async carregar() {
      try {
        const lido = await lerGuardado();
        if (lido) guardado = { ...guardado, ...lido };
      } catch {
        // Sem o registro: começa desconectado.
      }
      renderizar();
    },
    renderizar,
    agendar,
    sincronizar,
    /**
     * Os dados do aparelho foram trocados de uma vez (exemplo, apagar tudo,
     * importar backup): a sincronização recomeça do zero, como num aparelho novo.
     */
    dadosTrocados() {
      if (!guardado.sincronizacao) return;
      guardar({ ...guardado, sincronizacao: null });
      renderizar();
    },
  };
}
