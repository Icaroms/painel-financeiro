/**
 * Testes do fluxo de caixa: faturas, parcelas e projeção (Fase 02, parte 2.2).
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS. O cartão fecha dia 3 e vence dia 10.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  saidasDoLancamento,
  saidasNoMes,
  faturasDoMes,
  definirStatusDaFatura,
  projetarMeses,
  mesesAteAUltimaSaida,
  limiteDoCartao,
  contasFixasNasFaturas,
  fechamentoDaFatura,
} from '../src/fluxo.js';
import { criarCartao } from '../src/cartoes.js';
import { criarCategoria, criarFixo, criarLancamento, criarMes, excluirRegistro } from '../src/modelo.js';
import { avaliarGasto } from '../src/veredito.js';

const CARTAO = criarCartao({ formaPagamento: 'Cartão Nubank', limiteCentavos: 300000, diaFechamento: 3, diaVencimento: 10 });
const diversos = criarCategoria({ nome: 'Diversos', orcamentoCentavos: 0 });
const compra = (valorCentavos, data, extra = {}) => criarLancamento({
  valorCentavos, categoriaId: diversos.id, formaPagamento: 'Cartão Nubank', data, ...extra,
});

describe('saidasDoLancamento', () => {
  it('à vista (forma que não é cartão): sai inteiro no mês do gasto', () => {
    const pix = criarLancamento({ valorCentavos: 5000, categoriaId: diversos.id, formaPagamento: 'Pix', data: '2026-10-20' });
    const [saida] = saidasDoLancamento(pix, [CARTAO]);
    assert.deepEqual([saida.mes, saida.valorCentavos, saida.cartao, saida.vencimento], ['2026-10', 5000, false, null]);
  });

  it('no cartão, à vista: sai na fatura (o exemplo confirmado: 20/09 → 10/10)', () => {
    const [saida] = saidasDoLancamento(compra(5000, '2026-09-20'), [CARTAO]);
    assert.deepEqual([saida.mes, saida.vencimento, saida.cartao], ['2026-10', '2026-10-10', true]);
  });

  it('parcelado: uma parcela por fatura, e os centavos que sobram vão para a 1ª', () => {
    const saidas = saidasDoLancamento(compra(100000, '2026-10-05', { parcelas: 3 }), [CARTAO]);
    assert.deepEqual(
      saidas.map((s) => [s.mes, s.valorCentavos, s.numero, s.total]),
      [['2026-11', 33334, 1, 3], ['2026-12', 33333, 2, 3], ['2027-01', 33333, 3, 3]],
    );
    assert.equal(saidas.reduce((soma, s) => soma + s.valorCentavos, 0), 100000);
  });

  it('sem cartões cadastrados, tudo é à vista (comportamento de antes da Fase 02)', () => {
    const [saida] = saidasDoLancamento(compra(5000, '2026-10-20', { parcelas: 3 }));
    assert.deepEqual([saida.mes, saida.valorCentavos, saida.cartao], ['2026-10', 5000, false]);
  });

  it('lançamento antigo, sem o campo parcelas, vale 1 parcela', () => {
    const { parcelas, ...antigo } = compra(5000, '2026-10-20');
    assert.equal(saidasDoLancamento(antigo, [CARTAO]).length, 1);
  });
});

describe('saidasNoMes e faturasDoMes', () => {
  const lancamentos = [
    compra(30000, '2026-10-05', { parcelas: 3 }),          // 100 em nov, dez, jan
    compra(5000, '2026-10-25'),                           // nov
    excluirRegistro(compra(99900, '2026-10-26')),         // excluída: não conta
    criarLancamento({ valorCentavos: 2000, categoriaId: diversos.id, formaPagamento: 'Pix', data: '2026-11-02' }),
  ];

  it('soma o que sai no mês: parcelas do cartão e gastos à vista', () => {
    const novembro = saidasNoMes(lancamentos, [CARTAO], '2026-11');
    assert.equal(novembro.reduce((soma, s) => soma + s.valorCentavos, 0), 10000 + 5000 + 2000);
  });

  it('a fatura de novembro tem as duas compras e vence em 10/11', () => {
    const mes = criarMes({ mes: '2026-11', saldoInicialCentavos: 0 });
    const [fatura] = faturasDoMes(lancamentos, [CARTAO], mes);
    assert.deepEqual(
      [fatura.formaPagamento, fatura.vencimento, fatura.totalCentavos, fatura.itens.length, fatura.status],
      ['Cartão Nubank', '2026-11-10', 15000, 2, 'previsto'],
    );
  });

  it('marcar a fatura como paga vale só naquele mês', () => {
    const estado = { meses: [criarMes({ mes: '2026-11', saldoInicialCentavos: 0 }), criarMes({ mes: '2026-12', saldoInicialCentavos: 0 })] };
    const pago = definirStatusDaFatura(estado, '2026-11', 'Cartão Nubank', 'pago');
    assert.equal(faturasDoMes(lancamentos, [CARTAO], pago.meses[0])[0].status, 'pago');
    assert.equal(faturasDoMes(lancamentos, [CARTAO], pago.meses[1])[0].status, 'previsto');
    assert.throws(() => definirStatusDaFatura(estado, '2026-11', 'Cartão Nubank', 'dispensado'));
  });
});

describe('projetarMeses', () => {
  it('cada mês começa com a sobra do anterior e desconta renda, contas, faturas e orçamentos', () => {
    const lanches = criarCategoria({ nome: 'Lanches', orcamentoCentavos: 20000 });
    const academia = criarFixo({ nome: 'Academia', valorCentavos: 10000, diaVencimento: 5, formaPagamento: 'Pix', mesInicial: '2026-10' });
    const visao = {
      registroMes: criarMes({ mes: '2026-10', saldoInicialCentavos: 50000, rendaPrevistaCentavos: 200000 }),
      fixos: [academia],
      categorias: [lanches, diversos],
      lancamentos: [compra(30000, '2026-10-05', { parcelas: 3 })],
      cartoes: [CARTAO],
    };
    const projecao = projetarMeses(visao, 2);
    // Outubro: 500 + 2000 − 100 = 2400 (a compra só sai em novembro)
    // Novembro: 2400 + 2000 − 100 (academia) − 100 (parcela) − 200 (orçamentos) = 4000
    // Dezembro: 4000 + 2000 − 100 − 100 − 200 = 5600
    assert.deepEqual(projecao.map((m) => [m.mes, m.sobraCentavos]), [
      ['2026-10', 240000], ['2026-11', 400000], ['2026-12', 560000],
    ]);
  });

  it('mesesAteAUltimaSaida conta os meses depois do atual', () => {
    const saidas = saidasDoLancamento(compra(30000, '2026-10-05', { parcelas: 3 }), [CARTAO]);
    assert.equal(mesesAteAUltimaSaida(saidas, '2026-10'), 3);
  });
});

describe('avaliarGasto com cartão', () => {
  const outubro = criarMes({ mes: '2026-10', saldoInicialCentavos: 30000, rendaPrevistaCentavos: 0 });
  const contexto = (lancamento) => ({
    lancamento, categoria: diversos, registroMes: outubro, fixos: [], lancamentos: [],
    cartoes: [CARTAO], categorias: [diversos], hoje: '2026-10-20',
  });

  it('à vista, R$ 400 com R$ 300 na conta: vermelho neste mês', () => {
    const pix = criarLancamento({ valorCentavos: 40000, categoriaId: diversos.id, formaPagamento: 'Pix', data: '2026-10-20' });
    const r = avaliarGasto(contexto(pix));
    assert.equal(r.motivo, 'saldo-negativo');
    assert.equal(r.numeros.estimativa, false);
  });

  it('no cartão, a mesma compra sai em novembro: o saldo de outubro não muda', () => {
    const r = avaliarGasto(contexto(compra(40000, '2026-10-20')));
    // Novembro: 300 (sobra de outubro) + 0 de renda − 400 = −100
    assert.equal(r.numeros.mesDoSaldo, '2026-11');
    assert.equal(r.numeros.estimativa, true);
    assert.equal(r.cor, 'vermelho');
    assert.match(r.frase, /novembro deve fechar em -R\$\u00a0100,00/);
  });

  it('parcelada em 4x de R$ 100: cabe, e o pior mês é o da última parcela', () => {
    const r = avaliarGasto(contexto(compra(40000, '2026-10-20', { parcelas: 4 })));
    // Sobras: nov 200, dez 100, jan 0, fev −100 → o pior é fevereiro
    assert.equal(r.numeros.mesDoSaldo, '2027-02');
    assert.equal(r.numeros.saldoProjetadoCentavos, -10000);
    assert.equal(r.numeros.saidas.length, 4);
  });

  it('a categoria conta o valor inteiro no mês da compra', () => {
    const lanches = criarCategoria({ nome: 'Lanches', orcamentoCentavos: 20000 });
    const ifood = criarLancamento({ valorCentavos: 30000, categoriaId: lanches.id, formaPagamento: 'Cartão Nubank', data: '2026-10-20', parcelas: 3 });
    const r = avaliarGasto({ ...contexto(ifood), categoria: lanches, categorias: [lanches],
      registroMes: criarMes({ mes: '2026-10', saldoInicialCentavos: 500000 }) });
    assert.equal(r.motivo, 'categoria-estourada');
    assert.equal(r.numeros.margem.gastoDepoisCentavos, 30000);
  });
});

describe('limiteDoCartao (parte 2.4)', () => {
  // CARTAO: limite R$ 3.000, fecha dia 3, vence dia 10.
  const mes = (m, extra = {}) => ({ ...criarMes({ mes: m, saldoInicialCentavos: 0 }), ...extra });
  const tresVezes = () => compra(30000, '2026-10-20', { parcelas: 3 }); // faturas de nov, dez e jan

  it('sem compras: o limite inteiro está disponível', () => {
    const r = limiteDoCartao({ cartao: CARTAO, lancamentos: [], registroMes: mes('2026-10') });
    assert.deepEqual(r, {
      limiteCentavos: 300000, emAbertoCentavos: 0, contasFixasCentavos: 0, disponivelCentavos: 300000, fracaoUsada: 0,
    });
  });

  it('compra parcelada ocupa o valor inteiro até as faturas serem pagas', () => {
    const r = limiteDoCartao({ cartao: CARTAO, lancamentos: [tresVezes()], registroMes: mes('2026-10') });
    assert.equal(r.emAbertoCentavos, 30000);
    assert.equal(r.disponivelCentavos, 270000);
    assert.equal(r.fracaoUsada, 0.1);
  });

  it('a fatura do mês atual só libera o limite quando é marcada como Paga', () => {
    const lancamentos = [tresVezes()];
    const prevista = limiteDoCartao({ cartao: CARTAO, lancamentos, registroMes: mes('2026-11') });
    assert.equal(prevista.emAbertoCentavos, 30000);

    const paga = limiteDoCartao({
      cartao: CARTAO, lancamentos, registroMes: mes('2026-11', { statusFaturas: { 'Cartão Nubank': 'pago' } }),
    });
    assert.equal(paga.emAbertoCentavos, 20000); // sobram dezembro e janeiro
  });

  it('faturas de meses que já passaram contam como pagas', () => {
    const r = limiteDoCartao({ cartao: CARTAO, lancamentos: [tresVezes()], registroMes: mes('2026-12') });
    assert.equal(r.emAbertoCentavos, 20000); // novembro passou; dezembro e janeiro em aberto
  });

  it('não conta Pix, outro cartão nem lançamento excluído', () => {
    const pix = criarLancamento({ valorCentavos: 5000, categoriaId: diversos.id, formaPagamento: 'Pix', data: '2026-10-20' });
    const outro = criarLancamento({ valorCentavos: 7000, categoriaId: diversos.id, formaPagamento: 'Cartão Careca', data: '2026-10-20' });
    const excluido = excluirRegistro(compra(9000, '2026-10-20'));
    const r = limiteDoCartao({ cartao: CARTAO, lancamentos: [pix, outro, excluido], registroMes: mes('2026-10') });
    assert.equal(r.emAbertoCentavos, 0);
  });

  it('compra convertida de conta fixa: só as parcelas que faltam ocupam o limite', () => {
    const remador = {
      ...compra(141036, '2026-10-10', { parcelas: 12 }),
      conversao: { fixoId: 'f1', primeiraFatura: '2026-08', parcelasPagas: 2, mesFinalAnterior: '2027-07' },
    };
    const r = limiteDoCartao({ cartao: CARTAO, lancamentos: [remador], registroMes: mes('2026-10') });
    assert.equal(r.emAbertoCentavos, 117530); // parcelas 3 a 12
  });

  it('compras acima do limite deixam o disponível negativo', () => {
    const grande = compra(350000, '2026-10-20');
    const r = limiteDoCartao({ cartao: CARTAO, lancamentos: [grande], registroMes: mes('2026-10') });
    assert.equal(r.disponivelCentavos, -50000);
  });
});

describe('contas fixas no cartão ocupam o limite', () => {
  // CARTAO (Cartão Nubank): limite R$ 3.000, fecha dia 3, vence dia 10. Hoje: 10/10/2026.
  // A conta fixa de um mês faz parte da fatura que vence naquele mês.
  const outubro = (extra = {}) => ({ ...criarMes({ mes: '2026-10', saldoInicialCentavos: 0 }), ...extra });
  const claude = (forma = 'Cartão Nubank') => criarFixo({
    nome: 'Claude', valorCentavos: 11000, diaVencimento: 10, formaPagamento: forma, mesInicial: '2026-01',
  });
  const limite = (fixos, extra = {}) => limiteDoCartao({
    cartao: CARTAO, lancamentos: [], registroMes: outubro(), fixos, hoje: '2026-10-10', ...extra,
  });

  it('fechamentoDaFatura: no mesmo mês ou no mês anterior ao vencimento', () => {
    assert.equal(fechamentoDaFatura(CARTAO, '2026-10'), '2026-10-03');
    const viraMes = criarCartao({ formaPagamento: 'X', limiteCentavos: 100, diaFechamento: 28, diaVencimento: 5 });
    assert.equal(fechamentoDaFatura(viraMes, '2026-10'), '2026-09-28');
  });

  it('depois do fechamento: a conta deste mês e a do mês seguinte ocupam o limite', () => {
    const contas = contasFixasNasFaturas({ cartao: CARTAO, fixos: [claude()], registroMes: outubro(), hoje: '2026-10-10' });
    assert.deepEqual(contas.map((c) => c.mesFatura), ['2026-10', '2026-11']);

    const r = limite([claude()]);
    assert.equal(r.contasFixasCentavos, 22000);
    assert.equal(r.emAbertoCentavos, 22000);
    assert.equal(r.disponivelCentavos, 278000);
  });

  it('antes do fechamento: só a conta deste mês', () => {
    assert.equal(limite([claude()], { hoje: '2026-10-02' }).contasFixasCentavos, 11000);
  });

  it('sem "hoje", conta como fim do mês (as duas)', () => {
    assert.equal(limite([claude()], { hoje: undefined }).contasFixasCentavos, 22000);
  });

  it('pagar a fatura de outubro libera a conta de outubro', () => {
    const r = limite([claude()], { registroMes: outubro({ statusFaturas: { 'Cartão Nubank': 'pago' } }) });
    assert.equal(r.contasFixasCentavos, 11000); // fica só a de novembro
  });

  it('conta dispensada no mês não ocupa limite', () => {
    const fixo = claude();
    const r = limite([fixo], { registroMes: outubro({ statusFixos: { [fixo.id]: 'dispensado' } }) });
    assert.equal(r.contasFixasCentavos, 11000); // só a de novembro
  });

  it('valor ajustado no mês vale para aquele mês', () => {
    const fixo = claude();
    const r = limite([fixo], { registroMes: outubro({ ajustesFixos: { [fixo.id]: 12500 } }) });
    assert.equal(r.contasFixasCentavos, 23500); // 125 (outubro) + 110 (novembro)
  });

  it('parcela que termina neste mês não conta no mês seguinte', () => {
    const anel = criarFixo({
      nome: 'Anel', valorCentavos: 9250, diaVencimento: 10, formaPagamento: 'Cartão Nubank', mesInicial: '2026-07', mesFinal: '2026-10',
    });
    assert.equal(limite([anel]).contasFixasCentavos, 9250);
  });

  it('conta convertida (termina no mês anterior) não conta: as parcelas dela já estão na compra', () => {
    const remador = criarFixo({
      nome: 'Remador', valorCentavos: 11753, diaVencimento: 10, formaPagamento: 'Cartão Nubank', mesInicial: '2026-08', mesFinal: '2026-09',
    });
    assert.equal(limite([remador]).contasFixasCentavos, 0);
  });

  it('conta fixa de outra forma de pagamento não conta', () => {
    assert.equal(limite([claude('Pix')]).contasFixasCentavos, 0);
  });

  it('compras e contas fixas somam no "em aberto"', () => {
    const r = limiteDoCartao({
      cartao: CARTAO, lancamentos: [compra(30000, '2026-10-20', { parcelas: 3 })], registroMes: outubro(),
      fixos: [claude()], hoje: '2026-10-10',
    });
    assert.equal(r.emAbertoCentavos, 52000);
    assert.equal(r.contasFixasCentavos, 22000);
  });
});

describe('faturasDoMes: conferência com a fatura do banco', () => {
  // CARTAO: Cartão Nubank, vence dia 10. Outubro de 2026.
  const outubro = (extra = {}) => ({ ...criarMes({ mes: '2026-10', saldoInicialCentavos: 0 }), ...extra });
  const fixo = (nome, valorCentavos, formaPagamento = 'Cartão Nubank') => criarFixo({
    nome, valorCentavos, diaVencimento: 10, formaPagamento, mesInicial: '2026-01',
  });

  it('lista as contas fixas do cartão fora do total, e soma tudo no "total no banco"', () => {
    const claude = fixo('Claude', 11000);
    const academia = fixo('Academia', 9990, 'Pix');
    const [fatura] = faturasDoMes([compra(5000, '2026-09-20')], [CARTAO], outubro(), [claude, academia]);

    assert.equal(fatura.totalCentavos, 5000); // só as compras: o saldo já conta o Claude como conta fixa
    assert.deepEqual(fatura.contasFixas.map((c) => [c.fixo.nome, c.valorCentavos]), [['Claude', 11000]]);
    assert.equal(fatura.contasFixasCentavos, 11000);
    assert.equal(fatura.totalNoBancoCentavos, 16000);
  });

  it('cartão só com contas fixas também tem fatura (sem compras)', () => {
    const [fatura] = faturasDoMes([], [CARTAO], outubro(), [fixo('Claude', 11000)]);
    assert.equal(fatura.itens.length, 0);
    assert.equal(fatura.totalCentavos, 0);
    assert.equal(fatura.totalNoBancoCentavos, 11000);
  });

  it('conta dispensada no mês fica de fora; valor ajustado vale', () => {
    const claude = fixo('Claude', 11000);
    const anel = fixo('Anel', 9250);
    const mes = outubro({ statusFixos: { [anel.id]: 'dispensado' }, ajustesFixos: { [claude.id]: 12000 } });
    const [fatura] = faturasDoMes([], [CARTAO], mes, [claude, anel]);
    assert.deepEqual(fatura.contasFixas.map((c) => [c.fixo.nome, c.valorCentavos]), [['Claude', 12000]]);
  });

  it('sem a lista de fixos: igual a antes (nenhuma conta fixa, cartão sem compra não aparece)', () => {
    assert.deepEqual(faturasDoMes([], [CARTAO], outubro()), []);
    const [fatura] = faturasDoMes([compra(5000, '2026-09-20')], [CARTAO], outubro());
    assert.deepEqual(fatura.contasFixas, []);
    assert.equal(fatura.totalNoBancoCentavos, 5000);
  });
});
