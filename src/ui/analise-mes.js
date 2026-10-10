/**
 * Seção "Análise com IA" da aba Mês (Fase 03, parte 3.3).
 *
 * O botão "Analisar o mês com IA" envia os números do mês (src/analise.js)
 * para o Gemini (src/ia.js) e mostra a resposta formatada: títulos,
 * parágrafos e listas, montados elemento por elemento, como TEXTO (nunca
 * HTML vindo da IA). O botão "Copiar" copia a resposta em texto limpo.
 *
 * A seção só aparece com a IA disponível (chave salva e ligada).
 *
 * A última análise do mês fica guardada no aparelho (fora do backup) e
 * volta a aparecer ao abrir a aba, com a hora em que foi feita. Assim,
 * abrir a aba não gasta a cota do Gemini; "Analisar de novo" pede outra.
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { chamarGemini, iaDisponivel } from '../ia.js';
import {
  mensagemDoMes, blocosDaResposta, textoParaCopiar, criarAnaliseGuardada, analiseDoMes, quandoFoiFeita,
} from '../analise.js';

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** Cria um elemento com classe e texto opcionais. */
function criar(tag, { classe, texto } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  return novo;
}

/** Trechos (negrito ou não) dentro de um elemento: <strong> só onde a IA marcou. */
function preencher(destino, trechos) {
  for (const trecho of trechos) {
    destino.append(trecho.negrito ? criar('strong', { texto: trecho.texto }) : trecho.texto);
  }
  return destino;
}

/** Converte os blocos da resposta em elementos da página. */
function elementosDosBlocos(blocos) {
  return blocos.map((bloco) => {
    if (bloco.tipo === 'titulo') return preencher(criar('h3'), bloco.trechos);
    if (bloco.tipo === 'lista') {
      const lista = criar('ul');
      for (const item of bloco.itens) lista.append(preencher(criar('li'), item));
      return lista;
    }
    return preencher(criar('p'), bloco.trechos);
  });
}

/**
 * Liga a seção da análise.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {() => object} opcoes.obterConfigIA
 * @param {() => object|null} [opcoes.obterUltimaAnalise] A análise guardada no aparelho.
 * @param {(analise: object) => Promise<void>} [opcoes.guardarAnalise] Guarda a análise nova.
 * @returns {{ renderizar: () => void }}
 */
export function iniciarAnaliseMes({
  obterDados, obterConfigIA, obterUltimaAnalise = () => null, guardarAnalise = async () => {},
}) {
  const el = {
    secao: elemento('secao-analise'),
    pedir: elemento('analise-pedir'),
    copiar: elemento('analise-copiar'),
    resposta: elemento('analise-resposta'),
  };

  /** Texto da última análise, para o botão Copiar. */
  let textoAtual = '';

  /** Mostra uma mensagem simples (carregando ou erro) no lugar da resposta. */
  function mostrarAviso(texto, estado) {
    el.resposta.hidden = false;
    el.resposta.dataset.estado = estado;
    el.resposta.replaceChildren(criar('p', { texto }));
    el.copiar.hidden = true;
    textoAtual = '';
  }

  /** Mostra uma análise (nova ou guardada), com a hora em que foi feita. */
  function mostrarAnalise(analise) {
    const blocos = blocosDaResposta(analise.texto);
    textoAtual = textoParaCopiar(blocos);
    el.resposta.hidden = false;
    el.resposta.dataset.estado = 'ok';
    el.resposta.replaceChildren(
      ...elementosDosBlocos(blocos),
      criar('p', {
        classe: 'ia-selo',
        texto: `Texto gerado por IA ${quandoFoiFeita(analise.geradaEm)}, com os números daquele momento. Confira no app.`,
      }),
    );
    el.copiar.hidden = false;
    el.copiar.textContent = 'Copiar';
    el.pedir.textContent = 'Analisar de novo';
  }

  el.pedir.addEventListener('click', async () => {
    el.pedir.disabled = true;
    mostrarAviso('Analisando o mês…', 'carregando');

    const hoje = hojeLocal();
    const resultado = await chamarGemini(obterConfigIA(), mensagemDoMes(obterDados(), hoje));

    el.pedir.disabled = false;
    if (!resultado.ok) {
      el.pedir.textContent = 'Analisar de novo';
      mostrarAviso(resultado.erro, 'erro');
      return;
    }

    const analise = criarAnaliseGuardada(mesDaData(hoje), resultado.texto);
    mostrarAnalise(analise);
    await guardarAnalise(analise);
  });

  el.copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textoAtual);
      el.copiar.textContent = 'Copiado';
    } catch {
      // Alguns navegadores bloqueiam a área de transferência: a pessoa ainda pode selecionar o texto.
      el.copiar.textContent = 'Não deu para copiar: selecione o texto';
    }
  });

  /**
   * Mostra ou esconde a seção conforme a IA. Se houver uma análise guardada
   * DESTE mês, ela volta a aparecer; a de um mês anterior não vale mais.
   */
  function renderizar() {
    el.secao.hidden = !iaDisponivel(obterConfigIA());
    el.pedir.disabled = false;
    el.copiar.hidden = true;
    textoAtual = '';

    const guardada = analiseDoMes(obterUltimaAnalise(), mesDaData(hojeLocal()));
    if (guardada) {
      mostrarAnalise(guardada);
    } else {
      el.resposta.hidden = true;
      el.resposta.replaceChildren();
      el.pedir.textContent = 'Analisar o mês com IA';
    }
  }

  return { renderizar };
}
