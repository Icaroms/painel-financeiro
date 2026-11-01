/**
 * Seção "Conta e nuvem" da vista Configurar e o indicador do rodapé
 * (Fase 05, partes 5.3 e 5.4).
 *
 * A pessoa informa o endereço do servidor, o e-mail e a senha. Depois disso
 * o app sincroniza sozinho: ao abrir, ao voltar a internet, ao voltar para
 * o app e alguns segundos depois de cada alteração. O app continua
 * funcionando sem internet; o que mudar fica pendente e vai depois.
 *
 * Backups na nuvem (5.4): enviar agora, listar, restaurar e apagar. O app
 * também envia um backup sozinho quando o último da nuvem tem 7 dias ou mais.
 *
 * Conta zerada (5.4): "Apagar tudo" e "Restaurar backup" apagam os dados
 * da conta no servidor. Os outros aparelhos ficam sabendo na sincronização
 * seguinte e perguntam se usam os dados da conta ou enviam os deles.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. O que enviar e como
 * juntar a resposta ficam em src/sincronizacao.js e src/backup-nuvem.js, e a
 * conversa com o servidor em src/nuvem-cliente.js (testados no Node).
 *
 * Quem usa este módulo (src/ui/app.js) entrega:
 * - obterDados(): os dados do app agora;
 * - podeSincronizar(): false enquanto os dados forem o exemplo;
 * - aplicarDaNuvem(dados): troca os dados pelos juntados, redesenha e grava;
 * - substituirPelaNuvem(dados): troca TODOS os dados pelos do servidor;
 * - restaurarBackup(dados, antesDeTrocar): troca TODOS os dados pelos de um
 *   backup; chama "antesDeTrocar" (que apaga os dados da conta) logo antes;
 * - backupFeito(agora): marca nos dados a data do último backup;
 * - lerGuardado() / gravarGuardado(nuvem): o registro "nuvem" do aparelho.
 */

import { ErroValidacao } from '../erros.js';
import { hojeLocal } from '../datas.js';
import { criarDadosIniciais } from '../inicio.js';
import { lerBackup } from '../backup.js';
import { registrarBackup } from '../lembrete-backup.js';
import { ENDERECO_PADRAO, ErroNuvem, criarClienteNuvem, normalizarEndereco } from '../nuvem-cliente.js';
import {
  aplicarResposta,
  dadosDoServidor,
  estadoDepoisDeAdotar,
  estadoDepoisDeZerar,
  estadoInicial,
  montarPedido,
  pendentes,
  temDadosNoServidor,
} from '../sincronizacao.js';
import {
  DIAS_PARA_BACKUP_NUVEM,
  TAMANHO_MAXIMO_PADRAO,
  descreverBackup,
  precisaDeBackupAutomatico,
  prepararBackupNuvem,
  situacaoDoBackupNuvem,
  ultimoBackupDaLista,
} from '../backup-nuvem.js';

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

