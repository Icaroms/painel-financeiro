/**
 * Testes do histórico de gastos.
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS. Calendário usado:
 * - semana de 19/10 a 25/10 (segunda a domingo)
 * - semana de 26/10 a 01/11 (atravessa outubro e novembro)
 * - semana de 02/11 a 08/11
 * - semana de 09/11 a 15/11 (a de "hoje", 11/11)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  categoriasDoHistorico,
  mesesDoHistorico,
  filtrarGastos,
  semanasDeGastos,
  gastoDaSemanaAtual,
  paginar,
  ITENS_POR_PAGINA,
} from '../src/historico.js';
import { criarCategoria, criarLancamento, criarMes, excluirRegistro } from '../src/modelo.js';
import { removerCategoria } from '../src/configuracao.js';

const HOJE = '2026-11-11';

function cenario() {
  const transporte = criarCategoria({ nome: 'Transporte', orcamentoCentavos: 30000 });
  const lanches = criarCategoria({ nome: 'Lanches', orcamentoCentavos: 20000 });
  const gasto = (categoria, valor, data) =>
    criarLancamento({ valorCentavos: valor, categoriaId: categoria.id, formaPagamento: 'Pix', data });

  return {
    estado: {
      meses: [
        criarMes({ mes: '2026-10', saldoInicialCentavos: 0 }),
        criarMes({ mes: '2026-11', saldoInicialCentavos: 0 }),
      ],
      categorias: [transporte, lanches],
      fixos: [],
      formasPagamento: ['Pix'],
      lancamentos: [
        gasto(transporte, 2000, '2026-10-20'),
        gasto(transporte, 1500, '2026-10-31'),
        gasto(transporte, 2500, '2026-11-01'), // mesma semana do dia 31/10
        gasto(lanches, 4000, '2026-11-03'),
        gasto(transporte, 1000, '2026-11-10'), // semana de hoje
        excluirRegistro(gasto(transporte, 9900, '2026-11-04')), // excluído: não conta
      ],
    },
    transporte,
    lanches,
  };
}

describe('filtrarGastos', () => {
  it('sem filtro: todos os gastos válidos, do mais recente ao mais antigo', () => {
    const { estado } = cenario();
    const { gastos, totalCentavos } = filtrarGastos(estado);
    assert.equal(gastos.length, 5);
    assert.equal(gastos[0].lancamento.data, '2026-11-10');
    assert.equal(totalCentavos, 11000);
  });

  it('filtra por categoria e por mês', () => {
    const { estado, transporte } = cenario();
    assert.equal(filtrarGastos(estado, { categoriaId: transporte.id }).totalCentavos, 7000);
    assert.equal(filtrarGastos(estado, { mes: '2026-10' }).totalCentavos, 3500);
    assert.equal(filtrarGastos(estado, { categoriaId: transporte.id, mes: '2026-11' }).totalCentavos, 3500);
  });

  it('traz o nome da categoria', () => {
    const { estado } = cenario();
    assert.equal(filtrarGastos(estado).gastos.find((g) => g.lancamento.data === '2026-11-03').nomeCategoria, 'Lanches');
  });
});

describe('semanasDeGastos', () => {
  it('soma por semana de segunda a domingo, atravessando os meses', () => {
    const { estado, transporte } = cenario();
    const { semanas } = semanasDeGastos(estado, transporte.id, HOJE);

    assert.deepEqual(
      semanas.map((s) => [s.inicio, s.fim, s.totalCentavos, s.quantidade, s.atual]),
      [
        ['2026-11-09', '2026-11-15', 1000, 1, true],
        ['2026-11-02', '2026-11-08', 0, 0, false],     // semana sem gasto também aparece
        ['2026-10-26', '2026-11-01', 4000, 2, false],  // 31/10 + 01/11
        ['2026-10-19', '2026-10-25', 2000, 1, false],
      ],
    );
  });

  it('média só das semanas completas, contando as semanas sem gasto', () => {
    const { estado, transporte } = cenario();
    const { mediaCentavos, semanasCompletas } = semanasDeGastos(estado, transporte.id, HOJE);
    // (0 + 4000 + 2000) / 3 semanas completas = 2000
    assert.equal(semanasCompletas, 3);
    assert.equal(mediaCentavos, 2000);
  });

  it('com "todas as categorias", soma tudo', () => {
    const { estado } = cenario();
    const semana = semanasDeGastos(estado, null, HOJE).semanas.find((s) => s.inicio === '2026-11-02');
    assert.equal(semana.totalCentavos, 4000); // só os Lanches do dia 3
  });

  it('sem gastos: nenhuma semana e sem média', () => {
    const { estado } = cenario();
    assert.deepEqual(semanasDeGastos({ ...estado, lancamentos: [] }, null, HOJE), {
      semanas: [], mediaCentavos: null, semanasCompletas: 0,
    });
  });

  it('só a semana de hoje: ainda não há média', () => {
    const { estado, lanches } = cenario();
    const { semanas, mediaCentavos } = semanasDeGastos(estado, lanches.id, '2026-11-05');
    assert.equal(semanas.length, 1);
    assert.equal(mediaCentavos, null);
  });

  it('gasto com data no futuro ainda não entra', () => {
    const { estado, lanches } = cenario();
    // Hoje = 01/11: o gasto de Lanches do dia 03/11 ainda não aconteceu.
    assert.deepEqual(semanasDeGastos(estado, lanches.id, '2026-11-01').semanas, []);
  });
});

describe('gastoDaSemanaAtual', () => {
  it('total da categoria na semana de hoje', () => {
    const { estado, transporte } = cenario();
    assert.deepEqual(gastoDaSemanaAtual(estado, transporte.id, HOJE), {
      inicio: '2026-11-09', fim: '2026-11-15', totalCentavos: 1000,
    });
  });

  it('a semana de hoje pode começar no mês anterior', () => {
    const { estado, transporte } = cenario();
    assert.equal(gastoDaSemanaAtual(estado, transporte.id, '2026-11-01').totalCentavos, 4000);
  });
});

describe('filtros disponíveis', () => {
  it('meses do mais recente ao mais antigo', () => {
    assert.deepEqual(mesesDoHistorico(cenario().estado), ['2026-11', '2026-10']);
  });

  it('categoria removida com gastos continua no filtro, marcada como removida', () => {
    const { estado, lanches } = cenario();
    const lista = categoriasDoHistorico(removerCategoria(estado, lanches.id));
    assert.deepEqual(lista.find((c) => c.id === lanches.id), { id: lanches.id, nome: 'Lanches', removida: true });
  });
});

describe('paginar', () => {
  const doze = Array.from({ length: 12 }, (_, i) => i + 1);

  it('mostra 5 itens por página', () => {
    assert.equal(ITENS_POR_PAGINA, 5);
    assert.deepEqual(paginar(doze, 1), { itens: [1, 2, 3, 4, 5], pagina: 1, totalPaginas: 3, totalItens: 12 });
    assert.deepEqual(paginar(doze, 3).itens, [11, 12]);
  });

  it('página fora do intervalo vai para a primeira ou a última', () => {
    assert.equal(paginar(doze, 0).pagina, 1);
    assert.equal(paginar(doze, 99).pagina, 3);
    assert.equal(paginar(doze, 1.5).pagina, 1);
  });

  it('lista vazia tem uma página, sem itens', () => {
    assert.deepEqual(paginar([], 1), { itens: [], pagina: 1, totalPaginas: 1, totalItens: 0 });
  });
});
