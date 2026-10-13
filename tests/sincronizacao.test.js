/**
 * Testes da sincronização (Fase 05, parte 5.3): o que enviar e como juntar a resposta.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LISTAS_SINCRONIZADAS,
  aplicarResposta,
  assinaturaDaConfiguracao,
  dadosDoServidor,
  estadoDepoisDeAdotar,
  estadoInicial,
  jsonEstavel,
  momento,
  montarPedido,
  pendentes,
  temDadosNoServidor,
} from '../src/sincronizacao.js';

const T1 = '2026-10-13T12:00:00.000Z';
const T2 = '2026-10-13T13:00:00.000Z';
const T3 = '2026-10-13T14:00:00.000Z';
const AGORA = new Date('2026-10-13T15:00:00.000Z');

const categoria = (id, nome, atualizadoEm = T1) => ({
  id, criadoEm: T1, atualizadoEm, excluidoEm: null, nome, orcamentoCentavos: 10000,
});
const mes = (id, mesTexto, atualizadoEm = T1) => ({
  id, criadoEm: T1, atualizadoEm, excluidoEm: null, mes: mesTexto, saldoInicialCentavos: 0,
  rendaPrevistaCentavos: 0, saldoConfirmado: true, ajustesFixos: {}, statusFixos: {},
});

function dadosBase() {
  return {
    origem: 'usuario',
    meses: [mes('m1', '2026-10')],
    categorias: [categoria('c1', 'iFood')],
    fixos: [],
    lancamentos: [],
    formasPagamento: ['Pix', 'Nubank'],
    cartoes: [],
  };
}

/** Resposta vazia do servidor, com o que for passado por cima. */
function resposta(extra = {}) {
  return {
    cursor: '2026-10-13T15:00:00.123456Z',
    resultados: Object.fromEntries(LISTAS_SINCRONIZADAS.map((nome) => [nome, []])),
    configuracao: null,
    mudancas: Object.fromEntries(LISTAS_SINCRONIZADAS.map((nome) => [nome, []])),
    configuracaoAtual: null,
    ...extra,
  };
}

describe('momento e jsonEstavel', () => {
  it('a mesma hora com e sem milissegundos dá o mesmo número', () => {
    assert.equal(momento('2026-10-13T12:00:00Z'), momento('2026-10-13T12:00:00.000Z'));
    assert.equal(momento('não é data'), null);
    assert.equal(momento(undefined), null);
  });

  it('a ordem das chaves não muda o texto', () => {
    assert.equal(jsonEstavel({ b: 1, a: { d: 2, c: 3 } }), jsonEstavel({ a: { c: 3, d: 2 }, b: 1 }));
    assert.notEqual(jsonEstavel({ a: 1 }), jsonEstavel({ a: 2 }));
  });
});

describe('pendentes e montarPedido', () => {
  it('num aparelho que nunca sincronizou, tudo está pendente (registros e configuração)', () => {
    const p = pendentes(dadosBase(), estadoInicial());
    assert.equal(p.listas.categorias.length, 1);
    assert.equal(p.listas.meses.length, 1);
    assert.deepEqual(p.configuracao, { formasPagamento: ['Pix', 'Nubank'], cartoes: [] });
    assert.equal(p.total, 3);
  });

  it('registro já enviado só volta a ficar pendente quando o atualizadoEm muda', () => {
    const estado = estadoInicial();
    estado.enviados.categorias.c1 = momento(T1);
    estado.enviados.meses.m1 = momento(T1);
    estado.assinaturaConfiguracao = assinaturaDaConfiguracao(dadosBase());

    assert.equal(pendentes(dadosBase(), estado).total, 0);

    const editado = dadosBase();
    editado.categorias = [categoria('c1', 'Delivery', T2)];
    assert.deepEqual(pendentes(editado, estado).listas.categorias.map((c) => c.id), ['c1']);
  });

  it('o pedido leva o cursor, só as listas com algo e a configuração com atualizadoEm', () => {
    const estado = { ...estadoInicial(), cursor: 'C1' };
    estado.enviados.meses.m1 = momento(T1);

    const pedido = montarPedido(dadosBase(), estado, AGORA);

    assert.equal(pedido.desde, 'C1');
    assert.deepEqual(Object.keys(pedido.listas), ['categorias']);
    assert.equal(pedido.configuracao.atualizadoEm, AGORA.toISOString());
  });
});

