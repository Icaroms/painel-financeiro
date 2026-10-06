/**
 * Testes das regras do veredito.
 * Rodar com: npm test
 *
 * Cenário FICTÍCIO de novembro de 2026 (30 dias), usado em todos os testes:
 *
 * Fixos ativos em novembro (total R$ 389,80):
 * - Academia ............ R$  99,90
 * - Streaming ........... R$  39,90
 * - Consulta ............ R$ 250,00 (valor padrão 0, ajustado só em novembro)
 * Fixo que NÃO conta:
 * - Fone (parcelado) .... R$ 150,00, última parcela em outubro
 *
 * Categorias:
 * - Lanches ...... orçamento R$ 200,00
 * - Transporte ... orçamento R$ 300,00
 * - Diversos ..... sem orçamento (zero)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  criarCategoria,
  criarFixo,
  criarLancamento,
  criarMes,
  ajustarFixoNoMes,
  excluirRegistro,
} from '../src/modelo.js';
import { avaliarGasto, calcularRitmo, LIMITES_PADRAO } from '../src/veredito.js';

/* ------------------------------------------------------------------ */
/* Montagem do cenário                                                */
/* ------------------------------------------------------------------ */

const AGORA = new Date('2026-11-01T12:00:00.000Z');

/** Gera ids previsíveis: "id-1", "id-2"... */
function geradorDeIds() {
  let contador = 0;
  return () => `id-${++contador}`;
}

const opcoes = { agora: AGORA, gerarId: geradorDeIds() };

const lanches = criarCategoria({ nome: 'Lanches', orcamentoCentavos: 20000 }, opcoes);
const transporte = criarCategoria({ nome: 'Transporte', orcamentoCentavos: 30000 }, opcoes);
const diversos = criarCategoria({ nome: 'Diversos', orcamentoCentavos: 0 }, opcoes);

const academia = criarFixo(
  { nome: 'Academia', valorCentavos: 9990, diaVencimento: 5, formaPagamento: 'Pix', mesInicial: '2026-01' },
  opcoes,
);
const streaming = criarFixo(
  { nome: 'Streaming', valorCentavos: 3990, diaVencimento: 12, formaPagamento: 'Cartão', mesInicial: '2026-01' },
  opcoes,
);
const consulta = criarFixo(
  { nome: 'Consulta', valorCentavos: 0, diaVencimento: 1, formaPagamento: 'Pix', mesInicial: '2026-01' },
  opcoes,
);
const fone = criarFixo(
  {
    nome: 'Fone (parcelado)', valorCentavos: 15000, diaVencimento: 7,
    formaPagamento: 'Cartão', mesInicial: '2026-08', mesFinal: '2026-10',
  },
  opcoes,
);
const FIXOS = [academia, streaming, consulta, fone];
const TOTAL_FIXOS_NOVEMBRO = 9990 + 3990 + 25000; // 38980

/** Mês de novembro com o saldo inicial pedido e a consulta ajustada. */
function novembro(saldoInicialCentavos) {
  const mes = criarMes({ mes: '2026-11', saldoInicialCentavos }, opcoes);
  return ajustarFixoNoMes(mes, consulta, 25000, { agora: AGORA });
}

/** Atalho para criar um lançamento do cenário. */
function gasto(categoria, valorCentavos, data) {
  return criarLancamento(
    { valorCentavos, categoriaId: categoria.id, formaPagamento: 'Pix', data },
    opcoes,
  );
}

/* ------------------------------------------------------------------ */
/* Verde                                                              */
/* ------------------------------------------------------------------ */

describe('veredito verde', () => {
  it('categoria com margem, ritmo tranquilo e saldo folgado', () => {
    // Dia 15 = 50% do mês. Lanches: R$ 50 + R$ 20 = 35% do orçamento.
    const resultado = avaliarGasto({
      lancamento: gasto(lanches, 2000, '2026-11-15'),
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [gasto(lanches, 5000, '2026-11-03')],
    });

    assert.equal(resultado.cor, 'verde');
    assert.equal(resultado.motivo, 'dentro-do-previsto');
    assert.equal(resultado.frase, 'Ainda cabe: sobram R$\u00a0130,00 em Lanches.');
    assert.equal(resultado.numeros.margem.margemCentavos, 13000);
    // 1500,00 − 389,80 − 50,00 − 20,00 = 1040,20
    assert.equal(resultado.numeros.saldoProjetadoCentavos, 104020);
  });

  it('categoria sem orçamento mostra o saldo na frase', () => {
    const resultado = avaliarGasto({
      lancamento: gasto(diversos, 1000, '2026-11-15'),
      categoria: diversos,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [],
    });

    assert.equal(resultado.cor, 'verde');
    assert.equal(resultado.numeros.margem, null);
    assert.equal(resultado.numeros.ritmo, null);
    // 1500,00 − 389,80 − 10,00 = 1100,20
    assert.equal(resultado.frase, 'Ainda cabe: o saldo fecha o mês em R$\u00a01.100,20.');
  });
});

