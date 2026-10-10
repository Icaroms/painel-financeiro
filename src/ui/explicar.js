/**
 * Botão "Explicar com IA" e a caixa da resposta (Fase 03, parte 3.2).
 *
 * Usado no veredito do Lançar e em cada ficha do simulador. O botão só
 * aparece quando a IA está disponível (chave salva e ligada em Configurar).
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA: a mensagem é montada
 * por src/explicacoes.js e enviada por src/ia.js (os dois testados no Node).
 * A resposta é mostrada como TEXTO (textContent), nunca como HTML.
 */

import { chamarGemini, iaDisponivel } from '../ia.js';

/** Cria um elemento com classe, texto e atributos opcionais. */
function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/**
 * Monta o bloco "Explicar com IA", ou null se a IA não está disponível.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterConfigIA   Configuração atual da IA.
 * @param {() => { instrucoes: string, conteudo: string }} opcoes.montarMensagem
 *   Chamada só no clique: monta a mensagem com os números daquele momento.
 * @param {string} [opcoes.rotulo] Texto do botão.
 * @returns {HTMLElement|null}
 */
export function blocoExplicar({ obterConfigIA, montarMensagem, rotulo = 'Explicar com IA' }) {
  if (!iaDisponivel(obterConfigIA())) return null;

  const bloco = criar('div', { classe: 'ia-bloco' });
  const botao = criar('button', { classe: 'botao-pequeno botao-ia', type: 'button', texto: rotulo });
  // aria-live: leitores de tela anunciam a resposta quando ela chega.
  const resposta = criar('div', { classe: 'ia-resposta', 'aria-live': 'polite', hidden: '' });

  botao.addEventListener('click', async () => {
    botao.disabled = true;
    resposta.hidden = false;
    resposta.dataset.estado = 'carregando';
    resposta.replaceChildren(criar('p', { texto: 'Pensando…' }));

    const resultado = await chamarGemini(obterConfigIA(), montarMensagem());

    botao.disabled = false;
    botao.textContent = 'Explicar de novo';
    if (resultado.ok) {
      resposta.dataset.estado = 'ok';
      resposta.replaceChildren(
        // Cada parágrafo da resposta vira um <p> (texto puro, sem HTML).
        ...resultado.texto.split(/\n\s*\n/).map((trecho) => criar('p', { texto: trecho.trim() })),
        criar('p', { classe: 'ia-selo', texto: 'Texto gerado por IA. Confira os números no app.' }),
      );
    } else {
      resposta.dataset.estado = 'erro';
      resposta.replaceChildren(criar('p', { texto: resultado.erro }));
    }
  });

  bloco.append(botao, resposta);
  return bloco;
}
