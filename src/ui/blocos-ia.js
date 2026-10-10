/**
 * Desenho da resposta da IA em blocos (títulos, parágrafos e listas),
 * usado pela análise do mês (aba Mês) e pelo comentário do Radar (aba Investir).
 *
 * Os blocos vêm de blocosDaResposta() (src/analise.js, testado no Node).
 * Tudo entra como TEXTO (textContent): nada da resposta vira HTML.
 */

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

/**
 * Converte os blocos da resposta em elementos da página.
 *
 * @param {object[]} blocos Resultado de blocosDaResposta().
 * @returns {HTMLElement[]}
 */
export function elementosDosBlocos(blocos) {
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
