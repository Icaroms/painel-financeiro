/**
 * Seção "Análise com IA" da aba Mês (Fase 03, parte 3.3).
 *
 * O botão "Analisar o mês com IA" envia os números do mês (src/analise.js)
 * para o Gemini (src/ia.js) e mostra a resposta formatada: títulos,
 * parágrafos e listas, montados elemento por elemento, como TEXTO (nunca
 * HTML vindo da IA). O botão "Copiar" copia a resposta em texto limpo.
 *
 * A seção só aparece com a IA disponível (chave salva e ligada).
 */

import { hojeLocal } from '../datas.js';
import { chamarGemini, iaDisponivel } from '../ia.js';
import { mensagemDoMes, blocosDaResposta, textoParaCopiar } from '../analise.js';

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
 * @returns {{ renderizar: () => void }}
 */
export function iniciarAnaliseMes({ obterDados, obterConfigIA }) {
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

  el.pedir.addEventListener('click', async () => {
    el.pedir.disabled = true;
    mostrarAviso('Analisando o mês…', 'carregando');

    const resultado = await chamarGemini(obterConfigIA(), mensagemDoMes(obterDados(), hojeLocal()));

    el.pedir.disabled = false;
    el.pedir.textContent = 'Analisar de novo';
    if (!resultado.ok) {
      mostrarAviso(resultado.erro, 'erro');
      return;
    }

    const blocos = blocosDaResposta(resultado.texto);
    textoAtual = textoParaCopiar(blocos);
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.resposta.dataset.estado = 'ok';
    el.resposta.replaceChildren(
      ...elementosDosBlocos(blocos),
      criar('p', { classe: 'ia-selo', texto: `Texto gerado por IA às ${hora}, com os números daquele momento. Confira no app.` }),
    );
    el.copiar.hidden = false;
    el.copiar.textContent = 'Copiar';
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

  /** Mostra ou esconde a seção conforme a IA. Ao abrir a aba, começa sem resposta antiga. */
  function renderizar() {
    el.secao.hidden = !iaDisponivel(obterConfigIA());
    el.resposta.hidden = true;
    el.resposta.replaceChildren();
    el.copiar.hidden = true;
    el.pedir.disabled = false;
    el.pedir.textContent = 'Analisar o mês com IA';
    textoAtual = '';
  }

  return { renderizar };
}