describe('aplicarResposta', () => {
  it('registros gravados deixam de estar pendentes; o cursor e a hora são guardados', () => {
    const dados = dadosBase();
    const pedido = montarPedido(dados, estadoInicial(), AGORA);
    const juncao = aplicarResposta(dados, estadoInicial(), pedido, resposta({
      resultados: { ...resposta().resultados, categorias: [{ id: 'c1', situacao: 'gravado' }], meses: [{ id: 'm1', situacao: 'gravado' }] },
      configuracao: { situacao: 'gravado' },
    }), AGORA);

    assert.equal(juncao.mudou, false);
    assert.equal(juncao.estado.cursor, '2026-10-13T15:00:00.123456Z');
    assert.equal(juncao.estado.ultimaEm, AGORA.toISOString());
    assert.equal(pendentes(juncao.dados, juncao.estado).total, 0);
  });

  it('registro novo vindo do servidor entra na lista, sem o recebidoEm', () => {
    const juncao = aplicarResposta(dadosBase(), estadoInicial(), { listas: {} }, resposta({
      mudancas: { ...resposta().mudancas, categorias: [{ ...categoria('c2', 'Uber'), recebidoEm: 'X' }] },
    }));

    assert.equal(juncao.mudou, true);
    assert.deepEqual(juncao.dados.categorias.map((c) => c.id), ['c1', 'c2']);
    assert.equal('recebidoEm' in juncao.dados.categorias[1], false);
    assert.equal(juncao.estado.enviados.categorias.c2, momento(T1));
  });

  it('vale o atualizadoEm mais recente: o do servidor substitui, o local mais novo fica', () => {
    const local = dadosBase();
    local.categorias = [categoria('c1', 'Local novo', T3), categoria('c2', 'Local velho', T1)];

    const juncao = aplicarResposta(local, estadoInicial(), { listas: {} }, resposta({
      mudancas: {
        ...resposta().mudancas,
        categorias: [categoria('c1', 'Servidor velho', T2), categoria('c2', 'Servidor novo', '2026-10-13T13:00:00Z')],
      },
    }));

    assert.equal(juncao.dados.categorias[0].nome, 'Local novo');
    assert.equal(juncao.dados.categorias[1].nome, 'Servidor novo');
    // O local mais novo continua pendente; o adotado, não.
    assert.deepEqual(pendentes(juncao.dados, juncao.estado).listas.categorias.map((c) => c.id), ['c1']);
  });

  it('conflito: adota a versão do servidor que veio em "atual"', () => {
    const dados = dadosBase();
    const pedido = montarPedido(dados, estadoInicial(), AGORA);

    const juncao = aplicarResposta(dados, estadoInicial(), pedido, resposta({
      resultados: { ...resposta().resultados, categorias: [{ id: 'c1', situacao: 'conflito', atual: categoria('c1', 'Do servidor', T2) }] },
    }));

    assert.equal(juncao.dados.categorias[0].nome, 'Do servidor');
    assert.equal(juncao.mudou, true);
  });

  it('recusado: o registro fica no aparelho, pendente, e aparece em "recusados"', () => {
    const dados = dadosBase();
    const pedido = montarPedido(dados, estadoInicial(), AGORA);

    const juncao = aplicarResposta(dados, estadoInicial(), pedido, resposta({
      resultados: { ...resposta().resultados, categorias: [{ id: 'c1', situacao: 'recusado', campos: { nome: 'Informe o nome.' } }] },
    }));

    assert.deepEqual(juncao.recusados, [{ lista: 'categorias', id: 'c1', campos: { nome: 'Informe o nome.' } }]);
    assert.equal(pendentes(juncao.dados, juncao.estado).listas.categorias.length, 1);
  });

  it('mesmo mês com outro id (outro aparelho): o do servidor substitui o daqui', () => {
    const juncao = aplicarResposta(dadosBase(), estadoInicial(), { listas: {} }, resposta({
      mudancas: { ...resposta().mudancas, meses: [mes('m-servidor', '2026-10', T1)] },
    }));

    assert.deepEqual(juncao.dados.meses.map((m) => m.id), ['m-servidor']);
  });

  it('alteração feita durante o pedido continua pendente', () => {
    const enviados = dadosBase();
    const pedido = montarPedido(enviados, estadoInicial(), AGORA);
    const agora = dadosBase();
    agora.categorias = [categoria('c1', 'Mudou no meio', T3)];

    const juncao = aplicarResposta(agora, estadoInicial(), pedido, resposta({
      resultados: { ...resposta().resultados, categorias: [{ id: 'c1', situacao: 'gravado' }] },
    }));

    assert.equal(juncao.dados.categorias[0].nome, 'Mudou no meio');
    assert.equal(pendentes(juncao.dados, juncao.estado).listas.categorias.length, 1);
  });

  it('configuração do servidor é adotada quando a daqui não tem alteração pendente', () => {
    const estado = { ...estadoInicial(), assinaturaConfiguracao: assinaturaDaConfiguracao(dadosBase()) };

    const juncao = aplicarResposta(dadosBase(), estado, { listas: {} }, resposta({
      configuracaoAtual: { formasPagamento: ['Pix', 'Nubank', 'Inter'], cartoes: [], atualizadoEm: T2, recebidoEm: 'X' },
    }));

    assert.deepEqual(juncao.dados.formasPagamento, ['Pix', 'Nubank', 'Inter']);
    assert.equal(juncao.estado.configuracaoAtualizadaEm, T2);
    assert.equal(pendentes(juncao.dados, juncao.estado).configuracao, null);
  });

  it('configuração daqui com alteração pendente não é trocada pela do servidor (sem conflito)', () => {
    const estado = { ...estadoInicial(), assinaturaConfiguracao: 'outra' };

    const juncao = aplicarResposta(dadosBase(), estado, { listas: {} }, resposta({
      configuracaoAtual: { formasPagamento: ['Dinheiro'], cartoes: [], atualizadoEm: T2 },
    }));

    assert.deepEqual(juncao.dados.formasPagamento, ['Pix', 'Nubank']);
  });

  it('configuração em conflito: a do servidor vale', () => {
    const dados = dadosBase();
    const pedido = montarPedido(dados, estadoInicial(), AGORA);

    const juncao = aplicarResposta(dados, estadoInicial(), pedido, resposta({
      configuracao: { situacao: 'conflito', atual: { formasPagamento: ['Débito'], cartoes: [], atualizadoEm: T3 } },
    }));

    assert.deepEqual(juncao.dados.formasPagamento, ['Débito']);
    assert.equal(pendentes(juncao.dados, juncao.estado).configuracao, null);
  });
});

