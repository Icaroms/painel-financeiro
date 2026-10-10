/**
 * Testes da estimativa da renda fixa pela taxa contratada (Fase 04, parte 4.4c).
 * Rodar com: npm test
 *
 * O histórico de teste usa números redondos para dar para conferir na mão:
 * CDI de 1% em todo mês (outubro/2026 com 0,4% até o dia 8) e IPCA de 0,5%.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIPOS_COM_TAXA,
  INDEXADORES_CONTRATADOS,
  aceitaTaxa,
  lerPercentual,
  validarTaxa,
  textoDaTaxa,
  diasEntre,
  fimDoCdi,
  fatorDoCdi,
  fatorDoIpca,
  aliquotaDoIr,
  estimarRendaFixa,
  comEstimativas,
} from '../src/renda-fixa.js';
import { adicionarInvestimento, resumoDaCarteira, reservaDaCarteira } from '../src/carteira.js';

const HOJE = '2026-10-10';

/** Meses "AAAA-MM" de um mês até outro. */
function meses(de, ate) {
  const lista = [];
  for (let [a, m] = de.split('-').map(Number); `${a}-${String(m).padStart(2, '0')}` <= ate; m === 12 ? (a += 1, m = 1) : (m += 1)) {
    lista.push(`${a}-${String(m).padStart(2, '0')}`);
  }
  return lista;
}
const diasDoMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

const HISTORICO = {
  inicio: '2016-01',
  cdi: [
    ...meses('2016-01', '2026-09').map((mes) => ({ mes, percentual: 1, ultimoDia: diasDoMes(mes) })),
    { mes: '2026-10', percentual: 0.4, ultimoDia: 8 },
  ],
  ipca: meses('2016-01', '2026-09').map((mes) => ({ mes, percentual: 0.5 })),
};

/** CDB de R$ 1.000 aplicado em 01/01/2026, sem valor digitado (= aplicado na data da aplicação). */
const cdb = (mudanca = {}) => ({
  id: 'x', excluidoEm: null, tipo: 'cdb', nome: 'CDB', dataAplicacao: '2026-01-01',
  valorAplicadoCentavos: 100000, valorAtualCentavos: 100000, valorAtualEm: '2026-01-01', reserva: false,
  taxa: { indexador: 'cdi', percentual: 100 },
  ...mudanca,
});

const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

describe('taxa contratada: leitura e validação', () => {
  it('só CDB, Tesouro, LCI/LCA e outra renda fixa aceitam taxa', () => {
    assert.deepEqual([...TIPOS_COM_TAXA], ['cdb', 'tesouro', 'lci-lca', 'outro-renda-fixa']);
    assert.equal(aceitaTaxa('poupanca'), false);
    assert.equal(aceitaTaxa('fundo'), false);
    assert.deepEqual(INDEXADORES_CONTRATADOS.map((i) => i.id), ['cdi', 'prefixado', 'ipca']);
  });

  it('lê porcentagens digitadas', () => {
    assert.equal(lerPercentual('110'), 110);
    assert.equal(lerPercentual(' 12,5 '), 12.5);
    assert.equal(lerPercentual('6.2%'), 6.2);
    assert.equal(lerPercentual(''), null);
    assert.ok(Number.isNaN(lerPercentual('abc')));
    assert.ok(Number.isNaN(lerPercentual('1,2,3')));
  });

  it('valida e arredonda em 2 casas; tipo sem taxa fica sem taxa', () => {
    assert.deepEqual(validarTaxa('cdb', { indexador: 'cdi', percentual: 110 }), { indexador: 'cdi', percentual: 110 });
    assert.deepEqual(validarTaxa('cdb', { indexador: 'prefixado', percentual: 12.345 }), { indexador: 'prefixado', percentual: 12.35 });
    assert.equal(validarTaxa('cdb', null), null);
    assert.equal(validarTaxa('poupanca', { indexador: 'cdi', percentual: 100 }), null);
    assert.throws(() => validarTaxa('cdb', { indexador: 'dolar', percentual: 5 }), /Escolha como a aplicação rende/);
    assert.throws(() => validarTaxa('cdb', { indexador: 'cdi', percentual: 0 }), /de 1 a 300 \(% do CDI\), como 110/);
    assert.throws(() => validarTaxa('cdb', { indexador: 'ipca', percentual: NaN }), /Taxa inválida/);
  });

  it('textos da taxa', () => {
    assert.equal(textoDaTaxa({ indexador: 'cdi', percentual: 110 }), '110% do CDI');
    assert.equal(textoDaTaxa({ indexador: 'prefixado', percentual: 12.5 }), '12,5% ao ano');
    assert.equal(textoDaTaxa({ indexador: 'ipca', percentual: 6.2 }), 'IPCA + 6,2% ao ano');
  });
});

