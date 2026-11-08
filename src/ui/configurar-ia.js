/**
 * Seção "IA (Gemini)" da vista Configurar (Fase 03, parte 3.1).
 *
 * A pessoa cola a chave do Google AI Studio, escolhe o modelo, liga ou
 * desliga a IA e pode testar a conexão. A chave fica só no aparelho
 * (src/ui/banco.js, fora do backup) e nunca é mostrada inteira de novo.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. A validação, o
 * pedido e a leitura da resposta ficam em src/ia.js (testado no Node).
 *
 * Fase 05, parte 5.5: a pessoa escolhe de onde vem a IA. Com "Servidor da
 * conta", não precisa de chave no aparelho: a tela mostra se o servidor
 * tem a IA ligada e quantos pedidos a conta já usou hoje.
 *
 * Quem usa este módulo (src/ui/app.js) entrega:
 * - obterConfigIA(): a configuração atual (com a IA do servidor em "servidor");
 * - salvarConfigIA(config | null): grava (null apaga) e devolve true se gravou.
 */

import { ErroValidacao } from '../erros.js';
import {
  MODELOS,
  ORIGENS,
  criarConfiguracaoIA,
  mascararChave,
  nomeDoModelo,
  testarConexao,
  textoDaSituacaoDoServidor,
  usaServidor,
} from '../ia.js';

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/**
 * Liga a seção da IA.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterConfigIA
 * @param {(config: object|null) => Promise<boolean>} opcoes.salvarConfigIA
 * @returns {{ renderizar: () => void }}
 */
