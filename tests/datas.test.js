/**
 * Testes dos utilitários de datas.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hojeLocal,
  ehDataValida,
  ehMesValido,
  mesDaData,
  diasNoMes,
  diaDaData,
  somarMeses,
  mesesEntre,
} from '../src/datas.js';

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

describe('diasNoMes', () => {
  it('conta os dias de cada tipo de mês', () => {
    assert.equal(diasNoMes('2026-11'), 30);
    assert.equal(diasNoMes('2026-12'), 31);
    assert.equal(diasNoMes('2026-02'), 28);
    assert.equal(diasNoMes('2028-02'), 29); // bissexto
  });

  it('lança erro para mês inválido', () => {
    assert.throws(() => diasNoMes('2026-13'), TypeError);
  });
});

describe('diaDaData', () => {
  it('extrai o dia como número', () => {
    assert.equal(diaDaData('2026-11-03'), 3);
    assert.equal(diaDaData('2026-11-30'), 30);
  });

  it('lança erro para data inválida', () => {
    assert.throws(() => diaDaData('2026-11-31'), TypeError);
  });
});

describe('somarMeses', () => {
  it('avança e volta meses, virando o ano', () => {
    assert.equal(somarMeses('2026-11', 1), '2026-12');
    assert.equal(somarMeses('2026-11', 3), '2027-02');
    assert.equal(somarMeses('2026-01', -1), '2025-12');
    assert.equal(somarMeses('2026-10', -14), '2025-08');
    assert.equal(somarMeses('2026-10', 0), '2026-10');
  });

  it('lança erro para mês ou quantidade inválidos', () => {
    assert.throws(() => somarMeses('2026-13', 1), TypeError);
    assert.throws(() => somarMeses('2026-10', 1.5), TypeError);
  });
});

describe('mesesEntre', () => {
  it('conta os meses do início ao fim, incluindo os dois', () => {
    assert.equal(mesesEntre('2026-10', '2026-10'), 1);
    assert.equal(mesesEntre('2026-10', '2026-12'), 3);
    assert.equal(mesesEntre('2026-05', '2027-04'), 12);
  });

  it('lança erro para mês inválido', () => {
    assert.throws(() => mesesEntre('2026-10', '2026-13'), TypeError);
  });
});