/* ------------------------------------------------------------------ */
/* Amarelo                                                            */
/* ------------------------------------------------------------------ */

describe('veredito amarelo', () => {
  it('ritmo acelerado: 70% do orçamento usado no dia 10', () => {
    // Dia 10 = 33,3% do mês. Lanches: R$ 100 + R$ 40 = 70%. São 36,7 pontos à frente.
    const resultado = avaliarGasto({
      lancamento: gasto(lanches, 4000, '2026-11-10'),
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [gasto(lanches, 10000, '2026-11-02')],
    });

    assert.equal(resultado.cor, 'amarelo');
    assert.equal(resultado.motivo, 'ritmo-acelerado');
    assert.equal(resultado.frase, 'Atenção: Lanches está acelerado. Sobram R$\u00a060,00.');
  });

  it('saldo projetado abaixo do colchão de R$ 200', () => {
    // 600,00 − 389,80 − 20,00 = 190,20
    const resultado = avaliarGasto({
      lancamento: gasto(diversos, 2000, '2026-11-15'),
      categoria: diversos,
      registroMes: novembro(60000),
      fixos: FIXOS,
      lancamentos: [],
    });

    assert.equal(resultado.cor, 'amarelo');
    assert.equal(resultado.motivo, 'saldo-apertado');
    assert.equal(resultado.frase, 'Atenção: o saldo fecha o mês em R$\u00a0190,20.');
  });
});

/* ------------------------------------------------------------------ */
/* Vermelho                                                           */
/* ------------------------------------------------------------------ */

describe('veredito vermelho', () => {
  it('categoria estourada', () => {
    // Lanches: R$ 180 + R$ 30 = R$ 210, passa R$ 10 dos R$ 200.
    const resultado = avaliarGasto({
      lancamento: gasto(lanches, 3000, '2026-11-28'),
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [gasto(lanches, 18000, '2026-11-20')],
    });

    assert.equal(resultado.cor, 'vermelho');
    assert.equal(resultado.motivo, 'categoria-estourada');
    assert.equal(resultado.frase, 'Passou: Lanches estourou em R$\u00a010,00.');
  });

  it('saldo negativo, mesmo em categoria sem orçamento', () => {
    // 1500,00 − 389,80 − 1200,00 = −89,80
    const resultado = avaliarGasto({
      lancamento: gasto(diversos, 120000, '2026-11-15'),
      categoria: diversos,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [],
    });

    assert.equal(resultado.cor, 'vermelho');
    assert.equal(resultado.motivo, 'saldo-negativo');
    assert.equal(resultado.frase, 'Passou: o saldo fecha o mês em -R$\u00a089,80.');
  });

  it('saldo negativo vence a margem da categoria (prioridade)', () => {
    // Transporte ainda teria R$ 50 de margem (250 de 300),
    // mas o saldo fica 500,00 − 389,80 − 250,00 = −139,80.
    const resultado = avaliarGasto({
      lancamento: gasto(transporte, 25000, '2026-11-28'),
      categoria: transporte,
      registroMes: novembro(50000),
      fixos: FIXOS,
      lancamentos: [],
    });

    assert.equal(resultado.numeros.margem.margemCentavos, 5000);
    assert.equal(resultado.cor, 'vermelho');
    assert.equal(resultado.motivo, 'saldo-negativo');
  });
});

/* ------------------------------------------------------------------ */
/* Limites exatos                                                     */
/* ------------------------------------------------------------------ */

