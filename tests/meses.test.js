/**
 * Testes dos vários meses e da virada de mês.
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buscarMes, dadosDoMes, sobraDoMes, virarMes } from '../src/meses.js';
import {
  criarCategoria, criarFixo, criarLancamento, criarMes, ajustarFixoNoMes, excluirRegistro,
} from '../src/modelo.js';

const OPCOES = { agora: new Date('2026-11-01T12:00:00.000Z') };

/**
 * Outubro de 2026: saldo inicial R$ 300, renda prevista R$ 2.000.
 * Fixos: Academia R$ 99,90 (sem fim) e Fone R$ 150,00 (última parcela em outubro).
 * Lançamentos de outubro: R$ 400 + R$ 100 (este excluído, não conta).
 */
function estadoDeOutubro() {
  const lanches = criarCategoria({ nome: 'Lanches', orcamentoCentavos: 20000 });
  const academia = criarFixo({
    nome: 'Academia', valorCentavos: 9990, diaVencimento: 5, formaPagamento: 'Pix', mesInicial: '2026-01',
  });
  const fone = criarFixo({
    nome: 'Fone', valorCentavos: 15000, diaVencimento: 7, formaPagamento: 'Crédito',
    mesInicial: '2026-08', mesFinal: '2026-10',
  });
  const outubro = criarMes({ mes: '2026-10', saldoInicialCentavos: 30000, rendaPrevistaCentavos: 200000 });

  return {
    meses: [ajustarFixoNoMes(outubro, academia, 12000)], // academia mais cara só em outubro
    categorias: [lanches],
    fixos: [academia, fone],
    lancamentos: [
      criarLancamento({ valorCentavos: 40000, categoriaId: lanches.id, formaPagamento: 'Pix', data: '2026-10-10' }),
      excluirRegistro(
        criarLancamento({ valorCentavos: 10000, categoriaId: lanches.id, formaPagamento: 'Pix', data: '2026-10-12' }),
      ),
    ],
    formasPagamento: ['Pix', 'Crédito'],
  };
}

describe('buscarMes e dadosDoMes', () => {
  it('encontra o mês e monta a visão usada pela tela', () => {
    const estado = estadoDeOutubro();
    const visao = dadosDoMes(estado, '2026-10');

    assert.equal(buscarMes(estado, '2026-10').mes, '2026-10');
    assert.equal(visao.registroMes.mes, '2026-10');
    assert.equal(visao.categorias, estado.categorias);
    assert.equal(visao.fixos, estado.fixos);
    assert.equal(visao.lancamentos, estado.lancamentos);
    assert.equal(visao.formasPagamento, estado.formasPagamento);
  });

  it('mês inexistente: buscarMes devolve undefined e dadosDoMes lança erro', () => {
    const estado = estadoDeOutubro();
    assert.equal(buscarMes(estado, '2026-11'), undefined);
    assert.throws(() => dadosDoMes(estado, '2026-11'), { name: 'ErroValidacao', campo: 'mes' });
  });
});

describe('sobraDoMes', () => {
  it('saldo inicial + renda − fixos (com ajuste) − lançamentos válidos', () => {
    // 300 + 2000 − (120 academia ajustada + 150 fone) − 400 = 1630
    assert.equal(sobraDoMes(estadoDeOutubro(), '2026-10'), 163000);
  });
});

describe('virarMes', () => {
  it('cria novembro com a sobra de outubro como saldo sugerido', () => {
    const { estado, criado, mesBase } = virarMes(estadoDeOutubro(), '2026-11', OPCOES);

    assert.equal(mesBase, '2026-10');
    assert.equal(criado.mes, '2026-11');
    assert.equal(criado.saldoInicialCentavos, 163000);
    assert.equal(criado.rendaPrevistaCentavos, 200000); // renda copiada
    assert.equal(criado.saldoConfirmado, false);         // falta a confirmação
    assert.deepEqual(criado.ajustesFixos, {});           // ajuste de outubro não passa
    assert.equal(estado.meses.length, 2);
  });

  it('não altera o estado original', () => {
    const original = estadoDeOutubro();
    virarMes(original, '2026-11', OPCOES);
    assert.equal(original.meses.length, 1);
  });

  it('no mês novo, o parcelamento encerrado não conta mais', () => {
    const { estado } = virarMes(estadoDeOutubro(), '2026-11', OPCOES);
    // 1630 + 2000 − 99,90 (só a academia, valor normal) − 0 lançamentos = 3530,10
    assert.equal(sobraDoMes(estado, '2026-11'), 353010);
  });

  it('se o mês já existe, não muda nada', () => {
    const original = estadoDeOutubro();
    const resultado = virarMes(original, '2026-10', OPCOES);
    assert.equal(resultado.estado, original);
    assert.equal(resultado.criado, null);
  });

  it('meses sem abrir o app: usa o último mês que existe', () => {
    const { criado, mesBase } = virarMes(estadoDeOutubro(), '2027-01', OPCOES);
    assert.equal(mesBase, '2026-10');
    assert.equal(criado.mes, '2027-01');
  });

  it('sem mês anterior, lança erro', () => {
    assert.throws(() => virarMes(estadoDeOutubro(), '2026-09', OPCOES), { name: 'ErroValidacao', campo: 'mes' });
  });

  it('rejeita mês inválido', () => {
    assert.throws(() => virarMes(estadoDeOutubro(), '2026-13', OPCOES), { name: 'ErroValidacao', campo: 'mes' });
  });
});
