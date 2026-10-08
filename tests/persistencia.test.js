/**
 * Testes do formato de gravação.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { empacotar, desempacotar, migrarDaVersao1, migrarDaVersao2, FORMATO, VERSAO_ATUAL } from '../src/persistencia.js';
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
    for (const lista of ['meses', 'categorias', 'fixos', 'lancamentos', 'formasPagamento', 'cartoes']) {
      const dados = { ...criarDadosDeExemplo('2026-11-03'), [lista]: undefined };
      assert.throws(() => desempacotar(empacotar(dados)), new RegExp(lista));
    }
  });

  it('rejeita dados sem nenhum mês', () => {
    const dados = { ...criarDadosDeExemplo('2026-11-03'), meses: [] };
    assert.throws(() => desempacotar(empacotar(dados)), ERRO_PACOTE);
  });

  it('rejeita dados com um mês inválido', () => {
    const exemplo = criarDadosDeExemplo('2026-11-03');
    const dados = { ...exemplo, meses: [{ ...exemplo.meses[0], mes: '2026-13' }] };
    assert.throws(() => desempacotar(empacotar(dados)), ERRO_PACOTE);
  });
});

/* ------------------------------------------------------------------ */
/* Conversão da versão 1 (um mês só) para a versão 2 (vários meses)    */
/* ------------------------------------------------------------------ */

/** Monta um pacote no formato antigo, como era gravado na versão 1. */
function pacoteVersao1() {
  const atual = criarDadosDeExemplo('2026-10-15');
  const { meses, cartoes, ...resto } = atual;
  const { rendaPrevistaCentavos, saldoConfirmado, ...registroMesV1 } = meses[0];
  return {
    formato: FORMATO,
    versao: 1,
    salvoEm: '2026-10-15T12:00:00.000Z',
    dados: { ...resto, registroMes: registroMesV1 },
  };
}

describe('migrarDaVersao1', () => {
  it('o mês único vira a lista de meses, com renda 0 e saldo confirmado', () => {
    const v1 = pacoteVersao1().dados;
    const v2 = migrarDaVersao1(v1);

    assert.equal(v2.registroMes, undefined);
    assert.equal(v2.meses.length, 1);
    assert.equal(v2.meses[0].mes, '2026-10');
    assert.equal(v2.meses[0].saldoInicialCentavos, v1.registroMes.saldoInicialCentavos);
    assert.equal(v2.meses[0].rendaPrevistaCentavos, 0);
    assert.equal(v2.meses[0].saldoConfirmado, true);
    assert.deepEqual(v2.meses[0].ajustesFixos, v1.registroMes.ajustesFixos);
    assert.equal(v2.lancamentos, v1.lancamentos);
  });

  it('rejeita dados da versão 1 sem mês válido', () => {
    const v1 = pacoteVersao1().dados;
    assert.throws(() => migrarDaVersao1({ ...v1, registroMes: undefined }), ERRO_PACOTE);
  });
});

describe('desempacotar pacote da versão 1', () => {
  it('converte automaticamente para a versão atual', () => {
    const dados = desempacotar(pacoteVersao1());
    assert.equal(dados.meses[0].mes, '2026-10');
    assert.equal(dados.meses[0].rendaPrevistaCentavos, 0);
  });

  it('a versão atual do formato é a 3', () => {
    assert.equal(VERSAO_ATUAL, 3);
  });

  it('um pacote da versão 1 passa pelas duas conversões e ganha a lista de cartões', () => {
    assert.deepEqual(desempacotar(pacoteVersao1()).cartoes, []);
  });
});

/* ------------------------------------------------------------------ */
/* Conversão da versão 2 para a versão 3 (cartões de crédito)          */
/* ------------------------------------------------------------------ */

describe('migrarDaVersao2', () => {
  it('acrescenta a lista de cartões vazia e não muda o resto', () => {
    const { cartoes, ...v2 } = criarDadosDeExemplo('2026-10-15');
    const v3 = migrarDaVersao2(v2);
    assert.deepEqual(v3.cartoes, []);
    assert.equal(v3.meses, v2.meses);
    assert.equal(v3.formasPagamento, v2.formasPagamento);
  });

  it('um pacote da versão 2 é lido normalmente', () => {
    const { cartoes, ...v2 } = criarDadosDeExemplo('2026-10-15');
    const dados = desempacotar({ formato: FORMATO, versao: 2, salvoEm: '2026-10-15T12:00:00.000Z', dados: v2 });
    assert.deepEqual(dados.cartoes, []);
    assert.equal(dados.meses.length, 1);
  });
});