describe('fatores', () => {
  it('CDI: meses inteiros, meio mês e % do CDI', () => {
    perto(fatorDoCdi(HISTORICO, '2026-01-01', '2026-03-01'), 1.01 ** 2);
    perto(fatorDoCdi(HISTORICO, '2026-01-01', '2026-01-16'), 1.01 ** (15 / 31));
    perto(fatorDoCdi(HISTORICO, '2026-01-01', '2026-03-01', 110), 1.01 ** 2.2);
  });

  it('CDI: o mês mais recente vai até o último dado', () => {
    assert.equal(fimDoCdi(HISTORICO), '2026-10-09');
    perto(fatorDoCdi(HISTORICO, '2026-10-01', '2026-10-09'), 1.004);
    perto(fatorDoCdi(HISTORICO, '2026-10-05', '2026-10-09'), 1.004 ** (4 / 8));
  });

  it('IPCA: meses divulgados e projeção dos que faltam', () => {
    assert.deepEqual(fatorDoIpca(HISTORICO, '2026-08-01', '2026-10-01'), { fator: 1.005 ** 2, projetado: false });
    const comProjecao = fatorDoIpca(HISTORICO, '2026-09-01', '2026-11-01');
    perto(comProjecao.fator, 1.005 ** 2);
    assert.equal(comProjecao.projetado, true);
  });
});

describe('imposto de renda', () => {
  it('tabela regressiva nos limites de cada faixa', () => {
    assert.deepEqual([0, 180, 181, 360, 361, 720, 721, 3000].map(aliquotaDoIr), [22.5, 22.5, 20, 20, 17.5, 17.5, 15, 15]);
  });
});

describe('estimarRendaFixa', () => {
  it('100% do CDI desde a aplicação, até o último dado do CDI, com IR', () => {
    const e = estimarRendaFixa(cdb(), HISTORICO, HOJE);
    const bruto = Math.round(100000 * 1.01 ** 9 * 1.004);
    assert.equal(e.ate, '2026-10-09');
    assert.equal(e.brutoCentavos, bruto);
    assert.equal(diasEntre('2026-01-01', '2026-10-09'), 281);
    assert.equal(e.aliquota, 20);
    assert.equal(e.irCentavos, Math.round((bruto - 100000) * 0.2));
    assert.equal(e.liquidoCentavos, bruto - e.irCentavos);
    assert.deepEqual(e.partiuDe, { centavos: 100000, data: '2026-01-01' });
    assert.equal(e.isento, false);
  });

  it('parte do último valor digitado; o IR conta o rendimento desde a aplicação', () => {
    const e = estimarRendaFixa(cdb({ valorAtualCentavos: 105000, valorAtualEm: '2026-07-01' }), HISTORICO, HOJE);
    const bruto = Math.round(105000 * 1.01 ** 3 * 1.004);
    assert.equal(e.brutoCentavos, bruto);
    assert.equal(e.irCentavos, Math.round((bruto - 100000) * 0.2));
  });

  it('LCI/LCA: isenta de IR', () => {
    const e = estimarRendaFixa(cdb({ tipo: 'lci-lca' }), HISTORICO, HOJE);
    assert.equal(e.isento, true);
    assert.equal(e.aliquota, 0);
    assert.equal(e.irCentavos, 0);
    assert.equal(e.liquidoCentavos, e.brutoCentavos);
  });

  it('prefixado: estima até hoje, mesmo sem histórico', () => {
    const e = estimarRendaFixa(cdb({
      dataAplicacao: '2025-10-10', valorAtualEm: '2025-10-10', taxa: { indexador: 'prefixado', percentual: 12 },
    }), null, HOJE);
    assert.equal(e.ate, HOJE);
    assert.equal(e.brutoCentavos, 112000); // 365 dias a 12% ao ano
    assert.equal(e.aliquota, 17.5);
    assert.equal(e.irCentavos, 2100);
  });

  it('IPCA +: juro real × IPCA, avisando a projeção', () => {
    const e = estimarRendaFixa(cdb({
      dataAplicacao: '2026-09-01', valorAtualEm: '2026-09-01', taxa: { indexador: 'ipca', percentual: 6 },
    }), HISTORICO, HOJE);
    const ipca = fatorDoIpca(HISTORICO, '2026-09-01', HOJE).fator;
    assert.equal(e.brutoCentavos, Math.round(100000 * ipca * 1.06 ** (39 / 365)));
    assert.equal(e.ipcaProjetado, true);
  });

  it('valor digitado depois do último dado: fica igual ao digitado', () => {
    const e = estimarRendaFixa(cdb({ valorAtualCentavos: 110000, valorAtualEm: HOJE }), HISTORICO, HOJE);
    assert.equal(e.brutoCentavos, 110000);
    assert.equal(e.ate, HOJE);
  });

  it('sem estimativa: sem taxa, sem histórico, antes do histórico ou tipo sem taxa', () => {
    assert.equal(estimarRendaFixa(cdb({ taxa: null }), HISTORICO, HOJE), null);
    assert.equal(estimarRendaFixa(cdb({ taxa: undefined }), HISTORICO, HOJE), null);
    assert.equal(estimarRendaFixa(cdb(), null, HOJE), null);
    assert.equal(estimarRendaFixa(cdb({ dataAplicacao: '2015-06-01', valorAtualEm: '2015-06-01' }), HISTORICO, HOJE), null);
    assert.equal(estimarRendaFixa(cdb({ tipo: 'poupanca' }), HISTORICO, HOJE), null);
  });
});