describe('primeira vez num aparelho com a conta já usada', () => {
  const doServidor = resposta({
    mudancas: {
      ...resposta().mudancas,
      meses: [{ ...mes('m9', '2026-09'), recebidoEm: 'X' }],
      categorias: [categoria('c9', 'Mercado')],
    },
    configuracaoAtual: { formasPagamento: ['Pix'], cartoes: [], destinoSobra: { metaMeses: 6 }, atualizadoEm: T2 },
  });

  it('temDadosNoServidor: vazio é false, com registros ou configuração é true', () => {
    assert.equal(temDadosNoServidor(resposta()), false);
    assert.equal(temDadosNoServidor(doServidor), true);
  });

  it('dadosDoServidor monta os dados do app, e o estado depois disso não tem nada pendente', () => {
    const dados = dadosDoServidor(doServidor);

    assert.equal(dados.origem, 'usuario');
    assert.deepEqual(dados.meses.map((m) => m.id), ['m9']);
    assert.equal('recebidoEm' in dados.meses[0], false);
    assert.deepEqual(dados.formasPagamento, ['Pix']);
    assert.deepEqual(dados.cartoes, []);
    assert.deepEqual(dados.destinoSobra, { metaMeses: 6 });

    const estado = estadoDepoisDeAdotar(dados, doServidor, AGORA);
    assert.equal(estado.cursor, doServidor.cursor);
    assert.equal(pendentes(dados, estado).total, 0);
  });

  it('sem nenhum mês ou sem configuração no servidor, não dá para montar os dados', () => {
    assert.equal(dadosDoServidor(resposta({ configuracaoAtual: { formasPagamento: ['Pix'], cartoes: [] } })), null);
    assert.equal(dadosDoServidor(resposta({ mudancas: { ...resposta().mudancas, meses: [mes('m1', '2026-10')] } })), null);
  });
});
