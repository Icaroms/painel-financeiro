/**
 * Testes do primeiro acesso.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { criarDadosIniciais, ehExemplo, ehPrimeiroMes, CATEGORIAS_INICIAIS, FORMAS_INICIAIS } from '../src/inicio.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { empacotar, desempacotar } from '../src/persistencia.js';
import { calcularPainel } from '../src/painel.js';
import { dadosDoMes, virarMes } from '../src/meses.js';

const HOJE = '2026-11-03';

describe('criarDadosIniciais', () => {
  it('começa o mês de hoje com saldo zero ainda não confirmado', () => {
    const dados = criarDadosIniciais(HOJE);
    assert.equal(dados.origem, 'usuario');
    assert.equal(dados.meses.length, 1);
    assert.equal(dados.meses[0].mes, '2026-11');
    assert.equal(dados.meses[0].saldoInicialCentavos, 0);
    assert.equal(dados.meses[0].saldoConfirmado, false);
  });

  it('vem com o mínimo para lançar: uma categoria e as formas iniciais', () => {
    const dados = criarDadosIniciais(HOJE);
    assert.deepEqual(dados.categorias.map((c) => c.nome), [...CATEGORIAS_INICIAIS]);
    assert.deepEqual(dados.formasPagamento, [...FORMAS_INICIAIS]);
    assert.deepEqual(dados.fixos, []);
    assert.deepEqual(dados.lancamentos, []);
  });

  it('é um formato válido para gravar e já funciona na tela de lançamento', () => {
    const dados = desempacotar(empacotar(criarDadosIniciais(HOJE)));
    const painel = calcularPainel({
      dados: dadosDoMes(dados, '2026-11'),
      valorTexto: '10',
      categoriaId: dados.categorias[0].id,
      formaPagamento: 'Pix',
      hoje: HOJE,
    });
    // Saldo zero e nada configurado: um gasto de R$ 10 deixa o mês negativo.
    assert.equal(painel.cor, 'vermelho');
  });
});

describe('ehExemplo', () => {
  it('reconhece o exemplo e os dados de verdade', () => {
    assert.equal(ehExemplo(criarDadosDeExemplo(HOJE)), true);
    assert.equal(ehExemplo(criarDadosIniciais(HOJE)), false);
  });

  it('dados sem "origem" (gravados antes) contam como dados de verdade', () => {
    const { origem, ...semOrigem } = criarDadosDeExemplo(HOJE);
    assert.equal(ehExemplo(semOrigem), false);
  });

  it('a origem sobrevive à gravação', () => {
    const lidos = desempacotar(empacotar(criarDadosDeExemplo(HOJE)));
    assert.equal(ehExemplo(lidos), true);
  });
});

describe('ehPrimeiroMes', () => {
  it('é o primeiro mês quando não há mês anterior', () => {
    const dados = criarDadosIniciais(HOJE);
    assert.equal(ehPrimeiroMes(dados, '2026-11'), true);
  });

  it('depois da virada, o mês novo não é o primeiro', () => {
    const { estado } = virarMes(criarDadosIniciais(HOJE), '2026-12');
    assert.equal(ehPrimeiroMes(estado, '2026-12'), false);
    assert.equal(ehPrimeiroMes(estado, '2026-11'), true);
  });
});
