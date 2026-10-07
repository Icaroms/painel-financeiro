/**
 * Testes da geometria do mostrador.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { geometriaMostrador, pontoNoArco, marcasDaEscala, COMPRIMENTO_ARCO } from '../src/mostrador.js';

describe('pontoNoArco', () => {
  it('fração 0 fica na ponta esquerda, 0,5 no topo e 1 na ponta direita', () => {
    assert.deepEqual(pontoNoArco(0, 120), { x: 30, y: 150 });
    assert.deepEqual(pontoNoArco(0.5, 120), { x: 150, y: 30 });
    assert.deepEqual(pontoNoArco(1, 120), { x: 270, y: 150 });
  });
});

describe('marcasDaEscala', () => {
  it('tem cinco marcas, de 0% a 100%', () => {
    const marcas = marcasDaEscala();
    assert.equal(marcas.length, 5);
    assert.deepEqual(marcas[0], { x1: 18, y1: 150, x2: 8, y2: 150 });
  });
});

describe('geometriaMostrador', () => {
  it('orçamento vazio: ponteiro na esquerda e arco sem preenchimento', () => {
    const g = geometriaMostrador({ fracaoUsada: 0, fracaoDoMes: 0.5 });
    assert.equal(g.pontaX, 54);
    assert.equal(g.pontaY, 150);
    assert.equal(g.traco, `0 ${Math.round(COMPRIMENTO_ARCO * 10) / 10}`);
  });

  it('metade usada: ponteiro no topo', () => {
    const g = geometriaMostrador({ fracaoUsada: 0.5, fracaoDoMes: 0.5 });
    assert.equal(g.pontaX, 150);
    assert.equal(g.pontaY, 54);
    assert.equal(g.grausPonteiro, 90);
  });

  it('acima de 100%: o ponteiro para no fim da escala', () => {
    const acima = geometriaMostrador({ fracaoUsada: 1.4, fracaoDoMes: 0.9 });
    const cheio = geometriaMostrador({ fracaoUsada: 1, fracaoDoMes: 0.9 });
    assert.equal(acima.pontaX, cheio.pontaX);
    assert.equal(acima.grausPonteiro, 180);
    assert.equal(acima.traco, cheio.traco);
  });

  it('o triângulo "hoje" acompanha a fração do mês', () => {
    const g = geometriaMostrador({ fracaoUsada: 0, fracaoDoMes: 0.5 });
    // O bico do triângulo fica no topo, logo abaixo do arco.
    assert.ok(g.triangulo.startsWith('150,46 '));
  });
});
