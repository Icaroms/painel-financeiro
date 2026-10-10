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
import { adicionarFixo, definirStatusDoFixo } from '../src/fixos.js';
import { definirStatusDaFatura } from '../src/fluxo.js';
import { sobraDoMes } from '../src/meses.js';

const MES = '2026-11';
const exemplo = () => criarDadosDeExemplo('2026-11-01');
const categoria = (estado, nome) => estado.categorias.find((c) => c.nome === nome);

describe('resumoDoMes: os grandes números', () => {
  it('sem nada marcado: contas e fatura previstas; só os gastos à vista já foram pagos', () => {
    const resumo = resumoDoMes(exemplo(), MES, '2026-11-10');

    assert.equal(resumo.dinheiroDoMesCentavos, 150000);
    assert.equal(resumo.jaPago.fixosCentavos, 0);
    // À vista: Lanches 100 (Pix) + Transporte 60 (Débito) + Diversos 40 (Dinheiro) = 200.
    // O Mercado de 150 foi no "Crédito", um cartão: sai na fatura do dia 10.
    assert.equal(resumo.jaPago.gastosCentavos, 20000);
    assert.equal(resumo.jaPago.faturasCentavos, 0);
    assert.equal(resumo.jaPago.totalCentavos, 20000);
    // Previstas: contas 389,80 + fatura do Crédito 150 = 539,80
    assert.equal(resumo.previstoCentavos, 38980 + 15000);
    // 1500 − 389,80 − 350 = 760,20 (o fim do mês não muda: a fatura vence neste mês)
    assert.equal(resumo.deveSobrarCentavos, 76020);
    assert.equal(resumo.naContaAgoraCentavos, 130000);
    assert.equal(resumo.corSaldo, 'verde');
  });

  it('marcar como pago passa a conta de previsto para já pago', () => {
    const base = exemplo();
    const academia = base.fixos.find((f) => f.nome === 'Academia');
    const r = resumoDoMes(definirStatusDoFixo(base, MES, academia.id, 'pago'), MES, '2026-11-10');

    assert.equal(r.jaPago.fixosCentavos, 9990);
    assert.equal(r.previstoCentavos, 38980 - 9990 + 15000);
    assert.equal(r.naContaAgoraCentavos, 150000 - 9990 - 20000);
    assert.equal(r.deveSobrarCentavos, 76020); // o fim do mês não muda: a conta só trocou de lado
  });

  it('as contas fecham: dinheiro − já pago − previsto = deve sobrar', () => {
    const base = exemplo();
    const consulta = base.fixos.find((f) => f.nome === 'Consulta');
    const academia = base.fixos.find((f) => f.nome === 'Academia');
    const estado = definirStatusDoFixo(
      definirStatusDoFixo(base, MES, consulta.id, 'pago', { valorCentavos: 27000 }),
      MES, academia.id, 'dispensado',
    );
    const r = resumoDoMes(estado, MES, '2026-11-10');
    assert.equal(r.dinheiroDoMesCentavos - r.jaPago.totalCentavos - r.previstoCentavos, r.deveSobrarCentavos);
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

  it('mês que já passou: conta não marcada aparece como atrasada', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-12-02');
    assert.equal(r.dia, 30);
    assert.equal(r.contagemFixos.atrasadas, 3);
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
  it('ordem das contas: atrasadas, previstas, pagas e dispensadas', () => {
    const base = exemplo();
    const consulta = base.fixos.find((f) => f.nome === 'Consulta');   // dia 1
    const streaming = base.fixos.find((f) => f.nome === 'Streaming'); // dia 12
    const estado = definirStatusDoFixo(
      definirStatusDoFixo(base, MES, consulta.id, 'pago'),
      MES, streaming.id, 'dispensado',
    );
    const r = resumoDoMes(estado, MES, '2026-11-10');
    assert.deepEqual(
      r.fixos.map((f) => [f.fixo.nome, f.status, f.atrasado]),
      [['Academia', 'previsto', true], ['Consulta', 'pago', false], ['Streaming', 'dispensado', false]],
    );
    assert.deepEqual(r.contagemFixos, { previstas: 1, atrasadas: 1, pagas: 1, dispensadas: 1 });
  });

  it('no dia do vencimento a conta ainda não está atrasada', () => {
    const academia = resumoDoMes(exemplo(), MES, '2026-11-05').fixos.find((f) => f.fixo.nome === 'Academia');
    assert.equal(academia.atrasado, false);
  });

  it('vencimento no dia 31 cai no último dia de um mês de 30 dias', () => {
    const base = exemplo();
    const comDia31 = adicionarFixo(base, {
      nome: 'Aluguel', valorCentavos: 50000, diaVencimento: 31, formaPagamento: 'Pix', tipo: 'mensal',
    }, MES);
    const aluguel = resumoDoMes(comDia31, MES, '2026-11-30').fixos.find((f) => f.fixo.nome === 'Aluguel');
    assert.equal(aluguel.diaEfetivo, 30);
    assert.equal(aluguel.atrasado, false); // vence no dia 30 = hoje
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
      resumoDoMes(depois, MES, '2026-11-10').jaPago.gastosCentavos,
      resumoDoMes(estado, MES, '2026-11-10').jaPago.gastosCentavos - alvo.valorCentavos,
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

describe('resumoDoMes: conta dispensada', () => {
  it('dispensada fica na lista, mas fora das contas', () => {
    const base = exemplo();
    const consulta = base.fixos.find((f) => f.nome === 'Consulta');
    const r = resumoDoMes(definirStatusDoFixo(base, MES, consulta.id, 'dispensado'), MES, '2026-11-10');
    const antes = resumoDoMes(base, MES, '2026-11-10');

    assert.ok(r.fixos.some((f) => f.fixo.nome === 'Consulta' && f.status === 'dispensado'));
    assert.equal(r.previstoCentavos, antes.previstoCentavos - 25000);
    assert.equal(r.deveSobrarCentavos, antes.deveSobrarCentavos + 25000);
  });
});

describe('resumoDoMes: faturas do cartão', () => {
  it('a fatura do mês aparece com o total, o vencimento e a situação', () => {
    const r = resumoDoMes(exemplo(), MES, '2026-11-08');
    assert.equal(r.faturas.length, 1);
    assert.deepEqual(
      [r.faturas[0].formaPagamento, r.faturas[0].vencimento, r.faturas[0].totalCentavos, r.faturas[0].status],
      ['Crédito', '2026-11-10', 15000, 'previsto'],
    );
    assert.equal(r.faturas[0].atrasada, false);
  });

  it('fatura paga passa para já pago; passou do vencimento sem pagar = atrasada', () => {
    const pago = resumoDoMes(definirStatusDaFatura(exemplo(), MES, 'Crédito', 'pago'), MES, '2026-11-12');
    assert.equal(pago.jaPago.faturasCentavos, 15000);
    assert.equal(pago.previstoCentavos, 38980);
    assert.equal(resumoDoMes(exemplo(), MES, '2026-11-12').faturas[0].atrasada, true);
  });

  it('compra no cartão depois do fechamento: conta na categoria, mas não no saldo deste mês', () => {
    const base = exemplo();
    const compra = criarLancamento({
      valorCentavos: 30000, categoriaId: categoria(base, 'Mercado').id, formaPagamento: 'Crédito', data: '2026-11-05',
    });
    const antes = resumoDoMes(base, MES, '2026-11-10');
    const depois = resumoDoMes({ ...base, lancamentos: [...base.lancamentos, compra] }, MES, '2026-11-10');

    assert.equal(depois.deveSobrarCentavos, antes.deveSobrarCentavos); // vence em 10/12
    const mercado = depois.categorias.find((c) => c.categoria.nome === 'Mercado');
    assert.equal(mercado.gastoCentavos, 15000 + 30000);
    assert.equal(depois.gastos.length, antes.gastos.length + 1);
  });
});
