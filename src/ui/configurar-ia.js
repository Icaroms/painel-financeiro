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
 * Quem usa este módulo (src/ui/app.js) entrega:
 * - obterConfigIA(): a configuração atual;
 * - salvarConfigIA(config | null): grava (null apaga) e devolve true se gravou.
 */

import { ErroValidacao } from '../erros.js';
import {
  MODELOS,
  criarConfiguracaoIA,
  mascararChave,
  nomeDoModelo,
  testarConexao,
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
  };

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

    el.situacao.replaceChildren();
    if (temChave) {
      const forte = document.createElement('strong');
      forte.textContent = mascararChave(config.chave);
      el.situacao.append(
        'Chave salva: ', forte,
        ` · ${nomeDoModelo(config.modelo).split(' (')[0]} · ${config.ligada ? 'ligada' : 'desligada'}`,
      );
    } else {
      el.situacao.textContent = 'Nenhuma chave cadastrada: os botões da IA ficam escondidos.';
    }

    el.chave.value = '';
    el.chave.placeholder = temChave ? 'Deixe vazio para manter a chave salva' : 'Cole aqui a chave';
    el.modelo.value = config.modelo;
    el.ligada.checked = temChave ? config.ligada : true;
    el.apagar.hidden = !temChave;
    mostrarErro('');
  }

  /** Configuração a partir do formulário (a chave digitada ou a salva). */
  function configDoFormulario() {
    return criarConfiguracaoIA({
      chave: el.chave.value.trim() || obterConfigIA().chave,
      modelo: el.modelo.value,
      ligada: el.ligada.checked,
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
    mostrarTeste('Testando a conexão com o Gemini…');
    const resultado = await testarConexao(config);
    el.testar.disabled = false;
    // O teste não grava nada: se a chave foi digitada agora, ainda falta Salvar.
    const lembrete = resultado.ok && el.chave.value.trim() !== '' ? ' Agora clique em Salvar.' : '';
    mostrarTeste(`${resultado.mensagem}${lembrete}`, resultado.ok ? 'verde' : 'vermelho');
  });

  el.apagar.addEventListener('click', async () => {
    if (!window.confirm('Apagar a chave do Gemini deste aparelho?\n\nOs botões da IA somem até você cadastrar outra.')) return;
    const gravou = await salvarConfigIA(null);
    renderizar();
    mostrarTeste(gravou ? 'Chave apagada deste aparelho.' : 'Não foi possível apagar neste aparelho.',
      gravou ? 'verde' : 'vermelho');
  });

  return { renderizar };
}
