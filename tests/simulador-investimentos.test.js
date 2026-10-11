/**
 * Testes do simulador de investimentos (Fase 04, parte 4.5).
 * Rodar com: npm test
 *
 * Taxas fictícias com números redondos, para conferir na mão.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRAZO_MAXIMO,
  PADROES,
  validarSimulacao,
  anualDoCdi,
  mensalDoAnual,
  maisMeses,
  tituloParaOPrazo,
  opcoesDaSimulacao,
  simularOpcao,
  simularInvestimentos,
} from '../src/simulador-investimentos.js';

const HOJE = '2026-10-10';

const titulo = (tipo, indexador, vencimento, taxaCompra) => ({
  nome: `${tipo} ${vencimento.slice(0, 4)}`, tipo, indexador, vencimento, taxaCompra, precoCompraCentavos: 100000,
});

const RADAR = {
  taxas: {
    selicMeta: { valor: 13.75, data: '2026-10-09' },
    cdi: { anual: 13.65, data: '2026-10-08' },
    ipca: { mes: '2026-09', mensal: 0.82, acumulado12m: 4.58 },
    poupanca: { mensal: 0.67, data: '2026-10-10' },
  },
  tesouro: {
    dataBase: '2026-10-09',
    titulos: [
      titulo('Tesouro Selic', 'selic', '2027-03-01', 0.01),
      titulo('Tesouro Selic', 'selic', '2029-03-01', 0.05),
      titulo('Tesouro Prefixado', 'prefixado', '2028-01-01', 12.49),
      titulo('Tesouro Prefixado', 'prefixado', '2032-01-01', 12.54),
      titulo('Tesouro IPCA+', 'ipca', '2029-05-15', 6.62),
      titulo('Tesouro IPCA+ com Juros Semestrais', 'ipca', '2030-08-15', 6.7),
    ],
  },
};

const pedido = (mudanca = {}) => ({ inicialCentavos: 100000, mensalCentavos: 20000, meses: 24, cdiCdb: 100, cdiLci: 90, ...mudanca });
const perto = (a, b, tolerancia = 1e-9) => assert.ok(Math.abs(a - b) < tolerancia, `${a} ≠ ${b}`);

describe('pedido', () => {
  it('aceita o padrão e dá erros claros', () => {
    assert.deepEqual({ ...PADROES }, { meses: 24, cdiCdb: 100, cdiLci: 90 });
    assert.deepEqual(validarSimulacao(pedido()), pedido());
    assert.throws(() => validarSimulacao(pedido({ inicialCentavos: -1 })), /O valor inicial deve ser zero ou mais/);
    assert.throws(() => validarSimulacao(pedido({ inicialCentavos: 0, mensalCentavos: 0 })), /Digite um valor inicial, um valor mensal ou os dois/);
    assert.throws(() => validarSimulacao(pedido({ meses: 0 })), /O prazo deve ser de 1 a 360 meses/);
    assert.throws(() => validarSimulacao(pedido({ meses: PRAZO_MAXIMO + 1 })), /prazo/);
    assert.throws(() => validarSimulacao(pedido({ meses: 2.5 })), /prazo/);
    assert.throws(() => validarSimulacao(pedido({ cdiLci: NaN })), /A taxa da LCI\/LCA deve ser de 1 a 300/);
  });
});

describe('taxas', () => {
  it('100% do CDI é o próprio CDI; 110% rende um pouco mais que 1,1 × CDI', () => {
    perto(anualDoCdi(13.65, 100), 13.65);
    const cento10 = anualDoCdi(13.65, 110);
    assert.ok(cento10 > 13.65 * 1.1 && cento10 < 13.65 * 1.1 + 0.2);
  });

  it('ao ano → ao mês', () => {
    perto(mensalDoAnual((1.01 ** 12 - 1) * 100), 1);
  });

  it('data mais meses, presa ao fim do mês', () => {
    assert.equal(maisMeses('2026-10-10', 24), '2028-10-10');
    assert.equal(maisMeses('2026-01-31', 1), '2026-02-28');
  });

  it('título para o prazo: o primeiro que vence depois do fim, ou o mais longo', () => {
    const { titulos } = RADAR.tesouro;
    assert.equal(tituloParaOPrazo(titulos, 'Tesouro Selic', '2027-10-10').vencimento, '2029-03-01');
    assert.equal(tituloParaOPrazo(titulos, 'Tesouro Selic', '2035-01-01').vencimento, '2029-03-01');
    assert.equal(tituloParaOPrazo(titulos, 'Tesouro IPCA+', '2030-01-01').nome, 'Tesouro IPCA+ 2029'); // juros semestrais fora
    assert.equal(tituloParaOPrazo(titulos, 'Tesouro Renda+', '2030-01-01'), null);
  });
});

describe('opções', () => {
  it('poupança, CDB, LCI/LCA e um título de cada tipo do Tesouro', () => {
    const opcoes = opcoesDaSimulacao(RADAR, pedido(), HOJE);
    assert.deepEqual(opcoes.map((o) => o.id), ['poupanca', 'cdb', 'lci', 'tesouro-selic', 'tesouro-prefixado', 'tesouro-ipca']);
    assert.deepEqual(opcoes.map((o) => o.nome), [
      'Poupança', 'CDB 100% do CDI', 'LCI/LCA 90% do CDI', 'Tesouro Selic 2029', 'Tesouro Prefixado 2032', 'Tesouro IPCA+ 2029',
    ]);
    const [poupanca, cdb, lci, selic, prefixado, ipca] = opcoes;
    assert.equal(poupanca.mensal, 0.67);
    assert.equal(poupanca.taxa, '0,67% ao mês (com a TR)');
    assert.equal(cdb.taxa, '13,65% ao ano');
    assert.equal(lci.isento, true);
    assert.equal(cdb.isento, false);
    assert.match(selic.taxa, /^Selic \+ 0,05% ≈ 13,71% ao ano$/);
    perto(prefixado.mensal, mensalDoAnual(12.54));
    assert.match(prefixado.nota, /Vence em 01\/01\/2032: vendendo antes/);
    perto(ipca.mensal, mensalDoAnual((1.0458 * 1.0662 - 1) * 100));
    assert.match(ipca.nota, /IPCA projetado/);
  });

  it('sem a poupança do Banco Central: regra sem TR, com aviso; Selic baixa = 70% da Selic', () => {
    const semPoupanca = { ...RADAR, taxas: { ...RADAR.taxas, poupanca: null } };
    const [poupanca] = opcoesDaSimulacao(semPoupanca, pedido(), HOJE);
    assert.equal(poupanca.mensal, 0.5);
    assert.match(poupanca.nota, /Sem a TR/);
    const selicBaixa = { ...semPoupanca, taxas: { ...semPoupanca.taxas, selicMeta: { valor: 6, data: HOJE } } };
    perto(opcoesDaSimulacao(selicBaixa, pedido(), HOJE)[0].mensal, mensalDoAnual(4.2));
  });

  it('sem Tesouro no radar: só as opções fixas; prazo curto avisa a carência da LCI', () => {
    const opcoes = opcoesDaSimulacao({ ...RADAR, tesouro: null }, pedido({ meses: 6 }), HOJE);
    assert.deepEqual(opcoes.map((o) => o.id), ['poupanca', 'cdb', 'lci']);
    assert.match(opcoes[2].nota, /carência/);
  });
});

describe('simularOpcao', () => {
  it('só valor inicial, 12 meses a 1% ao mês, com IR de 17,5% (365 dias)', () => {
    const r = simularOpcao({ mensal: 1, isento: false }, { inicialCentavos: 100000, mensalCentavos: 0, meses: 12 }, 0);
    const bruto = Math.round(100000 * 1.01 ** 12);
    assert.equal(r.brutoCentavos, bruto);
    assert.equal(r.irCentavos, Math.round((100000 * 1.01 ** 12 - 100000) * 0.175)); // IR sobre o valor sem arredondar
    assert.equal(r.liquidoCentavos, bruto - r.irCentavos);
    assert.equal(r.aportadoCentavos, 100000);
    assert.equal(r.realCentavos, r.liquidoCentavos); // inflação zero
  });

  it('valor mensal: entra a partir do mês que vem, cada aporte com o próprio IR', () => {
    // Mês 1: R$ 10 × 1,01 (30 dias, IR 22,5%); mês 2: R$ 10, sem render.
    const r = simularOpcao({ mensal: 1, isento: false }, { inicialCentavos: 0, mensalCentavos: 1000, meses: 2 }, 0);
    assert.equal(r.aportadoCentavos, 2000);
    assert.equal(r.brutoCentavos, 2010);
    assert.equal(r.irCentavos, 2); // 10 centavos × 22,5%
    assert.equal(r.liquidoCentavos, 2008);
  });

  it('isento não paga IR; rendendo igual à inflação, o ganho real é zero', () => {
    const ipca12 = (1.01 ** 12 - 1) * 100;
    const r = simularOpcao({ mensal: 1, isento: true }, { inicialCentavos: 100000, mensalCentavos: 0, meses: 24 }, ipca12);
    assert.equal(r.irCentavos, 0);
    assert.equal(r.realCentavos, 100000);
    perto(r.ganhoRealPercentual, 0);
  });
});

describe('simularInvestimentos', () => {
  it('todas as opções, da que termina com mais dinheiro líquido para a com menos', () => {
    const s = simularInvestimentos(RADAR, pedido(), HOJE);
    assert.equal(s.resultados.length, 6);
    for (let i = 1; i < s.resultados.length; i += 1) {
      assert.ok(s.resultados[i - 1].liquidoCentavos >= s.resultados[i].liquidoCentavos);
    }
    assert.equal(s.resultados[0].aportadoCentavos, 100000 + 24 * 20000);
    assert.equal(s.ipca12, 4.58);
    assert.equal(s.dataDoTesouro, '2026-10-09');
  });

  it('sem taxas no radar: erro explicando o que fazer', () => {
    assert.throws(() => simularInvestimentos(null, pedido(), HOJE), /toque em "Atualizar radar"/);
    assert.throws(() => simularInvestimentos({ tesouro: RADAR.tesouro, taxas: null }, pedido(), HOJE), /taxas do Banco Central/);
  });
});
