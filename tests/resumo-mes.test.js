/**
 * Testes do resumo do mês.
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS (o exemplo do app), em novembro de 2026 (30 dias).
 * Exemplo: saldo R$ 1.500, fixos Consulta R$ 250 (dia 1), Academia R$ 99,90
 * (dia 5) e Streaming R$ 39,90 (dia 12); gastos no dia 1: Lanches R$ 100,
 * Transporte R$ 60, Mercado R$ 150 e Diversos R$ 40.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resumoDoMes, excluirLancamento } from '../src/resumo-mes.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { criarLancamento } from '../src/modelo.js';
import { removerCategoria } from '../src/configuracao.js';
import { adicionarFixo } from '../src/fixos.js';
import { sobraDoMes } from '../src/meses.js';

const MES = '2026-11';
const exemplo = () => criarDadosDeExemplo('2026-11-01');
const categoria = (estado, nome) => estado.categorias.find((c) => c.nome === nome);

describe('resumoDoMes: os grandes números', () => {
  it('no dia 10: já saiu, vai vencer e deve sobrar', () => {
    const resumo = resumoDoMes(exemplo(), MES, '2026-11-10');

    assert.equal(resumo.dinheiroDoMesCentavos, 150000);
    // Já venceram: Consulta (dia 1) e Academia (dia 5) = 349,90; gastos = 350,00
    assert.equal(resumo.jaSaiu.fixosCentavos, 34990);
    assert.equal(resumo.jaSaiu.gastosCentavos, 35000);
    assert.equal(resumo.jaSaiu.totalCentavos, 69990);
    // Ainda vai vencer: Streaming (dia 12)
    assert.equal(resumo.aVencerCentavos, 3990);
    // 1500 − 389,80 − 350 = 760,20
    assert.equal(resumo.deveSobrarCentavos, 76020);
    assert.equal(resumo.corSaldo, 'verde');
  });

  it('as contas fecham: dinheiro − já saiu − a vencer = deve sobrar', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-11-10');
    assert.equal(r.dinheiroDoMesCentavos - r.jaSaiu.totalCentavos - r.aVencerCentavos, r.deveSobrarCentavos);
  });

  it('deve sobrar é igual à sobra usada na virada do mês', () => {
    const estado = exemplo();
    assert.equal(resumoDoMes(estado, MES, '2026-11-10').deveSobrarCentavos, sobraDoMes(estado, MES));
  });

  it('informa o dia e a fração do mês', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-11-15');
    assert.equal(r.dia, 15);
    assert.equal(r.diasNoMes, 30);
    assert.equal(r.fracaoDoMes, 0.5);
  });

  it('mês que já passou: todas as contas venceram', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-12-02');
    assert.equal(r.aVencerCentavos, 0);
    assert.equal(r.dia, 30);
  });

  it('cor do saldo: amarelo abaixo de R$ 200 e vermelho no negativo', () => {
    const estado = exemplo();
    const gasto = (valor) => criarLancamento({
      valorCentavos: valor, categoriaId: categoria(estado, 'Diversos').id, formaPagamento: 'Pix', data: '2026-11-05',
    });
    const apertado = { ...estado, lancamentos: [...estado.lancamentos, gasto(60000)] };   // sobra 160,20
    const negativo = { ...estado, lancamentos: [...estado.lancamentos, gasto(80000)] };   // sobra −39,80

    assert.equal(resumoDoMes(apertado, MES, '2026-11-10').corSaldo, 'amarelo');
    assert.equal(resumoDoMes(negativo, MES, '2026-11-10').corSaldo, 'vermelho');
  });
});

describe('resumoDoMes: categorias', () => {
  it('mostra gasto, orçamento, margem e cor de cada categoria', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-11-10');
    const porNome = Object.fromEntries(r.categorias.map((c) => [c.categoria.nome, c]));

    // Lanches: 100 de 200 = 50% no dia 10 (33%): 17 pontos à frente → amarelo
    assert.equal(porNome.Lanches.gastoCentavos, 10000);
    assert.equal(porNome.Lanches.margemCentavos, 10000);
    assert.equal(porNome.Lanches.fracaoUsada, 0.5);
    assert.equal(porNome.Lanches.cor, 'amarelo');
    // Mercado: 150 de 600 = 25% → verde
    assert.equal(porNome.Mercado.cor, 'verde');
    // Diversos: sem orçamento → neutro, sem margem
    assert.equal(porNome.Diversos.cor, 'neutro');
    assert.equal(porNome.Diversos.margemCentavos, null);
  });

  it('categoria que passou do orçamento fica vermelha', () => {
    const estado = exemplo();
    const extra = criarLancamento({
      valorCentavos: 15000, categoriaId: categoria(estado, 'Lanches').id, formaPagamento: 'Pix', data: '2026-11-08',
    });
    const r = resumoDoMes({ ...estado, lancamentos: [...estado.lancamentos, extra] }, MES, '2026-11-10');
    const lanches = r.categorias.find((c) => c.categoria.nome === 'Lanches');
    assert.equal(lanches.margemCentavos, -5000);
    assert.equal(lanches.cor, 'vermelho');
  });

  it('categoria removida continua aparecendo se teve gasto no mês', () => {
    const base = exemplo();
    const semLanches = removerCategoria(base, categoria(base, 'Lanches').id);
    const nomes = resumoDoMes(semLanches, MES, '2026-11-10').categorias.map((c) => c.categoria.nome);
    assert.ok(nomes.includes('Lanches'));
  });

  it('categoria removida sem gasto no mês não aparece', () => {
    const base = exemplo();
    const semGasto = { ...base, lancamentos: base.lancamentos.filter((l) => l.categoriaId !== categoria(base, 'Lanches').id) };
    const semLanches = removerCategoria(semGasto, categoria(base, 'Lanches').id);
    const nomes = resumoDoMes(semLanches, MES, '2026-11-10').categorias.map((c) => c.categoria.nome);
    assert.ok(!nomes.includes('Lanches'));
  });
});

describe('resumoDoMes: listas', () => {
  it('contas fixas por dia, com situação de vencida', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-11-10');
    assert.deepEqual(
      r.fixos.map((f) => [f.fixo.nome, f.vencido]),
      [['Consulta', true], ['Academia', true], ['Streaming', false]],
    );
  });

  it('vencimento no dia 31 cai no último dia de um mês de 30 dias', () => {
    const base = exemplo();
    const comDia31 = adicionarFixo(base, {
      nome: 'Aluguel', valorCentavos: 50000, diaVencimento: 31, formaPagamento: 'Pix', tipo: 'mensal',
    }, MES);
    const aluguel = resumoDoMes(comDia31, MES, '2026-11-30').fixos.find((f) => f.fixo.nome === 'Aluguel');
    assert.equal(aluguel.diaEfetivo, 30);
    assert.equal(aluguel.vencido, true);
  });

  it('gastos do mais recente para o mais antigo, com o nome da categoria', () => {
    const estado = exemplo();
    const novo = criarLancamento({
      valorCentavos: 2500, categoriaId: categoria(estado, 'Mercado').id, formaPagamento: 'Pix', data: '2026-11-09',
    });
    const r = resumoDoMes({ ...estado, lancamentos: [...estado.lancamentos, novo] }, MES, '2026-11-10');
    assert.equal(r.gastos[0].lancamento.id, novo.id);
    assert.equal(r.gastos[0].nomeCategoria, 'Mercado');
    assert.equal(r.gastos.length, 5);
  });

  it('rejeita mês que não existe', () => {
    assert.throws(() => resumoDoMes(exemplo(), '2027-01', '2027-01-05'), { name: 'ErroValidacao', campo: 'mes' });
  });
});

describe('excluirLancamento', () => {
  it('o gasto deixa de contar, mas continua guardado', () => {
    const estado = exemplo();
    const alvo = estado.lancamentos[0];
    const depois = excluirLancamento(estado, alvo.id, { agora: new Date('2026-11-10T12:00:00.000Z') });

    assert.equal(depois.lancamentos.length, estado.lancamentos.length);
    assert.equal(depois.lancamentos.find((l) => l.id === alvo.id).excluidoEm, '2026-11-10T12:00:00.000Z');
    assert.equal(
      resumoDoMes(depois, MES, '2026-11-10').jaSaiu.gastosCentavos,
      resumoDoMes(estado, MES, '2026-11-10').jaSaiu.gastosCentavos - alvo.valorCentavos,
    );
  });

  it('rejeita gasto inexistente ou já excluído', () => {
    const estado = exemplo();
    const id = estado.lancamentos[0].id;
    const depois = excluirLancamento(estado, id);
    assert.throws(() => excluirLancamento(depois, id), { campo: 'lancamento' });
    assert.throws(() => excluirLancamento(estado, 'nao-existe'), { campo: 'lancamento' });
  });
});

describe('resumoDoMes: conta fixa opcional', () => {
  it('opcional sem valor no mês fica fora da lista e das contas', () => {
    const base = exemplo();
    const comDentista = adicionarFixo(base, {
      nome: 'Dentista', valorCentavos: 15000, diaVencimento: 1, formaPagamento: 'Pix', tipo: 'mensal', opcional: true,
    }, MES);
    const r = resumoDoMes(comDentista, MES, '2026-11-10');
    const antes = resumoDoMes(base, MES, '2026-11-10');

    assert.equal(r.fixos.some((f) => f.fixo.nome === 'Dentista'), false);
    assert.equal(r.deveSobrarCentavos, antes.deveSobrarCentavos);
  });
});
