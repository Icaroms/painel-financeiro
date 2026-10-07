/**
 * Geometria do mostrador (o "marcador de combustível" da categoria).
 *
 * O mostrador é um semicírculo desenhado num SVG de 300 × 166:
 * centro em (150, 150), raio 120. A fração 0 fica na ponta esquerda,
 * 0,5 no topo e 1 na ponta direita.
 *
 * Tudo aqui são funções puras (só contas, sem tocar na tela), então
 * dá para testar no Node sem navegador.
 */

const CENTRO_X = 150;
const CENTRO_Y = 150;
const RAIO_ARCO = 120;
const RAIO_PONTEIRO = 96;

/** Comprimento do semicírculo: metade da circunferência (π × raio). */
export const COMPRIMENTO_ARCO = Math.PI * RAIO_ARCO;

/** Prende um número entre um mínimo e um máximo. */
function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

/** Arredonda para 1 casa decimal (suficiente para desenhar em pixels). */
function arredondar(valor) {
  return Math.round(valor * 10) / 10;
}

/**
 * Ponto sobre o semicírculo para uma fração de 0 a 1.
 * Fração 0 = ângulo de 180° (esquerda); fração 1 = 0° (direita).
 * O y é subtraído porque, no SVG, o eixo y cresce para baixo.
 *
 * @param {number} fracao
 * @param {number} raio
 * @returns {{ x: number, y: number }}
 */
export function pontoNoArco(fracao, raio) {
  const angulo = Math.PI * (1 - fracao);
  return {
    x: arredondar(CENTRO_X + raio * Math.cos(angulo)),
    y: arredondar(CENTRO_Y - raio * Math.sin(angulo)),
  };
}

/**
 * Marcas da escala em 0%, 25%, 50%, 75% e 100%: pequenos traços
 * do lado de fora do arco.
 *
 * @returns {{ x1: number, y1: number, x2: number, y2: number }[]}
 */
export function marcasDaEscala() {
  return [0, 0.25, 0.5, 0.75, 1].map((fracao) => {
    const dentro = pontoNoArco(fracao, 132);
    const fora = pontoNoArco(fracao, 142);
    return { x1: dentro.x, y1: dentro.y, x2: fora.x, y2: fora.y };
  });
}

/**
 * Calcula o que muda no mostrador a cada atualização.
 *
 * @param {object} medidas
 * @param {number} medidas.fracaoUsada Parte do orçamento usada (1 = 100%).
 *                                     Acima de 1 o ponteiro para no fim da escala.
 * @param {number} medidas.fracaoDoMes Parte do mês que já passou (dia ÷ dias do mês).
 * @returns {{ traco: string, grausPonteiro: number, pontaX: number, pontaY: number, triangulo: string }}
 *   - traco:         valor do stroke-dasharray do arco colorido (o "quanto encheu")
 *   - grausPonteiro: giro do ponteiro, de 0° (esquerda) a 180° (direita). A tela
 *                    gira o ponteiro com CSS, o que permite animar o movimento.
 *   - pontaX/Y:      onde fica a ponta do ponteiro depois do giro
 *   - triangulo:     pontos do marcador "hoje", no formato do atributo points
 */
export function geometriaMostrador({ fracaoUsada, fracaoDoMes }) {
  const usada = limitar(fracaoUsada, 0, 1);
  const mes = limitar(fracaoDoMes, 0, 1);

  const ponta = pontoNoArco(usada, RAIO_PONTEIRO);

  // Triângulo apontando para a escala, logo abaixo do arco.
  const bico = pontoNoArco(mes, 104);
  const esquerda = pontoNoArco(mes - 0.025, 90);
  const direita = pontoNoArco(mes + 0.025, 90);

  return {
    traco: `${arredondar(COMPRIMENTO_ARCO * usada)} ${arredondar(COMPRIMENTO_ARCO)}`,
    grausPonteiro: arredondar(180 * usada),
    pontaX: ponta.x,
    pontaY: ponta.y,
    triangulo: `${bico.x},${bico.y} ${esquerda.x},${esquerda.y} ${direita.x},${direita.y}`,
  };
}
