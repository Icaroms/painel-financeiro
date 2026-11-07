/**
 * Testes de conversão e formatação de dinheiro.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reaisParaCentavos, formatarCentavos, mascararDinheiro, DIGITOS_MAXIMOS } from '../src/dinheiro.js';

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

describe('mascararDinheiro (digitação como no banco)', () => {
  it('os dígitos entram pelos centavos: 9 → 0,09; 95 → 0,95; 9550 → 95,50', () => {
    assert.equal(mascararDinheiro('9'), '0,09');
    assert.equal(mascararDinheiro('95'), '0,95');
    assert.equal(mascararDinheiro('955'), '9,55');
    assert.equal(mascararDinheiro('9550'), '95,50');
    assert.equal(mascararDinheiro('260000'), '2.600,00');
  });

  it('reformata o que já estava no campo mais a tecla nova', () => {
    assert.equal(mascararDinheiro('0,955'), '9,55');
    assert.equal(mascararDinheiro('1.500,001'), '15.000,01');
    // Apagar o último dígito: "95,5" → 9,55
    assert.equal(mascararDinheiro('95,5'), '9,55');
  });

  it('campo vazio ou só zeros fica vazio; letras são ignoradas', () => {
    assert.equal(mascararDinheiro(''), '');
    assert.equal(mascararDinheiro('0,0'), '');
    assert.equal(mascararDinheiro(null), '');
    assert.equal(mascararDinheiro('R$ 1a2'), '0,12');
  });

  it('o resultado é lido por reaisParaCentavos', () => {
    assert.equal(reaisParaCentavos(mascararDinheiro('9550')), 9550);
    assert.equal(reaisParaCentavos(mascararDinheiro('123456789')), 123456789);
  });

  it(`no máximo ${DIGITOS_MAXIMOS} dígitos`, () => {
    const muitos = '9'.repeat(DIGITOS_MAXIMOS + 5);
    assert.equal(mascararDinheiro(muitos).replace(/\D/g, '').length, DIGITOS_MAXIMOS);
  });

  it('com sinal: o "-" é mantido (saldo negativo); sem a opção, é ignorado', () => {
    assert.equal(mascararDinheiro('-5000', { comSinal: true }), '-50,00');
    assert.equal(mascararDinheiro('-', { comSinal: true }), '-');
    assert.equal(mascararDinheiro('-5000'), '50,00');
  });
});