export function iniciarConfigIA({ obterConfigIA, salvarConfigIA }) {
  const el = {
    situacao: elemento('ia-situacao'),
    form: elemento('form-ia'),
    chave: elemento('ia-chave'),
    modelo: elemento('ia-modelo'),
    ligada: elemento('ia-ligada'),
    erro: elemento('ia-erro'),
    apagar: elemento('ia-apagar'),
    testar: elemento('ia-testar'),
    teste: elemento('ia-teste'),
    origens: [...elemento('form-ia').querySelectorAll('input[name="ia-origem"]')],
    camposChave: elemento('ia-campos-chave'),
    servidor: elemento('ia-servidor'),
  };

  /** Origem marcada no formulário. */
  const origemMarcada = () => el.origens.find((r) => r.checked)?.value ?? ORIGENS.APARELHO;

  /** Pedido de situação em andamento: uma resposta antiga não sobrescreve a nova. */
  let consulta = 0;

  /** Mostra os campos da origem marcada e, no servidor, a situação da conta. */
  async function mostrarOrigem() {
    const servidor = origemMarcada() === ORIGENS.SERVIDOR;
    el.camposChave.hidden = servidor;
    el.servidor.hidden = !servidor;
    const rotulo = el.ligada.nextElementSibling;
    rotulo.querySelector('strong').textContent = servidor ? 'Usar a IA do servidor' : 'Usar a IA neste aparelho';
    rotulo.querySelector('.secundario').textContent = servidor
      ? ' — desmarque para esconder os botões da IA.'
      : ' — desmarque para esconder os botões da IA sem apagar a chave.';
    if (!servidor) return;
    const minha = ++consulta;
    el.servidor.textContent = 'Consultando o servidor…';
    delete el.servidor.dataset.cor;
    const situacao = await obterConfigIA().servidor.situacao();
    if (minha !== consulta) return;
    const { texto, ok } = textoDaSituacaoDoServidor(situacao);
    el.servidor.textContent = texto;
    el.servidor.dataset.cor = ok ? 'verde' : 'vermelho';
  }

  el.origens.forEach((r) => r.addEventListener('change', () => {
    mostrarErro('');
    mostrarTeste('');
    mostrarOrigem();
  }));

  // Lista de modelos (fixa: vem de src/ia.js).
  el.modelo.replaceChildren(...MODELOS.map((m) => {
    const opcao = document.createElement('option');
    opcao.value = m.id;
    opcao.textContent = m.nome;
    return opcao;
  }));

  /** Mostra o resultado do teste (ou limpa, sem cor). */
  function mostrarTeste(texto, cor = '') {
    el.teste.textContent = texto;
    if (cor) el.teste.dataset.cor = cor;
    else delete el.teste.dataset.cor;
  }

  function mostrarErro(mensagem) {
    el.erro.textContent = mensagem;
    el.chave.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
  }

  /**
   * Redesenha a seção. O campo da chave fica SEMPRE vazio: a chave salva
   * aparece só mascarada ("AIzaSy…9k2Q"). Salvar com o campo vazio mantém
   * a chave salva (para trocar só o modelo ou o liga/desliga).
   */
  function renderizar() {
    const config = obterConfigIA();
    const temChave = Boolean(config.chave);
    const servidor = usaServidor(config);
    const modelo = nomeDoModelo(config.modelo).split(' (')[0];

    el.situacao.replaceChildren();
    if (servidor) {
      el.situacao.textContent = `IA do servidor da conta · ${modelo} · ${config.ligada ? 'ligada' : 'desligada'}`;
    } else if (temChave) {
      const forte = document.createElement('strong');
      forte.textContent = mascararChave(config.chave);
      el.situacao.append(
        'Chave salva: ', forte,
        ` · ${modelo} · ${config.ligada ? 'ligada' : 'desligada'}`,
      );
    } else {
      el.situacao.textContent = 'IA não configurada: os botões da IA ficam escondidos.';
    }

    el.origens.forEach((r) => { r.checked = r.value === (config.origem ?? ORIGENS.APARELHO); });

    el.chave.value = '';
    el.chave.placeholder = temChave ? 'Deixe vazio para manter a chave salva' : 'Cole aqui a chave';
    el.modelo.value = config.modelo;
    el.ligada.checked = temChave || servidor ? config.ligada : true;
    el.apagar.hidden = !temChave;
    mostrarErro('');
    mostrarOrigem();
  }

  /** Configuração a partir do formulário (a chave digitada ou a salva). */
  function configDoFormulario() {
    return criarConfiguracaoIA({
      chave: el.chave.value.trim() || obterConfigIA().chave,
      modelo: el.modelo.value,
      ligada: el.ligada.checked,
      origem: origemMarcada(),
    });
  }

  el.form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErro('');
    let config;
    try {
      config = configDoFormulario();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(falha.message);
      return;
    }
    const gravou = await salvarConfigIA(config);
    renderizar();
    mostrarTeste(gravou ? 'Configuração da IA salva neste aparelho.' : 'Não foi possível gravar neste aparelho.',
      gravou ? 'verde' : 'vermelho');
  });

  el.testar.addEventListener('click', async () => {
    mostrarErro('');
    let config;
    try {
      config = configDoFormulario();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(falha.message);
      return;
    }
    el.testar.disabled = true;
    mostrarTeste(usaServidor(config) ? 'Testando a IA pelo servidor…' : 'Testando a conexão com o Gemini…');
    // A IA do servidor não é gravada na configuração: vem de quem usa este módulo.
    const resultado = await testarConexao({ ...config, servidor: obterConfigIA().servidor });
    el.testar.disabled = false;
    if (usaServidor(config)) mostrarOrigem(); // o teste conta no limite do dia
    // O teste não grava nada: se a chave foi digitada agora, ainda falta Salvar.
    const mudou = el.chave.value.trim() !== '' || config.origem !== (obterConfigIA().origem ?? ORIGENS.APARELHO);
    const lembrete = resultado.ok && mudou ? ' Agora clique em Salvar.' : '';
    mostrarTeste(`${resultado.mensagem}${lembrete}`, resultado.ok ? 'verde' : 'vermelho');
  });

  el.apagar.addEventListener('click', async () => {
    const servidor = usaServidor(obterConfigIA());
    const aviso = servidor
      ? 'Apagar a chave do Gemini deste aparelho?\n\nA IA do servidor continua funcionando.'
      : 'Apagar a chave do Gemini deste aparelho?\n\nOs botões da IA somem até você cadastrar outra.';
    if (!window.confirm(aviso)) return;
    const gravou = await salvarConfigIA(servidor ? { ...semServidor(obterConfigIA()), chave: '' } : null);
    renderizar();
    mostrarTeste(gravou ? 'Chave apagada deste aparelho.' : 'Não foi possível apagar neste aparelho.',
      gravou ? 'verde' : 'vermelho');
  });

  return { renderizar };
}

/** A configuração gravada, sem a IA do servidor (que vem de fora e não é gravada). */
function semServidor({ servidor, ...gravada }) {
  return gravada;
}
