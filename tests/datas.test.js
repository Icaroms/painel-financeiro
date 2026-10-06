/**
 * Testes dos utilitários de datas.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hojeLocal, ehDataValida, ehMesValido, mesDaData } from '../src/datas.js';

describe('hojeLocal', () => {
  it('formata a data no fuso local, com zeros à esquerda', () => {
    // new Date(ano, mês, dia, hora, minuto) usa o fuso local; mês começa em 0.
    const agora = new Date(2026, 10, 3, 9, 15); // 3 de novembro de 2026, 09:15
    assert.equal(hojeLocal(agora), '2026-11-03');
  });

  it('não pula para o dia seguinte à noite (problema do toISOString)', () => {
    const agora = new Date(2026, 10, 3, 23, 30); // 3 de novembro, 23:30 local
    assert.equal(hojeLocal(agora), '2026-11-03');
  });
});

describe('ehDataValida', () => {
  it('aceita datas reais', () => {
    assert.equal(ehDataValida('2026-11-03'), true);
    assert.equal(ehDataValida('2028-02-29'), true); // 2028 é bissexto
  });

  it('rejeita datas que não existem', () => {
    assert.equal(ehDataValida('2026-02-30'), false);
    assert.equal(ehDataValida('2026-02-29'), false); // 2026 não é bissexto
    assert.equal(ehDataValida('2026-13-01'), false);
  });

  it('rejeita formatos errados', () => {
    assert.equal(ehDataValida('03/11/2026'), false);
    assert.equal(ehDataValida('2026-11-3'), false);
    assert.equal(ehDataValida(''), false);
    assert.equal(ehDataValida(null), false);
  });
});

describe('ehMesValido', () => {
  it('aceita meses de 01 a 12', () => {
    assert.equal(ehMesValido('2026-01'), true);
    assert.equal(ehMesValido('2026-12'), true);
  });

  it('rejeita meses inexistentes ou mal formatados', () => {
    assert.equal(ehMesValido('2026-00'), false);
    assert.equal(ehMesValido('2026-13'), false);
    assert.equal(ehMesValido('2026-1'), false);
    assert.equal(ehMesValido('11/2026'), false);
    assert.equal(ehMesValido(undefined), false);
  });
});

describe('mesDaData', () => {
  it('extrai o mês de uma data', () => {
    assert.equal(mesDaData('2026-11-03'), '2026-11');
  });

  it('lança erro para data inválida', () => {
    assert.throws(() => mesDaData('2026-02-30'), TypeError);
  });
});
