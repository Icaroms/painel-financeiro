/**
 * Testes dos gráficos e do calendário de 90 dias (11/2026). Rodar com: npm test
 * Dados FICTÍCIOS.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { itensDoCalendario, gradeDoMes, mesesDoCalendario } from '../src/calendario.js';
import { gastosPorMes, saldoPrevisto, gastosPorCategoria } from '../src/graficos.js';
import { criarCartao } from '../src/cartoes.js';
import { criarCategoria, criarFixo, criarMes, criarLancamento } from '../src/modelo.js';
import { adicionarEntradaFixa, adicionarEntradaAvulsa } from '../src/entradas.js';
import { definirStatusDoFixo } from '../src/fixos.js';

const HOJE = '2026-11-07';
const CARTAO = criarCartao({ formaPagamento: 'Cartão Careca', limiteCentavos: 850000, diaFechamento: 3, diaVencimento: 10 });
const mercado = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 60000 });
const lazer = criarCategoria({ nome: 'Lazer', orcamentoCentavos: 30000 });

function estado() {
  let e = {
    meses: [
      criarMes({ mes: '2026-10', saldoInicialCentavos: 50000 }),
      criarMes({ mes: '2026-11', saldoInicialCentavos: 66663 }),
    ],
    categorias: [mercado, lazer],
    fixos: [
      criarFixo({ nome: 'Faculdade ADS', valorCentavos: 16492, diaVencimento: 10, formaPagamento: 'Pix', mesInicial: '2026-01' }),
      criarFixo({ nome: 'Plano Claro', valorCentavos: 3490, diaVencimento: 3, formaPagamento: 'Pix', mesInicial: '2026-01' }),
      criarFixo({ nome: 'Dentista', valorCentavos: 0, diaVencimento: 1, formaPagamento: 'Pix', mesInicial: '2026-01' }),
    ],
    lancamentos: [
      criarLancamento({ valorCentavos: 24800, categoriaId: mercado.id, formaPagamento: 'Pix', data: '2026-11-05' }),
      criarLancamento({ valorCentavos: 6200, categoriaId: lazer.id, formaPagamento: 'Pix', data: '2026-11-02' }),
      criarLancamento({ valorCentavos: 30000, categoriaId: mercado.id, formaPagamento: 'Pix', data: '2026-10-12' }),
      // Tablet em 5x no cartão: comprado depois do fechamento de novembro → 1ª parcela em dezembro.
      criarLancamento({ valorCentavos: 256900, categoriaId: lazer.id, formaPagamento: 'Cartão Careca', data: '2026-11-04', parcelas: 5 }),
    ],
    formasPagamento: ['Pix', 'Cartão Careca'],
    cartoes: [CARTAO],
  };
  e = adicionarEntradaFixa(e, { nome: 'Salário', valorCentavos: 231200, dia: 5 }, '2026-11', { statusNoMes: 'recebida' });
  e = adicionarEntradaAvulsa(e, { valorCentavos: 81050, data: '2026-11-06', descricao: '13º 1ª parcela' });
  return definirStatusDoFixo(e, '2026-11', e.fixos[1].id, 'pago');
}

describe('calendário de 90 dias', () => {
  it('mostra o mês atual e os 2 seguintes; fora disso, erro claro', () => {
    assert.deepEqual(mesesDoCalendario(HOJE), ['2026-11', '2026-12', '2027-01']);
    assert.throws(() => itensDoCalendario(estado(), '2027-02', HOJE), /2 seguintes/);
  });

  it('mês atual: contas com a situação real, entradas fixas e avulsas; conta zerada não aparece', () => {
    const c = itensDoCalendario(estado(), '2026-11', HOJE);
    assert.equal(c.previsao, false);
    const porNome = Object.fromEntries(c.itens.map((i) => [i.nome, i]));
    assert.equal(porNome['Plano Claro'].situacao, 'pago');
    assert.equal(porNome['Plano Claro'].data, '2026-11-03');
    assert.equal(porNome['Faculdade ADS'].situacao, 'previsto');
    assert.equal(porNome.Salário.tipo, 'entrada');
    assert.equal(porNome.Salário.situacao, 'recebida');
    assert.equal(porNome['13º 1ª parcela'].valorCentavos, 81050);
    assert.equal(porNome.Dentista, undefined);
    assert.equal(c.totalEntradasCentavos, 231200 + 81050);
    const datas = c.itens.map((i) => i.data);
    assert.deepEqual(datas, [...datas].sort());
  });

  it('meses seguintes: previsão com contas, salário e as parcelas do cartão no vencimento', () => {
    const c = itensDoCalendario(estado(), '2026-12', HOJE);
    assert.equal(c.previsao, true);
    const fatura = c.itens.find((i) => i.origem === 'fatura');
    assert.equal(fatura.nome, 'Fatura Cartão Careca');
    assert.equal(fatura.data, '2026-12-10');
    assert.equal(fatura.valorCentavos, 51380);
    assert.ok(c.itens.some((i) => i.nome === 'Salário' && i.data === '2026-12-05' && i.situacao === 'previsao'));
    assert.ok(c.itens.every((i) => i.situacao === 'previsao'));
  });

  it('grade: semanas de domingo a sábado (1º/11/2026 é domingo)', () => {
    const c = itensDoCalendario(estado(), '2026-11', HOJE);
    const grade = gradeDoMes('2026-11', c.itens);
    assert.equal(grade[0][0].dia, 1);
    assert.ok(grade.every((semana) => semana.length === 7));
    const dia10 = grade.flat().find((d) => d?.dia === 10);
    assert.ok(dia10.itens.some((i) => i.nome === 'Faculdade ADS'));
    // Dezembro de 2026 começa numa terça: 2 células vazias antes.
    assert.deepEqual(gradeDoMes('2026-12', [])[0].slice(0, 3).map((d) => d?.dia ?? null), [null, null, 1]);
  });
});

describe('gráficos', () => {
  it('gastos por mês: do mais antigo ao atual, o atual parcial', () => {
    const g = gastosPorMes(estado(), HOJE);
    assert.deepEqual(g.map((m) => m.mes), ['2026-10', '2026-11']);
    assert.equal(g[0].totalCentavos, 30000);
    assert.equal(g[1].totalCentavos, 24800 + 6200 + 256900);
    assert.equal(g[1].parcial, true);
  });

  it('saldo previsto: o mês atual e os 5 seguintes, acumulado', () => {
    const s = saldoPrevisto(estado(), HOJE);
    assert.equal(s.length, 6);
    assert.equal(s[0].mes, '2026-11');
    assert.equal(s[0].atual, true);
    assert.equal(s[5].mes, '2027-04');
  });

  it('gastos por categoria: maior primeiro, fatias somando 1', () => {
    const g = gastosPorCategoria(estado(), HOJE);
    assert.deepEqual(g.itens.map((i) => i.nome), ['Lazer', 'Mercado']);
    assert.equal(g.totalCentavos, 24800 + 6200 + 256900);
    assert.ok(Math.abs(g.itens.reduce((t, i) => t + i.fatia, 0) - 1) < 1e-9);
  });
});
