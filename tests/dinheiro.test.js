/**
 * Testes de conversão e formatação de dinheiro.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reaisParaCentavos, formatarCentavos } from '../src/dinheiro.js';

describe('reaisParaCentavos', () => {
  it('converte valores com vírgula', () => {
    assert.equal(reaisParaCentavos('118,51'), 11851);
    assert.equal(reaisParaCentavos('0,99'), 99);
  });

  it('converte valores sem centavos', () => {
    assert.equal(reaisParaCentavos('16'), 1600);
    assert.equal(reaisParaCentavos('0'), 0);
  });

  it('entende um único dígito de centavos como dezenas', () => {
    assert.equal(reaisParaCentavos('34,9'), 3490);
  });

  it('aceita ponto como separador de milhar', () => {
    assert.equal(reaisParaCentavos('1.234,56'), 123456);
    assert.equal(reaisParaCentavos('1.000.000'), 100000000);
  });

  it('aceita "R$" na frente e espaços nas pontas', () => {
    assert.equal(reaisParaCentavos('R$ 34,90'), 3490);
    assert.equal(reaisParaCentavos('  12,00  '), 1200);
  });

  it('é exato onde o cálculo com decimais erraria', () => {
    // 0.1 + 0.2 no JavaScript dá 0.30000000000000004.
    // Em centavos: 10 + 20 = 30, exato.
    assert.equal(reaisParaCentavos('0,10') + reaisParaCentavos('0,20'), 30);
  });

  it('rejeita formatos inválidos com erro no campo "valor"', () => {
    const invalidos = ['', 'abc', '12,345', '1.23,00', '-5,00', '12.50', '1,2,3'];
    for (const texto of invalidos) {
      assert.throws(
        () => reaisParaCentavos(texto),
        { name: 'ErroValidacao', campo: 'valor' },
        `deveria rejeitar "${texto}"`,
      );
    }
  });

  it('rejeita valores que não são texto', () => {
    assert.throws(() => reaisParaCentavos(118.51), { name: 'ErroValidacao', campo: 'valor' });
  });
});

describe('formatarCentavos', () => {
  // O Intl usa o espaço não separável (\u00a0) entre "R$" e o número.
  it('formata no padrão brasileiro', () => {
    assert.equal(formatarCentavos(11851), 'R$\u00a0118,51');
    assert.equal(formatarCentavos(123456), 'R$\u00a01.234,56');
    assert.equal(formatarCentavos(0), 'R$\u00a00,00');
  });

  it('formata valores negativos (saldo projetado)', () => {
    assert.equal(formatarCentavos(-3200), '-R$\u00a032,00');
  });

  it('rejeita valores que não são inteiros', () => {
    assert.throws(() => formatarCentavos(118.51), { name: 'ErroValidacao', campo: 'centavos' });
  });
});
