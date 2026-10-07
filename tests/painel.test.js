/**
 * Testes do painel da tela de lançamento.
 * Rodar com: npm test
 *
 * Usa os dados de exemplo (fictícios) num dia fixo: 10 de novembro de 2026.
 * Situação inicial do exemplo: Lanches R$ 100 de R$ 200, Transporte R$ 60
 * de R$ 300, Mercado R$ 150 de R$ 600, Diversos R$ 40 sem orçamento.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calcularPainel, tituloDoMes } from '../src/painel.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';

const HOJE = '2026-11-10';

function painel(valorTexto, nomeCategoria, dados = criarDadosDeExemplo(HOJE)) {
  const categoria = dados.categorias.find((c) => c.nome === nomeCategoria);
  return calcularPainel({ dados, valorTexto, categoriaId: categoria.id, formaPagamento: 'Pix', hoje: HOJE });
}

describe('tituloDoMes', () => {
  it('escreve o mês por extenso com inicial maiúscula', () => {
    assert.equal(tituloDoMes('2026-11'), 'Novembro de 2026');
    assert.equal(tituloDoMes('2027-01'), 'Janeiro de 2027');
  });
});

describe('dados de exemplo', () => {
  it('são montados no mês do dia informado', () => {
    const dados = criarDadosDeExemplo('2027-03-15');
    assert.equal(dados.registroMes.mes, '2027-03');
    assert.ok(dados.lancamentos.every((l) => l.data === '2027-03-01'));
  });
});

describe('calcularPainel sem valor', () => {
  it('fica neutro e não gera lançamento', () => {
    const p = painel('', 'Lanches');
    assert.equal(p.cor, 'neutro');
    assert.equal(p.lancamento, null);
    assert.equal(p.frase, 'Digite um valor para ver o veredito.');
  });

  it('valor digitado errado também fica neutro, sem erro', () => {
    for (const texto of ['abc', '0', '12,345', '0,00']) {
      assert.equal(painel(texto, 'Lanches').cor, 'neutro', `texto "${texto}"`);
    }
  });

  it('mostra a situação atual do mês', () => {
    const p = painel('', 'Lanches');
    // 1500,00 − 389,80 de fixos − 350,00 de gastos = 760,20
    assert.equal(p.linhaSaldo, 'O mês fecha em R$\u00a0760,20');
    assert.equal(p.numero, 'R$\u00a0100,00');
    assert.equal(p.usadoTexto, 'Usado: 50%');
  });
});

describe('calcularPainel com valor', () => {
  it('Lanches com R$ 40 no dia 10: amarelo, ritmo acelerado', () => {
    const p = painel('40,00', 'Lanches');
    assert.equal(p.cor, 'amarelo');
    assert.equal(p.frase, 'Atenção: Lanches está acelerado. Sobram R$\u00a060,00.');
    assert.equal(p.usadoTexto, 'Usado: 70%');
    assert.equal(p.linhaSaldo, 'Com este gasto, o mês fecha em R$\u00a0720,20');
    assert.ok(p.lancamento !== null);
    assert.equal(p.lancamento.valorCentavos, 4000);
    assert.equal(p.lancamento.data, HOJE);
  });

  it('Mercado com R$ 40: verde', () => {
    const p = painel('40', 'Mercado');
    assert.equal(p.cor, 'verde');
    assert.equal(p.legenda, 'sobram em Mercado de R$\u00a0600,00');
  });

  it('Lanches com R$ 120: vermelho, categoria estourada', () => {
    const p = painel('120,00', 'Lanches');
    assert.equal(p.cor, 'vermelho');
    assert.equal(p.legenda, 'acima do orçamento de Lanches');
  });

  it('Diversos (sem orçamento): o número mostrado é o saldo do mês', () => {
    const p = painel('10,00', 'Diversos');
    assert.equal(p.cor, 'verde');
    assert.equal(p.numero, 'R$\u00a0750,20');
    assert.equal(p.usadoTexto, 'Sem orçamento');
  });

  it('textos do cabeçalho', () => {
    const p = painel('', 'Lanches');
    assert.equal(p.tituloMes, 'Novembro de 2026');
    assert.equal(p.diaTexto, 'Dia 10 de 30');
    assert.equal(p.hojeTexto, 'Hoje: 33% do mês');
  });
});

describe('calcularPainel com categoria inexistente', () => {
  it('lança erro', () => {
    const dados = criarDadosDeExemplo(HOJE);
    assert.throws(
      () => calcularPainel({ dados, valorTexto: '10', categoriaId: 'nao-existe', formaPagamento: 'Pix', hoje: HOJE }),
      { name: 'ErroValidacao', campo: 'categoriaId' },
    );
  });
});
