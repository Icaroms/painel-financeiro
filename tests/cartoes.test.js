/**
 * Testes dos cartões de crédito (Fase 02, parte 2.1).
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  criarCartao,
  cartaoDaForma,
  salvarCartao,
  removerCartao,
  faturaDaCompra,
  melhorDiaDeCompra,
} from '../src/cartoes.js';
import { criarDadosIniciais } from '../src/inicio.js';
import { adicionarFormaPagamento, removerFormaPagamento } from '../src/configuracao.js';

/** Fecha dia 3 e vence dia 10: o vencimento vem depois do fechamento, no mesmo mês. */
const NUBANK = { formaPagamento: 'Cartão Nubank', limiteCentavos: 300000, diaFechamento: 3, diaVencimento: 10 };
/** Fecha dia 25 e vence dia 5: o vencimento cai no mês seguinte ao fechamento. */
const OUTRO = { formaPagamento: 'Cartão Careca', limiteCentavos: 150000, diaFechamento: 25, diaVencimento: 5 };

/** Dados de verdade com as duas formas de pagamento de cartão. */
function estadoComFormas() {
  const base = criarDadosIniciais('2026-10-08');
  return adicionarFormaPagamento(adicionarFormaPagamento(base, 'Cartão Nubank'), 'Cartão Careca');
}

describe('faturaDaCompra', () => {
  it('o exemplo confirmado: compra em 20/09 é paga em 10/10', () => {
    assert.deepEqual(faturaDaCompra(NUBANK, '2026-09-20'), {
      fechamento: '2026-10-03', vencimento: '2026-10-10', mesFatura: '2026-10',
    });
  });

  it('compra antes do fechamento entra na fatura que fecha no mesmo mês', () => {
    assert.deepEqual(faturaDaCompra(NUBANK, '2026-10-02'), {
      fechamento: '2026-10-03', vencimento: '2026-10-10', mesFatura: '2026-10',
    });
  });

  it('compra no dia do fechamento já vai para a fatura seguinte', () => {
    assert.equal(faturaDaCompra(NUBANK, '2026-10-03').vencimento, '2026-11-10');
  });

  it('vencimento antes do fechamento no calendário: paga no mês seguinte ao fechamento', () => {
    assert.deepEqual(faturaDaCompra(OUTRO, '2026-10-20'), {
      fechamento: '2026-10-25', vencimento: '2026-11-05', mesFatura: '2026-11',
    });
    assert.equal(faturaDaCompra(OUTRO, '2026-10-26').vencimento, '2026-12-05');
  });

  it('vira o ano', () => {
    assert.equal(faturaDaCompra(NUBANK, '2026-12-15').vencimento, '2027-01-10');
  });

  it('dia 31 cai no último dia dos meses curtos', () => {
    const fim = { ...NUBANK, diaFechamento: 31, diaVencimento: 8 };
    assert.equal(faturaDaCompra(fim, '2026-11-29').fechamento, '2026-11-30');
    assert.equal(faturaDaCompra(fim, '2026-11-30').fechamento, '2026-12-31'); // no dia do fechamento: a seguinte
  });

  it('rejeita data inválida', () => {
    assert.throws(() => faturaDaCompra(NUBANK, '2026-02-30'), { campo: 'data' });
  });
});

describe('criarCartao', () => {
  it('guarda limite e dias', () => {
    const cartao = criarCartao(NUBANK, { agora: new Date('2026-10-08T12:00:00.000Z') });
    assert.equal(cartao.limiteCentavos, 300000);
    assert.equal(cartao.diaFechamento, 3);
    assert.equal(cartao.criadoEm, '2026-10-08T12:00:00.000Z');
  });

  it('rejeita limite zero, dias fora de 1 a 31 e fechamento igual ao vencimento', () => {
    assert.throws(() => criarCartao({ ...NUBANK, limiteCentavos: 0 }), { campo: 'limiteCentavos' });
    assert.throws(() => criarCartao({ ...NUBANK, diaFechamento: 0 }), { campo: 'diaFechamento' });
    assert.throws(() => criarCartao({ ...NUBANK, diaVencimento: 32 }), { campo: 'diaVencimento' });
    assert.throws(() => criarCartao({ ...NUBANK, diaVencimento: 3 }), { campo: 'diaVencimento' });
    assert.throws(() => criarCartao({ ...NUBANK, formaPagamento: ' ' }), { campo: 'formaPagamento' });
  });

  it('o melhor dia de compra é o dia do fechamento', () => {
    assert.equal(melhorDiaDeCompra(NUBANK), 3);
  });
});

describe('salvarCartao, cartaoDaForma e removerCartao', () => {
  it('cadastra e encontra pelo nome da forma de pagamento', () => {
    const estado = salvarCartao(estadoComFormas(), NUBANK);
    assert.equal(cartaoDaForma(estado, 'Cartão Nubank').diaVencimento, 10);
    assert.equal(cartaoDaForma(estado, 'Pix'), null);
  });

  it('salvar de novo atualiza o mesmo cartão, sem duplicar', () => {
    const estado = salvarCartao(salvarCartao(estadoComFormas(), NUBANK), { ...NUBANK, limiteCentavos: 450000 });
    assert.equal(estado.cartoes.length, 1);
    assert.equal(cartaoDaForma(estado, 'Cartão Nubank').limiteCentavos, 450000);
  });

  it('só aceita uma forma de pagamento que existe', () => {
    assert.throws(() => salvarCartao(estadoComFormas(), { ...NUBANK, formaPagamento: 'Cartão X' }), { campo: 'formaPagamento' });
  });

  it('remover o cartão mantém a forma de pagamento', () => {
    const estado = removerCartao(salvarCartao(estadoComFormas(), NUBANK), 'Cartão Nubank');
    assert.equal(cartaoDaForma(estado, 'Cartão Nubank'), null);
    assert.ok(estado.formasPagamento.includes('Cartão Nubank'));
    assert.throws(() => removerCartao(estado, 'Cartão Nubank'), { campo: 'formaPagamento' });
  });

  it('remover a forma de pagamento remove o cartão junto', () => {
    const estado = removerFormaPagamento(salvarCartao(estadoComFormas(), NUBANK), 'Cartão Nubank');
    assert.equal(cartaoDaForma(estado, 'Cartão Nubank'), null);
  });

  it('dados sem a lista de cartões (antes da Fase 02) funcionam', () => {
    const { cartoes, ...semLista } = estadoComFormas();
    assert.equal(cartaoDaForma(semLista, 'Cartão Nubank'), null);
    assert.equal(salvarCartao(semLista, NUBANK).cartoes.length, 1);
  });
});
