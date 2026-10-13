/**
 * Testes dos alertas da Receita Federal (Fase 04, parte 4.7).
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REGRAS,
  vencimentoDoDarf,
  vendasDaCarteira,
  apuracaoMensal,
  alertasDaReceita,
  resumoDoAno,
  linhasDoAno,
} from '../src/receita.js';

let n = 0;
const op = (tipo, data, quantidade, reais) => ({ id: `op-${(n += 1)}`, tipo, data, quantidade, precoCentavos: reais * 100, custosCentavos: 0 });
const ativo = (tipo, nome, operacoes) => ({ id: nome, excluidoEm: null, tipo, nome, operacoes });
const estado = (...investimentos) => ({ investimentos });

describe('regras e vencimento', () => {
  it('valores conferidos em 12/10/2026', () => {
    assert.equal(REGRAS.isencaoAcoesNoMesCentavos, 2_000_000);
    assert.equal(REGRAS.aliquotaAcoes, 15);
    assert.equal(REGRAS.aliquotaFii, 20);
    assert.equal(REGRAS.darfMinimoCentavos, 1_000);
    assert.equal(REGRAS.codigoDarf, '6015');
  });

  it('último dia útil do mês seguinte (pula sábado e domingo)', () => {
    assert.equal(vencimentoDoDarf('2026-09'), '2026-10-30'); // 31/10/2026 é sábado
    assert.equal(vencimentoDoDarf('2026-10'), '2026-11-30');
    assert.equal(vencimentoDoDarf('2026-12'), '2027-01-29'); // 31/01/2027 é domingo
  });
});

describe('apuracaoMensal', () => {
  it('ações: vendas até R$ 20 mil isentas; acima, 15% do lucro', () => {
    const e = estado(
      ativo('acao', 'AAAA3', [op('compra', '2026-01-05', 1000, 10), op('venda', '2026-02-10', 500, 30)]), // vende R$ 15 mil, lucro R$ 10 mil
      ativo('acao', 'BBBB3', [op('compra', '2026-01-05', 1000, 10), op('venda', '2026-03-10', 1000, 25)]), // vende R$ 25 mil, lucro R$ 15 mil
    );
    const [fev, mar] = apuracaoMensal(e);
    assert.equal(fev.acoes.isento, true);
    assert.equal(fev.acoes.impostoCentavos, 0);
    assert.equal(fev.darf, null);
    assert.equal(mar.acoes.isento, false);
    assert.equal(mar.acoes.impostoCentavos, 225_000); // 15% de R$ 15 mil
    assert.deepEqual(mar.darf, { valorCentavos: 225_000, vencimento: '2026-04-30', codigo: '6015' });
  });

  it('FII: 20% sem isenção; prejuízo compensa só a mesma modalidade', () => {
    const e = estado(
      ativo('fii', 'FIIA11', [op('compra', '2026-01-05', 100, 100), op('venda', '2026-02-10', 100, 90)]), // prejuízo R$ 1.000
      ativo('acao', 'CCCC3', [op('compra', '2026-01-05', 1000, 10), op('venda', '2026-03-10', 1000, 30)]), // R$ 30 mil, lucro R$ 20 mil
      ativo('fii', 'FIIB11', [op('compra', '2026-01-05', 100, 100), op('venda', '2026-03-12', 100, 130)]), // lucro R$ 3.000
    );
    const [fev, mar] = apuracaoMensal(e);
    assert.equal(fev.prejuizoFiiCentavos, 100_000);
    assert.equal(mar.acoes.impostoCentavos, 300_000); // 15% de R$ 20 mil (o prejuízo do FII não entra)
    assert.equal(mar.fii.impostoCentavos, 40_000); // 20% de (R$ 3.000 − R$ 1.000)
    assert.equal(mar.prejuizoFiiCentavos, 0);
    assert.equal(mar.darf.valorCentavos, 340_000);
  });

  it('prejuízo de mês isento também compensa; imposto abaixo de R$ 10 acumula', () => {
    const e = estado(
      ativo('acao', 'DDDD3', [op('compra', '2026-01-05', 100, 50), op('venda', '2026-02-10', 100, 40)]), // prejuízo R$ 1.000 (isento)
      ativo('acao', 'EEEE3', [op('compra', '2026-01-05', 2100, 10), op('venda', '2026-03-10', 2100, 10.5)]), // R$ 22.050, lucro R$ 1.050
      ativo('fii', 'FIIC11', [op('compra', '2026-01-05', 10, 100), op('venda', '2026-04-10', 10, 104)]), // lucro R$ 40 → R$ 8
      ativo('fii', 'FIID11', [op('compra', '2026-01-05', 10, 100), op('venda', '2026-05-10', 10, 103)]), // lucro R$ 30 → R$ 6
    );
    const [, mar, abr, mai] = apuracaoMensal(e);
    assert.equal(mar.acoes.impostoCentavos, 750); // 15% de R$ 50 → R$ 7,50
    assert.equal(mar.darf, null);
    assert.equal(mar.acumulaCentavos, 750);
    assert.equal(abr.impostoCentavos, 750 + 800);
    assert.equal(abr.darf.valorCentavos, 1550);
    assert.equal(mai.impostoCentavos, 600);
    assert.equal(mai.darf, null);
  });

  it('marca compra e venda do mesmo ativo no mesmo dia', () => {
    const e = estado(ativo('acao', 'FFFF3', [op('compra', '2026-06-10', 10, 10), op('venda', '2026-06-10', 10, 11)]));
    assert.equal(vendasDaCarteira(e)[0].mesmoDia, true);
    assert.equal(apuracaoMensal(e)[0].mesmoDia, true);
  });
});

describe('alertasDaReceita', () => {
  it('DARF a vencer, perto do limite de isenção e day trade', () => {
    const e = estado(
      ativo('acao', 'GGGG3', [op('compra', '2026-01-05', 3000, 10), op('venda', '2026-09-10', 3000, 20)]), // set: R$ 60 mil, lucro R$ 30 mil
      ativo('acao', 'HHHH3', [op('compra', '2026-01-05', 1000, 10), op('venda', '2026-10-05', 1000, 16)]), // out: R$ 16 mil
      ativo('acao', 'IIII3', [op('compra', '2026-10-06', 10, 10), op('venda', '2026-10-06', 10, 11)]),
    );
    const alertas = alertasDaReceita(e, '2026-10-12');
    assert.deepEqual(alertas.map((a) => a.nivel), ['pagar', 'atencao', 'atencao']);
    assert.equal(alertas[0].texto, 'DARF de R$ 4.500,00 (código 6015) das vendas de 09/2026: vence em 30/10/2026.');
    assert.equal(alertas[1].texto, 'Vendas de ações neste mês: R$ 16.110,00. Faltam R$ 3.890,00 para passar do limite de isenção de R$ 20.000,00.');
    assert.match(alertas[2].texto, /day trade/);
    assert.deepEqual(alertasDaReceita(e, '2026-11-02').filter((a) => a.nivel === 'pagar'), []);
  });

  it('sem vendas: nenhum alerta', () => {
    assert.deepEqual(alertasDaReceita(estado(), '2026-10-12'), []);
    assert.deepEqual(alertasDaReceita({}, '2026-10-12'), []);
  });
});

describe('resumoDoAno', () => {
  it('motivos para declarar, prejuízo a informar e Bens e Direitos pelo custo', () => {
    const e = estado(
      ativo('acao', 'JJJJ3', [op('compra', '2026-01-05', 3000, 10), op('venda', '2026-09-10', 3000, 20)]),
      ativo('fii', 'FIIE11', [op('compra', '2026-02-01', 10, 100), op('venda', '2026-03-01', 5, 90), op('compra', '2027-01-10', 5, 100)]),
      { id: 'cdb', excluidoEm: null, tipo: 'cdb', nome: 'CDB X', dataAplicacao: '2026-05-01', valorAplicadoCentavos: 500_000, valorAtualCentavos: 520_000, valorAtualEm: '2026-10-01' },
      { id: 'velho', excluidoEm: '2026-08-01T00:00:00Z', tipo: 'cdb', nome: 'Removido', dataAplicacao: '2026-01-01', valorAplicadoCentavos: 1, valorAtualCentavos: 1, valorAtualEm: '2026-01-01' },
    );
    const r = resumoDoAno(e, 2026);
    assert.equal(r.vendasCentavos, 6_045_000);
    assert.equal(r.impostoPagoCentavos, 450_000);
    assert.equal(r.prejuizoFiiCentavos, 5_000);
    assert.deepEqual(r.bens.map((b) => [b.nome, b.custoCentavos, b.quantidade]), [['FIIE11', 50_000, 5], ['CDB X', 500_000, null]]);
    assert.equal(r.motivos.length, 2);
    const linhas = linhasDoAno(r);
    assert.match(linhas[0], /^Declaração de 2027 \(ano de 2026\): obrigatória pelos dados do app: vendas na bolsa de R\$ 60\.450,00 no ano/);
    assert.match(linhas[2], /Prejuízo para compensar .*FIIs R\$ 50,00/);
    assert.equal(linhas[3], 'Bens e Direitos em 31/12/2026, pelo custo de aquisição: FIIE11 R$ 500,00 (5 un.); CDB X R$ 5.000,00.');
  });

  it('sem motivo: diz que os investimentos do app não obrigam', () => {
    assert.match(linhasDoAno(resumoDoAno(estado(), 2026))[0], /não obrigam a declarar/);
  });
});