describe('comEstimativas (visão só para mostrar e calcular)', () => {
  it('sem nenhuma taxa: devolve o mesmo estado', () => {
    const estado = { investimentos: [cdb({ taxa: null })] };
    assert.equal(comEstimativas(estado, HISTORICO, HOJE), estado);
    assert.equal(comEstimativas({}, HISTORICO, HOJE).investimentos, undefined);
  });

  it('troca o valor atual pelo estimado, sem mexer no original; resumo e reserva usam a estimativa', () => {
    const original = { investimentos: [cdb({ reserva: true }), cdb({ id: 'apagado', excluidoEm: '2026-05-01T00:00:00Z' })] };
    const visao = comEstimativas(original, HISTORICO, HOJE);
    const bruto = Math.round(100000 * 1.01 ** 9 * 1.004);
    assert.equal(visao.investimentos[0].valorAtualCentavos, bruto);
    assert.equal(visao.investimentos[0].valorAtualEm, '2026-10-09');
    assert.equal(visao.investimentos[0].estimativa.brutoCentavos, bruto);
    assert.equal(visao.investimentos[1], original.investimentos[1]);
    assert.equal(original.investimentos[0].valorAtualCentavos, 100000);
    assert.equal(original.investimentos[0].estimativa, undefined);
    assert.equal(resumoDaCarteira(visao).atualCentavos, bruto);
    assert.equal(reservaDaCarteira(visao).totalCentavos, bruto);
  });
});

describe('carteira guarda a taxa', () => {
  const dados = {
    tipo: 'cdb', nome: 'CDB 110', dataAplicacao: '2026-01-01', valorAplicadoCentavos: 100000,
    taxa: { indexador: 'cdi', percentual: 110 },
  };
  const opcoes = { hoje: HOJE, gerarId: () => 'id-1' };

  it('CDB com taxa', () => {
    assert.deepEqual(adicionarInvestimento({}, dados, opcoes).investimentos[0].taxa, { indexador: 'cdi', percentual: 110 });
  });

  it('poupança e fundo ficam sem taxa; taxa inválida dá erro claro', () => {
    assert.equal(adicionarInvestimento({}, { ...dados, tipo: 'poupanca' }, opcoes).investimentos[0].taxa, null);
    assert.throws(() => adicionarInvestimento({}, { ...dados, taxa: { indexador: 'cdi', percentual: 500 } }, opcoes), /Taxa inválida/);
  });
});