/** "14/10/2026, 22:15" a partir de um texto ISO. */
function dataHoraDe(texto) {
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** "1 alteração" / "3 alterações". */
function alteracoes(total) {
  return total === 1 ? '1 alteração' : `${total} alterações`;
}

/** Mensagem de um erro para a tela (sem detalhes técnicos). */
function mensagemDe(erro, padrao) {
  if (erro instanceof ErroNuvem || erro instanceof ErroValidacao) return erro.message;
  console.error(erro);
  return padrao;
}

/**
 * Liga a seção da nuvem.
 *
 * @param {object} opcoes Ver o comentário do topo.
 * @returns {object} { carregar, renderizar, aoAbrirConfigurar, agendar, sincronizar,
 *   dadosTrocados, conectado, zerarNaNuvem }
 */
export function iniciarNuvem({
  obterDados, podeSincronizar, aplicarDaNuvem, substituirPelaNuvem, restaurarBackup, backupFeito,
  lerGuardado, gravarGuardado,
}) {
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
    backups: elemento('nuvem-backups'),
    backupSituacao: elemento('nuvem-backup-situacao'),
    backupEnviar: elemento('nuvem-backup-enviar'),
    backupErro: elemento('nuvem-backup-erro'),
    backupLista: elemento('nuvem-backup-lista'),
  };

  /**
   * O registro "nuvem" do aparelho. Além da conta e da sincronização, guarda
   * a data do último backup na nuvem e o tamanho máximo que o servidor aceita.
   */
  let guardado = {
    endereco: ENDERECO_PADRAO, email: '', sessao: null, sincronizacao: null,
    ultimoBackupNuvemEm: null, tamanhoMaximoBackup: TAMANHO_MAXIMO_PADRAO,
  };
  /** Sincronização em andamento (para nunca rodar duas ao mesmo tempo). */
  let emAndamento = null;
  /** Pedir outra sincronização assim que a atual terminar. */
  let deNovo = false;
  /** Enquanto os dados vindos do servidor são aplicados, alterações não agendam envio. */
  let aplicando = false;
  let temporizador = null;
  /** Último problema da sincronização, para mostrar na tela: { tipo, mensagem } ou null. */
  let problema = null;
  /** Lista de backups da nuvem (null = ainda não carregada nesta sessão). */
  let listaDeBackups = null;
  /** Operação de backup em andamento (enviar, restaurar, apagar, carregar). */
  let backupOcupado = false;

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

  /* ---------------------------------------------------------------- */
  /* Tela                                                             */
  /* ---------------------------------------------------------------- */

  function renderizarBackups() {
    el.backups.hidden = !conectado();
    if (!conectado()) return;

    const situacao = situacaoDoBackupNuvem(guardado.ultimoBackupNuvemEm);
    el.backupSituacao.textContent = situacao.atrasado
      ? `${situacao.texto} O app tenta enviar um sozinho a cada ${DIAS_PARA_BACKUP_NUVEM} dias: confira a conexão ou toque em "Enviar backup agora".`
      : situacao.texto;
    el.backupSituacao.classList.toggle('atrasado', situacao.atrasado);
    el.backupEnviar.disabled = backupOcupado || !podeSincronizar();

    if (listaDeBackups === null) {
      el.backupLista.replaceChildren();
      return;
    }
    if (listaDeBackups.length === 0) {
      const vazio = document.createElement('li');
      vazio.className = 'secundario lista-vazia';
      vazio.textContent = 'Nenhum backup guardado na nuvem.';
      el.backupLista.replaceChildren(vazio);
      return;
    }
    el.backupLista.replaceChildren(...listaDeBackups.map((backup) => {
      const { quando, conteudo, tamanho } = descreverBackup(backup);
      const item = document.createElement('li');
      item.className = 'item-backup';
      const texto = document.createElement('div');
      const titulo = document.createElement('strong');
      titulo.textContent = quando;
      const linha = document.createElement('span');
      linha.className = 'secundario';
      linha.textContent = `${conteudo} · ${tamanho}`;
      texto.append(titulo, linha);
      const acoes = document.createElement('div');
      acoes.className = 'acoes-ia';
      const botaoApagar = document.createElement('button');
      botaoApagar.type = 'button';
      botaoApagar.className = 'botao-pequeno perigo';
      botaoApagar.textContent = 'Apagar';
      botaoApagar.disabled = backupOcupado;
      botaoApagar.addEventListener('click', () => apagarBackup(backup));
      const botaoRestaurar = document.createElement('button');
      botaoRestaurar.type = 'button';
      botaoRestaurar.className = 'botao-pequeno';
      botaoRestaurar.textContent = 'Restaurar';
      botaoRestaurar.disabled = backupOcupado;
      botaoRestaurar.addEventListener('click', () => restaurarBackupDaNuvem(backup));
      acoes.append(botaoApagar, botaoRestaurar);
      item.append(texto, acoes);
      return item;
    }));
  }

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
    renderizarBackups();
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

  /* ---------------------------------------------------------------- */
  /* Sincronização                                                    */
  /* ---------------------------------------------------------------- */

  /** Troca TODOS os dados (sem agendar envio enquanto troca). */
  async function substituirSemEnviar(dados) {
    aplicando = true;
    try {
      await substituirPelaNuvem(dados);
    } finally {
      aplicando = false;
    }
  }

  /** Envia o que está pendente e junta a resposta (o caminho normal). */
  async function enviarEJuntar(api, estado) {
    const pedido = montarPedido(obterDados(), estado);
    const resposta = await api.sincronizar(pedido);
    if (resposta.zerados) {
      await contaFoiZerada(api, resposta.zeradosEm);
      return;
    }
    // Os dados podem ter mudado durante o pedido: junta sobre os de agora.
    const juncao = aplicarResposta(obterDados(), estado, pedido, resposta);
    if (juncao.mudou) {
      aplicando = true;
      try {
        await aplicarDaNuvem(juncao.dados);
      } finally {
        aplicando = false;
      }
    }
    await guardar({ ...guardado, sincronizacao: juncao.estado });
  }

  /**
   * Primeira sincronização deste aparelho: se a conta já tem dados no
   * servidor, pergunta se é para usá-los aqui (trocando os daqui) ou juntar.
   *
   * @returns {Promise<boolean>} true se os dados do servidor foram adotados.
   */
  async function primeiraVez(api, estado) {
    const tudo = await api.sincronizar({ desde: null, listas: {}, configuracao: null, zeradosEm: estado.zeradosEm });
    if (!temDadosNoServidor(tudo)) return false;

    const usarDaNuvem = window.confirm(
      'Esta conta já tem dados no servidor.\n\n'
      + 'OK: usar os dados do servidor neste aparelho (os dados daqui são substituídos).\n'
      + 'Cancelar: juntar os dados deste aparelho com os do servidor.',
    );
    if (!usarDaNuvem) return false;

    const dados = dadosDoServidor(tudo);
    if (!dados) return false; // servidor sem o mínimo (mês e formas de pagamento): junta
    await substituirSemEnviar(dados);
    await guardar({ ...guardado, sincronizacao: estadoDepoisDeAdotar(dados, tudo) });
    // O app pode ter criado o mês atual ao adotar os dados: envia na sequência.
    agendar(500);
    return true;
  }

  /**
   * A conta foi zerada em outro aparelho (apagar tudo ou restaurar backup)
   * depois da última sincronização deste. Nada daqui foi gravado: a pessoa
   * escolhe se usa os dados da conta ou se envia os deste aparelho.
   */
  async function contaFoiZerada(api, zeradosEm) {
    const usarDaConta = window.confirm(
      `Os dados da sua conta foram apagados ou substituídos por um backup em outro aparelho (${dataHoraDe(zeradosEm)}).\n\n`
      + 'OK: usar os dados da conta neste aparelho (os daqui são substituídos).\n'
      + 'Cancelar: enviar os dados deste aparelho para a conta, juntando com o que estiver lá.',
    );

    if (!usarDaConta) {
      await enviarEJuntar(api, estadoDepoisDeZerar(zeradosEm));
      return;
    }

    const tudo = await api.sincronizar({ desde: null, listas: {}, configuracao: null, zeradosEm });
    const daConta = dadosDoServidor(tudo);
    if (daConta) {
      await substituirSemEnviar(daConta);
      await guardar({ ...guardado, sincronizacao: estadoDepoisDeAdotar(daConta, tudo) });
    } else {
      // A conta ainda está vazia: começa do zero aqui também (e envia na sequência).
      await substituirSemEnviar(criarDadosIniciais(hojeLocal()));
      await guardar({ ...guardado, sincronizacao: { ...estadoDepoisDeZerar(tudo.zeradosEm ?? zeradosEm), cursor: tudo.cursor ?? null } });
    }
    agendar(500);
  }

  async function executar() {
    const api = cliente();
    const estado = guardado.sincronizacao ?? estadoInicial();
    if (estado.cursor === null && await primeiraVez(api, estado)) return;
    await enviarEJuntar(api, estado);
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
    if (problema === null) await backupAutomatico();
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

  /* ---------------------------------------------------------------- */
  /* Backups na nuvem                                                 */
  /* ---------------------------------------------------------------- */

  /** Lê a lista de backups do servidor (e o tamanho máximo aceito). */
  async function carregarBackups(api = cliente()) {
    const lista = await api.listarBackups();
    listaDeBackups = lista.backups ?? [];
    await guardar({
      ...guardado,
      ultimoBackupNuvemEm: ultimoBackupDaLista(listaDeBackups),
      tamanhoMaximoBackup: lista.tamanhoMaximoBytes ?? guardado.tamanhoMaximoBackup ?? TAMANHO_MAXIMO_PADRAO,
    });
  }

  /** Monta e envia um backup dos dados de agora. */
  async function enviarBackup(api = cliente()) {
    const agora = new Date();
    const comData = registrarBackup(obterDados(), { agora });
    const { texto } = prepararBackupNuvem(comData, {
      agora, tamanhoMaximo: guardado.tamanhoMaximoBackup ?? TAMANHO_MAXIMO_PADRAO,
    });
    const resumo = await api.enviarBackup(texto);
    await guardar({ ...guardado, ultimoBackupNuvemEm: resumo.criadoEm });
    listaDeBackups = null;
    await backupFeito(agora);
  }

  /**
   * Depois de sincronizar: se o último backup da nuvem tem 7 dias ou mais,
   * confere a lista (outro aparelho pode ter enviado) e envia um.
   * Uma falha aqui não atrapalha a sincronização: só aparece na seção.
   */
  async function backupAutomatico() {
    if (backupOcupado || !conectado() || !podeSincronizar()) return;
    if (!precisaDeBackupAutomatico(guardado.ultimoBackupNuvemEm)) return;
    backupOcupado = true;
    try {
      const api = cliente();
      await carregarBackups(api);
      if (precisaDeBackupAutomatico(guardado.ultimoBackupNuvemEm)) await enviarBackup(api);
      el.backupErro.textContent = '';
    } catch (erro) {
      el.backupErro.textContent = `Backup automático não enviado: ${mensagemDe(erro, 'tente "Enviar backup agora".')}`;
    } finally {
      backupOcupado = false;
      renderizar();
    }
  }

  /** Roda uma operação de backup mostrando "ocupado" e o erro, se houver. */
  async function operacaoDeBackup(operacao) {
    if (backupOcupado) return;
    backupOcupado = true;
    el.backupErro.textContent = '';
    renderizar();
    try {
      await operacao();
    } catch (erro) {
      el.backupErro.textContent = mensagemDe(erro, 'Não foi possível concluir agora. Tente de novo.');
    } finally {
      backupOcupado = false;
      renderizar();
    }
  }

  async function restaurarBackupDaNuvem(backup) {
    const { quando, conteudo } = descreverBackup(backup);
    const confirmou = window.confirm(
      `Restaurar o backup de ${quando} (${conteudo})?\n\n`
      + 'Os dados deste aparelho E da sua conta na nuvem serão substituídos por ele. '
      + 'Os outros aparelhos vão perguntar se usam os dados novos.',
    );
    if (!confirmou) return;

    await operacaoDeBackup(async () => {
      const api = cliente();
      // Lê e confere ANTES de apagar qualquer coisa: um backup ilegível não estraga nada.
      const { dados } = lerBackup(await api.baixarBackup(backup.id));
      await restaurarBackup(dados, async () => {
        await zerarNaNuvem(api);
      });
      listaDeBackups = null;
      await carregarBackups(api);
    });
  }

  async function apagarBackup(backup) {
    const { quando } = descreverBackup(backup);
    if (!window.confirm(`Apagar da nuvem o backup de ${quando}?`)) return;
    await operacaoDeBackup(async () => {
      const api = cliente();
      await api.apagarBackup(backup.id);
      await carregarBackups(api);
    });
  }

  /**
   * Apaga os dados da conta no servidor ("Apagar tudo" ou restaurar backup).
   * A sincronização deste aparelho recomeça do zero, já sabendo do "zerado".
   * Lança ErroNuvem se não conseguir (ex.: sem internet).
   */
  async function zerarNaNuvem(api = cliente()) {
    const { zeradosEm } = await api.zerarDados();
    await guardar({ ...guardado, sincronizacao: estadoDepoisDeZerar(zeradosEm) });
  }

  /* ---------------------------------------------------------------- */
  /* Botões                                                           */
  /* ---------------------------------------------------------------- */

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
      // Outra conta ou outro servidor: a sincronização e os backups começam do zero.
      const mesmaConta = guardado.endereco === endereco && guardado.email === email;
      await guardar({
        ...guardado,
        endereco,
        email,
        sessao: null,
        sincronizacao: mesmaConta ? guardado.sincronizacao : null,
        ultimoBackupNuvemEm: mesmaConta ? guardado.ultimoBackupNuvemEm : null,
      });
      listaDeBackups = null;
      await cliente().entrar(email, senha);
      el.senha.value = '';
      problema = null;
      await sincronizar();
      await operacaoDeBackup(() => carregarBackups());
    } catch (erro) {
      el.erro.textContent = mensagemDe(erro, 'Não foi possível entrar agora.');
    } finally {
      el.entrar.disabled = false;
      renderizar();
    }
  });

  el.sincronizarAgora.addEventListener('click', () => { sincronizar(); });

  el.backupEnviar.addEventListener('click', () => operacaoDeBackup(async () => {
    const api = cliente();
    await enviarBackup(api);
    await carregarBackups(api);
  }));

  el.sair.addEventListener('click', async () => {
    const quantos = obterDados() ? pendentes(obterDados(), guardado.sincronizacao ?? estadoInicial()).total : 0;
    const aviso = quantos > 0
      ? `Há ${alteracoes(quantos)} ainda não enviadas. Sair mesmo assim? Os dados continuam neste aparelho.`
      : 'Sair da conta neste aparelho? Os dados continuam aqui.';
    if (!window.confirm(aviso)) return;
    await cliente().sair();
    await guardar({ ...guardado, sessao: null, sincronizacao: null, ultimoBackupNuvemEm: null });
    listaDeBackups = null;
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
    /** Configurar foi aberta: redesenha e busca a lista de backups (uma vez por sessão). */
    aoAbrirConfigurar() {
      renderizar();
      if (conectado() && listaDeBackups === null && !backupOcupado) {
        operacaoDeBackup(() => carregarBackups());
      }
    },
    agendar,
    sincronizar,
    /**
     * Os dados do aparelho foram trocados de uma vez (exemplo, apagar tudo
     * sem a nuvem, importar backup só aqui): a sincronização recomeça do
     * zero, como num aparelho novo.
     */
    dadosTrocados() {
      if (!guardado.sincronizacao) return;
      guardar({ ...guardado, sincronizacao: null });
      renderizar();
    },
    /** A conta da nuvem está conectada neste aparelho? */
    conectado,
    /** Apaga os dados da conta no servidor (lança ErroNuvem se não conseguir). */
    zerarNaNuvem: () => zerarNaNuvem(),
  };
}
