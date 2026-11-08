/**
 * Testes dos lembretes de vencimento (11/2026). Rodar com: npm test
 * Dados FICTÍCIOS. Hoje é 09/11/2026.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { lembretesDeVencimento, lembretesNovos, chaveAvisada, diaSeguinte } from '../src/lembretes.js';
import { resumoDoInicio } from '../src/resumo-inicio.js';
import { criarCartao } from '../src/cartoes.js';
import { criarCategoria, criarFixo, criarMes, criarLancamento } from '../src/modelo.js';
import { definirStatusDoFixo } from '../src/fixos.js';

const HOJE = '2026-11-09';
const CARTAO = criarCartao({ formaPagamento: 'Cartão Careca', limiteCentavos: 850000, diaFechamento: 3, diaVencimento: 10 });
const lazer = criarCategoria({ nome: 'Lazer', orcamentoCentavos: 30000 });
const fixo = (nome, valor, dia, forma = 'Pix') => criarFixo({
  nome, valorCentavos: valor, diaVencimento: dia, formaPagamento: forma, mesInicial: '2026-01',
});

function estado() {
  return {
    meses: [criarMes({ mes: '2026-11', saldoInicialCentavos: 66663 })],
    categorias: [lazer],
    fixos: [
      fixo('Plano Claro', 3490, 3), // atrasada (venceu dia 3)
      fixo('Youtube', 1600, 9), // vence hoje
      fixo('Faculdade ADS', 16492, 10), // vence amanhã
      fixo('Amazon Prime', 1990, 12), // depois
      fixo('Claude', 11851, 10, 'Cartão Careca'), // no cartão: aparece no dia dela, a fatura só com compras
    ],
    lancamentos: [
      // Compra de 20/10, depois do fechamento de 03/10 → fatura de novembro, que vence em 10/11
      criarLancamento({ valorCentavos: 6200, categoriaId: lazer.id, formaPagamento: 'Cartão Careca', data: '2026-10-20' }),
    ],
    formasPagamento: ['Pix', 'Cartão Careca'],
    cartoes: [CARTAO],
  };
}

describe('diaSeguinte', () => {
  it('vira o mês e o ano', () => {
    assert.equal(diaSeguinte('2026-11-09'), '2026-11-10');
    assert.equal(diaSeguinte('2026-11-30'), '2026-12-01');
    assert.equal(diaSeguinte('2026-12-31'), '2027-01-01');
  });
});

describe('lembretesDeVencimento', () => {
  it('atrasadas primeiro, depois hoje, depois amanhã; pagas e futuras ficam de fora', () => {
    const l = lembretesDeVencimento(estado(), HOJE);
    assert.deepEqual(l.map((x) => [x.quando, x.nome]), [
      ['atrasado', 'Plano Claro'],
      ['hoje', 'Youtube'],
      ['amanha', 'Claude'],
      ['amanha', 'Faculdade ADS'],
      ['amanha', 'Fatura Cartão Careca'],
    ]);
    assert.equal(l[1].titulo, 'Vence hoje: Youtube');
    assert.match(l[0].texto, /venceu em 03\/11/);
  });

  it('conta marcada como paga não gera lembrete', () => {
    const e = estado();
    const id = e.fixos.find((f) => f.nome === 'Plano Claro').id;
    const pago = definirStatusDoFixo(e, '2026-11', id, 'pago');
    assert.ok(!lembretesDeVencimento(pago, HOJE).some((x) => x.nome === 'Plano Claro'));
  });

  it('no último dia do mês, "amanhã" é do mês seguinte (previsão)', () => {
    const e = estado();
    e.fixos.push(fixo('Aluguel', 80000, 1));
    const l = lembretesDeVencimento(e, '2026-11-30');
    assert.ok(l.some((x) => x.quando === 'amanha' && x.nome === 'Aluguel' && x.data === '2026-12-01'));
  });

  it('não repete: só os ainda não avisados; "amanhã" e "hoje" são avisos diferentes', () => {
    const l = lembretesDeVencimento(estado(), HOJE);
    const avisados = [chaveAvisada(l[0]), chaveAvisada(l[1])];
    assert.equal(lembretesNovos(l, avisados).length, l.length - 2);
    const amanha = l.find((x) => x.quando === 'amanha');
    assert.notEqual(chaveAvisada(amanha), chaveAvisada({ ...amanha, quando: 'hoje' }));
  });
});

describe('Início: próximas saídas e aviso de vencimento', () => {
  it('conta no cartão não é contada duas vezes (fatura só com as compras)', () => {
    const r = resumoDoInicio(estado(), HOJE);
    // As 4 primeiras: Plano Claro (03), Youtube (09), Claude e Faculdade (10)... a fatura também vence em 10/11.
    const fatura = resumoDoInicio(estado(), HOJE).proximas;
    const nomes = fatura.map((s) => s.nome);
    assert.equal(nomes.filter((n) => n === 'Claude').length, 1, 'a conta do cartão aparece uma vez só');
    const daFatura = r.proximas.find((s) => s.nome === 'Fatura Cartão Careca');
    if (daFatura) assert.equal(daFatura.valorCentavos, 6200, 'a fatura não soma de novo a conta do cartão');
  });

  it('aviso "vence hoje ou amanhã" leva ao calendário', () => {
    const r = resumoDoInicio(estado(), HOJE);
    const aviso = r.avisos.find((a) => a.id === 'vencendo');
    assert.equal(aviso.link, '#planejar/calendario');
    assert.match(aviso.texto, /vencem hoje ou amanhã/);
  });
});