describe('limites exatos', () => {
  it('exatamente 15 pontos à frente ainda é verde (precisa ser MAIS de 15)', () => {
    // Dia 6 = 20% do mês. Lanches: R$ 70 = 35%. Diferença: 15 pontos.
    const resultado = avaliarGasto({
      lancamento: gasto(lanches, 7000, '2026-11-06'),
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [],
    });
    assert.equal(resultado.cor, 'verde');
  });

  it('um centavo a mais que 15 pontos já é amarelo', () => {
    const resultado = avaliarGasto({
      lancamento: gasto(lanches, 7001, '2026-11-06'),
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [],
    });
    assert.equal(resultado.motivo, 'ritmo-acelerado');
  });

  it('saldo projetado de exatamente R$ 200 ainda é verde', () => {
    // 600,00 − 389,80 − 10,20 = 200,00
    const resultado = avaliarGasto({
      lancamento: gasto(diversos, 1020, '2026-11-15'),
      categoria: diversos,
      registroMes: novembro(60000),
      fixos: FIXOS,
      lancamentos: [],
    });
    assert.equal(resultado.numeros.saldoProjetadoCentavos, 20000);
    assert.equal(resultado.cor, 'verde');
  });

  it('margem de exatamente zero não estoura a categoria', () => {
    const resultado = avaliarGasto({
      lancamento: gasto(lanches, 2000, '2026-11-30'),
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [gasto(lanches, 18000, '2026-11-20')],
    });
    assert.equal(resultado.numeros.margem.margemCentavos, 0);
    assert.notEqual(resultado.motivo, 'categoria-estourada');
  });
});

/* ------------------------------------------------------------------ */
/* O que entra e o que não entra na conta                             */
/* ------------------------------------------------------------------ */

describe('o que entra na conta', () => {
  it('fixo encerrado não conta; ajuste do mês conta', () => {
    const resultado = avaliarGasto({
      lancamento: gasto(diversos, 1000, '2026-11-15'),
      categoria: diversos,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [],
    });
    assert.equal(resultado.numeros.totalFixosCentavos, TOTAL_FIXOS_NOVEMBRO);
  });

  it('ignora lançamentos excluídos, de outro mês e o próprio gasto novo', () => {
    const novo = gasto(lanches, 2000, '2026-11-15');
    const excluido = excluirRegistro(gasto(lanches, 10000, '2026-11-03'), { agora: AGORA });
    const outubro = gasto(lanches, 10000, '2026-10-20');

    const resultado = avaliarGasto({
      lancamento: novo,
      categoria: lanches,
      registroMes: novembro(150000),
      fixos: FIXOS,
      lancamentos: [excluido, outubro, novo],
    });

    assert.equal(resultado.numeros.margem.gastoAntesCentavos, 0);
    assert.equal(resultado.numeros.totalLancamentosCentavos, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Erros e limites configuráveis                                      */
/* ------------------------------------------------------------------ */

describe('validações do veredito', () => {
  it('rejeita lançamento de outra categoria', () => {
    assert.throws(
      () => avaliarGasto({
        lancamento: gasto(lanches, 1000, '2026-11-15'),
        categoria: transporte,
        registroMes: novembro(150000),
        fixos: FIXOS,
        lancamentos: [],
      }),
      { name: 'ErroValidacao', campo: 'categoriaId' },
    );
  });

  it('rejeita lançamento de outro mês', () => {
    assert.throws(
      () => avaliarGasto({
        lancamento: gasto(lanches, 1000, '2026-12-01'),
        categoria: lanches,
        registroMes: novembro(150000),
        fixos: FIXOS,
        lancamentos: [],
      }),
      { name: 'ErroValidacao', campo: 'data' },
    );
  });
});

describe('limites configuráveis', () => {
  it('os limites padrão são os escolhidos para o MVP', () => {
    assert.equal(LIMITES_PADRAO.toleranciaRitmoPontos, 15);
    assert.equal(LIMITES_PADRAO.colchaoSaldoCentavos, 20000);
  });

  it('uma tolerância maior deixa o mesmo gasto verde', () => {
    const resultado = avaliarGasto(
      {
        lancamento: gasto(lanches, 4000, '2026-11-10'),
        categoria: lanches,
        registroMes: novembro(150000),
        fixos: FIXOS,
        lancamentos: [gasto(lanches, 10000, '2026-11-02')],
      },
      { ...LIMITES_PADRAO, toleranciaRitmoPontos: 40 },
    );
    assert.equal(resultado.cor, 'verde');
  });
});

describe('calcularRitmo', () => {
  it('calcula os percentuais para exibição', () => {
    const ritmo = calcularRitmo(20000, 14000, '2026-11-10', 15);
    assert.equal(ritmo.percentualUsado, 70);
    assert.ok(Math.abs(ritmo.percentualDoMes - 33.33) < 0.01);
    assert.ok(Math.abs(ritmo.pontosAFrente - 36.67) < 0.01);
    assert.equal(ritmo.acelerado, true);
  });
});
