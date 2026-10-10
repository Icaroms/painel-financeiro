/**
 * Testes do simulador de compras (Fase 02, parte 2.5).
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS. Hoje é 10/10/2026. O cartão fecha dia 3 e vence dia 10,
 * com limite de R$ 10.000.
 *
 * O cenário foi montado para o "melhor momento" ter resposta clara:
 * - outubro fecha com R$ 1.000 de sobra;
 * - renda R$ 2.800; aluguel R$ 800; orçamentos R$ 1.500 por mês;
 * - Ferramentas, R$ 500 por mês (Pix), termina em novembro.
 * Então a sobra fica parada até novembro e sobe R$ 500 por mês depois.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { simularCompra, simularOpcao, taxaMensalEquivalente, MESES_DE_ESPERA_MAXIMOS } from '../src/simulador.js';
import { criarCartao } from '../src/cartoes.js';
import { criarCategoria, criarFixo, criarMes, criarLancamento } from '../src/modelo.js';
import { dadosDoMes } from '../src/meses.js';
import { projetarMeses } from '../src/fluxo.js';

const HOJE = '2026-10-10';
const MES = '2026-10';
const CARTAO = criarCartao({ formaPagamento: 'Cartão Nubank', limiteCentavos: 1000000, diaFechamento: 3, diaVencimento: 10 });

function estadoDeTeste({ limiteCentavos = 1000000 } = {}) {
  return {
    // −500 + 2.800 − 800 − 500 = R$ 1.000 de sobra em outubro
    meses: [criarMes({ mes: MES, saldoInicialCentavos: -50000, rendaPrevistaCentavos: 280000 })],
    categorias: [criarCategoria({ nome: 'Dia a dia', orcamentoCentavos: 150000 })],
    fixos: [
      criarFixo({ nome: 'Aluguel', valorCentavos: 80000, diaVencimento: 5, formaPagamento: 'Pix', mesInicial: '2026-01' }),
      criarFixo({
        nome: 'Ferramentas', valorCentavos: 50000, diaVencimento: 10, formaPagamento: 'Pix', mesInicial: '2026-09', mesFinal: '2026-11',
      }),
    ],
    lancamentos: [],
    formasPagamento: ['Pix', 'Cartão Nubank'],
    cartoes: [{ ...CARTAO, limiteCentavos }],
  };
}

const visao = (estado = estadoDeTeste()) => dadosDoMes(estado, MES);
const simular = (aVistaCentavos, opcoes = [], estado) => simularCompra(visao(estado), {
  formaPagamento: 'Cartão Nubank', aVistaCentavos, opcoes, hoje: HOJE,
});

describe('taxaMensalEquivalente', () => {
  it('o exemplo do documento: R$ 1.000 à vista ou 10x de R$ 115 → cerca de 2,6% ao mês', () => {
    const taxa = taxaMensalEquivalente(100000, 10, 115000);
    assert.ok(Math.abs(taxa - 0.02625) < 0.0001, `taxa ${taxa}`);
  });

  it('sem juros (total igual ou menor que o à vista) ou 1x: zero', () => {
    assert.equal(taxaMensalEquivalente(100000, 10, 100000), 0);
    assert.equal(taxaMensalEquivalente(100000, 10, 95000), 0);
    assert.equal(taxaMensalEquivalente(100000, 1, 120000), 0);
  });

  it('confere: as parcelas trazidas para hoje com a taxa valem o preço à vista', () => {
    const taxa = taxaMensalEquivalente(300000, 12, 360000);
    const parcela = 360000 / 12;
    const valorHoje = parcela * (1 - (1 + taxa) ** -12) / taxa;
    assert.ok(Math.abs(valorHoje - 300000) < 1);
  });
});

describe('simularCompra: as opções', () => {
  it('a primeira opção é sempre o à vista no cartão (1x)', () => {
    const { opcoes } = simular(100000, [{ parcelas: 10, totalCentavos: 115000 }]);
    assert.equal(opcoes.length, 2);
    assert.equal(opcoes[0].parcelas, 1);
    assert.equal(opcoes[0].totalCentavos, 100000);
    assert.equal(opcoes[0].jurosCentavos, 0);
    assert.equal(opcoes[1].parcelas, 10);
  });

  it('juros em reais, valor e 1º vencimento das parcelas', () => {
    const [, dezVezes] = simular(100000, [{ parcelas: 10, totalCentavos: 115000 }]).opcoes;
    assert.equal(dezVezes.jurosCentavos, 15000);
    assert.equal(dezVezes.valorParcelaCentavos, 11500);
    assert.equal(dezVezes.primeiroVencimento, '2026-11-10'); // compra em 10/10, depois do fechamento do dia 3
  });

  it('parcela com resto: a 1ª tem os centavos a mais', () => {
    const [, tresVezes] = simular(100000, [{ parcelas: 3, totalCentavos: 100000 }]).opcoes;
    assert.equal(tresVezes.primeiraParcelaCentavos, 33334);
    assert.equal(tresVezes.valorParcelaCentavos, 33333);
  });

  it('não grava nada: o estado continua igual', () => {
    const estado = estadoDeTeste();
    const copia = structuredClone(estado);
    simular(100000, [{ parcelas: 10, totalCentavos: 115000 }], estado);
    assert.deepEqual(estado, copia);
  });
});

describe('peso em cada mês', () => {
  it('mostra os meses com parcela, sem e com a compra (a mesma projeção do app)', () => {
    const [, tresVezes] = simular(90000, [{ parcelas: 3, totalCentavos: 90000 }]).opcoes;
    assert.deepEqual(tresVezes.meses.map((m) => m.mes), ['2026-11', '2026-12', '2027-01']);

    const sem = projetarMeses(visao(), 3);
    assert.deepEqual(tresVezes.meses.map((m) => m.semCompraCentavos), sem.slice(1).map((m) => m.sobraCentavos));
    // Novembro: R$ 1.000 sem a compra, R$ 700 com a 1ª parcela.
    assert.equal(tresVezes.meses[0].semCompraCentavos, 100000);
    assert.equal(tresVezes.meses[0].comCompraCentavos, 70000);
    assert.equal(tresVezes.meses[0].parcelaCentavos, 30000);
  });

  it('pior mês entre os meses com parcela, marcado como estimativa', () => {
    const [, tresVezes] = simular(90000, [{ parcelas: 3, totalCentavos: 90000 }]).opcoes;
    // Nov 700; Dez 1.500 − 600 = 900; Jan 2.000 − 900 = 1.100 → o pior é novembro.
    assert.deepEqual(tresVezes.piorMes, { mes: '2026-11', sobraCentavos: 70000 });
    assert.equal(tresVezes.estimativa, true);
  });
});

describe('limite do cartão', () => {
  it('a compra inteira ocupa o limite, mesmo parcelada', () => {
    const [, dezVezes] = simular(100000, [{ parcelas: 10, totalCentavos: 115000 }]).opcoes;
    assert.equal(dezVezes.limite.disponivelAntesCentavos, 1000000);
    assert.equal(dezVezes.limite.disponivelDepoisCentavos, 885000);
  });

  it('passou do limite: vermelho', () => {
    const [aVista] = simular(150000, [], estadoDeTeste({ limiteCentavos: 100000 })).opcoes;
    assert.equal(aVista.limite.disponivelDepoisCentavos, -50000);
    assert.equal(aVista.cor, 'vermelho');
  });

  it('sobra menos de 10% do limite: amarelo (com os meses folgados)', () => {
    const [aVista] = simular(20000, [], estadoDeTeste({ limiteCentavos: 21000 })).opcoes;
    assert.equal(aVista.limite.disponivelDepoisCentavos, 1000);
    assert.equal(aVista.cor, 'amarelo');
  });
});

describe('cor e melhor momento', () => {
  it('cabe agora: verde, sem espera', () => {
    const [, tresVezes] = simular(90000, [{ parcelas: 3, totalCentavos: 90000 }]).opcoes;
    assert.equal(tresVezes.cor, 'verde');
    assert.deepEqual(tresVezes.melhorMomento, { esperaMeses: 0, mesDaCompra: MES, terminam: [] });
  });

  it('não cabe agora, mas cabe depois que a Ferramentas termina', () => {
    // 12x de R$ 600. Comprando agora, o pior mês fica em −R$ 700; em dezembro, o pior é R$ 300.
    const [, dozeVezes] = simular(720000, [{ parcelas: 12, totalCentavos: 720000 }]).opcoes;
    assert.equal(dozeVezes.cor, 'vermelho');
    assert.equal(dozeVezes.piorMes.sobraCentavos, -70000);
    assert.deepEqual(dozeVezes.melhorMomento, {
      esperaMeses: 2, mesDaCompra: '2026-12', terminam: [{ nome: 'Ferramentas', mes: '2026-11' }],
    });
  });

  it('não cabe nos próximos 12 meses: esperaMeses null', () => {
    const [aVista] = simular(5000000, [], estadoDeTeste({ limiteCentavos: 9000000 })).opcoes;
    assert.equal(aVista.melhorMomento.esperaMeses, null);
    assert.equal(MESES_DE_ESPERA_MAXIMOS, 12);
  });

  it('compra parcelada no cartão que termina também explica o melhor momento', () => {
    // Sem a Ferramentas; no lugar dela, um Celular em 2x de R$ 500 no cartão (faturas de novembro e dezembro).
    const estado = estadoDeTeste();
    estado.fixos = estado.fixos.filter((f) => f.nome !== 'Ferramentas');
    estado.lancamentos.push(criarLancamento({
      valorCentavos: 100000, categoriaId: estado.categorias[0].id, formaPagamento: 'Cartão Nubank',
      data: '2026-10-05', parcelas: 2, descricao: 'Celular',
    }));
    const r = simularOpcao(visao(estado), {
      cartao: CARTAO, aVistaCentavos: 720000, parcelas: 12, totalCentavos: 720000, hoje: HOJE,
    });
    // Comprando em dezembro, a 1ª parcela é em janeiro: o Celular terminou em dezembro.
    assert.deepEqual(r.melhorMomento, {
      esperaMeses: 2, mesDaCompra: '2026-12', terminam: [{ nome: 'Celular', mes: '2026-12' }],
    });
  });
});

describe('simularCompra: entrada inválida', () => {
  it('sem cartão, sem preço, parcelas fora do limite ou total zero: erro claro', () => {
    const v = visao();
    assert.throws(() => simularCompra(v, { formaPagamento: 'Pix', aVistaCentavos: 100, hoje: HOJE }), /cartão cadastrado/);
    assert.throws(() => simularCompra(v, { formaPagamento: 'Cartão Nubank', aVistaCentavos: 0, hoje: HOJE }), /preço à vista/);
    assert.throws(() => simular(100000, [{ parcelas: 25, totalCentavos: 100000 }]), /de 2 a 24/);
    assert.throws(() => simular(100000, [{ parcelas: 1, totalCentavos: 100000 }]), /de 2 a 24/);
    assert.throws(() => simular(100000, [{ parcelas: 3, totalCentavos: 0 }]), /maior que zero/);
    const cinco = Array.from({ length: 5 }, () => ({ parcelas: 3, totalCentavos: 100000 }));
    assert.throws(() => simular(100000, cinco), /até 4 opções/);
  });
});
