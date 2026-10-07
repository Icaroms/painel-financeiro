/**
 * Testes do formato de gravação.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { empacotar, desempacotar, FORMATO, VERSAO_ATUAL } from '../src/persistencia.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';

const AGORA = new Date('2026-11-03T13:00:00.000Z');
const ERRO_PACOTE = { name: 'ErroValidacao', campo: 'pacote' };

describe('empacotar', () => {
  it('coloca os dados no envelope com formato, versão e data', () => {
    const dados = criarDadosDeExemplo('2026-11-03');
    const pacote = empacotar(dados, { agora: AGORA });

    assert.equal(pacote.formato, FORMATO);
    assert.equal(pacote.versao, VERSAO_ATUAL);
    assert.equal(pacote.salvoEm, '2026-11-03T13:00:00.000Z');
    assert.equal(pacote.dados, dados);
  });
});

describe('desempacotar', () => {
  it('devolve exatamente os dados que foram empacotados', () => {
    const dados = criarDadosDeExemplo('2026-11-03');
    assert.deepEqual(desempacotar(empacotar(dados)), dados);
  });

  it('continua igual depois de virar texto JSON e voltar (como no backup)', () => {
    const dados = criarDadosDeExemplo('2026-11-03');
    const ida = JSON.stringify(empacotar(dados));
    assert.deepEqual(desempacotar(JSON.parse(ida)), dados);
  });

  it('rejeita pacote vazio', () => {
    assert.throws(() => desempacotar(null), ERRO_PACOTE);
    assert.throws(() => desempacotar(undefined), ERRO_PACOTE);
    assert.throws(() => desempacotar('texto'), ERRO_PACOTE);
  });

  it('rejeita dados de outro app', () => {
    const pacote = { ...empacotar(criarDadosDeExemplo('2026-11-03')), formato: 'outro-app' };
    assert.throws(() => desempacotar(pacote), ERRO_PACOTE);
  });

  it('rejeita pacote sem versão', () => {
    const { versao, ...semVersao } = empacotar(criarDadosDeExemplo('2026-11-03'));
    assert.throws(() => desempacotar(semVersao), ERRO_PACOTE);
  });

  it('rejeita pacote de uma versão mais nova que a do app', () => {
    const pacote = { ...empacotar(criarDadosDeExemplo('2026-11-03')), versao: VERSAO_ATUAL + 1 };
    assert.throws(() => desempacotar(pacote), /versão mais nova/);
  });

  it('rejeita pacote sem dados dentro', () => {
    const pacote = { ...empacotar(criarDadosDeExemplo('2026-11-03')), dados: null };
    assert.throws(() => desempacotar(pacote), ERRO_PACOTE);
  });

  it('rejeita dados sem uma das listas obrigatórias', () => {
    for (const lista of ['categorias', 'fixos', 'lancamentos', 'formasPagamento']) {
      const dados = { ...criarDadosDeExemplo('2026-11-03'), [lista]: undefined };
      assert.throws(() => desempacotar(empacotar(dados)), new RegExp(lista));
    }
  });

  it('rejeita dados sem mês válido', () => {
    const exemplo = criarDadosDeExemplo('2026-11-03');
    const dados = { ...exemplo, registroMes: { ...exemplo.registroMes, mes: '2026-13' } };
    assert.throws(() => desempacotar(empacotar(dados)), ERRO_PACOTE);
  });
});
