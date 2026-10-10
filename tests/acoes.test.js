/**
 * Testes de ações e FIIs na carteira (Fase 04, parte 4.2b).
 * Rodar com: npm test
 *
 * Dia fixo: 10 de outubro de 2026. Códigos e valores fictícios.
 *
 * Exemplo usado em vários testes (contas feitas à mão):
 *   10/03 compra 100 × R$ 20,00 + R$ 4,90 de custos → custo R$ 2.004,90; preço médio R$ 20,05
 *   15/05 compra  50 × R$ 23,00 + R$ 3,10           → custo R$ 3.158,00 (150 ações); preço médio R$ 21,05
 *   20/08 venda   60 × R$ 25,00 − R$ 2,00 de custos
 *         custo das 60 = 3.158,00 × 60 ÷ 150 = R$ 1.263,20
 *         lucro = 1.500,00 − 2,00 − 1.263,20 = R$ 234,80
 *         sobram 90 ações com custo R$ 1.894,80 (preço médio continua R$ 21,05)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIPOS_POR_OPERACAO,
  ehPorOperacao,
  unidade,
  lerCodigo,
  posicaoDoAtivo,
  valoresDoAtivo,
  adicionarAtivo,
  adicionarOperacao,
  removerOperacao,
  atualizarCotacao,
} from '../src/acoes.js';
import { adicionarInvestimento, removerInvestimento, resumoDaCarteira } from '../src/carteira.js';

const HOJE = '2026-10-10';

/** Ids previsíveis: id-1, id-2... */
function gerador() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

/** Carteira com EXEM3 e as três operações do exemplo. O ativo é "id-1". */
function exemplo() {
  const opcoes = { hoje: HOJE, gerarId: gerador() };
  let estado = adicionarAtivo({ investimentos: [] }, {
    tipo: 'acao', codigo: 'exem3', compra: { data: '2026-03-10', quantidade: 100, precoCentavos: 2000, custosCentavos: 490 },
  }, opcoes);
  estado = adicionarOperacao(estado, 'id-1', { tipo: 'compra', data: '2026-05-15', quantidade: 50, precoCentavos: 2300, custosCentavos: 310 }, opcoes);
  estado = adicionarOperacao(estado, 'id-1', { tipo: 'venda', data: '2026-08-20', quantidade: 60, precoCentavos: 2500, custosCentavos: 200 }, opcoes);
  return { estado, opcoes };
}
const ativo = (estado) => estado.investimentos.find((i) => i.id === 'id-1');

describe('tipos, unidade e código', () => {
  it('ação e FII são registrados por operação', () => {
    assert.deepEqual(TIPOS_POR_OPERACAO, ['acao', 'fii']);
    assert.equal(ehPorOperacao('fii'), true);
    assert.equal(ehPorOperacao('cdb'), false);
  });

  it('ações e cotas, no singular e no plural', () => {
    assert.equal(unidade('acao', 1), 'ação');
    assert.equal(unidade('acao', 2), 'ações');
    assert.equal(unidade('fii', 1), 'cota');
    assert.equal(unidade('fii', 0), 'cotas');
  });

  it('código da bolsa em maiúsculas; formatos inválidos dão erro claro', () => {
    assert.equal(lerCodigo(' petr4 '), 'PETR4');
    assert.equal(lerCodigo('HGLG11'), 'HGLG11');
    assert.equal(lerCodigo('petr4f'), 'PETR4F'); // fracionário
    for (const errado of ['PETR', 'PETRO4', '1234', 'PETR123', '']) {
      assert.throws(() => lerCodigo(errado), /Código inválido/, errado);
    }
  });
});

describe('posição e preço médio', () => {
  it('compras somam custo (com os custos); venda tira o custo pelo preço médio', () => {
    const p = posicaoDoAtivo(ativo(exemplo().estado));
    assert.equal(p.quantidade, 90);
    assert.equal(p.custoCentavos, 189480);
    assert.equal(p.precoMedioCentavos, 2105);
    assert.equal(p.problema, null);
    assert.deepEqual(p.vendas, [{
      id: 'id-4', data: '2026-08-20', mes: '2026-08', quantidade: 60,
      valorVendaCentavos: 150000, custosCentavos: 200, custoDasUnidadesCentavos: 126320, lucroCentavos: 23480,
    }]);
    assert.equal(p.lucroVendasCentavos, 23480);
  });

  it('a ordem é a das datas, não a do registro (compra antiga lançada depois)', () => {
    const { estado, opcoes } = exemplo();
    const comAntiga = adicionarOperacao(estado, 'id-1', { tipo: 'compra', data: '2026-01-05', quantidade: 10, precoCentavos: 1500, custosCentavos: 0 }, opcoes);
    const p = posicaoDoAtivo(ativo(comAntiga));
    assert.equal(p.quantidade, 100);
    // custo antes da venda: 3.158,00 + 150,00 = 3.308,00 (160 ações); sai 3.308,00 × 60 ÷ 160 = 1.240,50
    assert.equal(p.vendas[0].custoDasUnidadesCentavos, 124050);
    assert.equal(p.custoCentavos, 330800 - 124050);
  });

  it('vender tudo zera a posição e o custo; o lucro de cada venda fica guardado', () => {
    const { estado, opcoes } = exemplo();
    const zerado = adicionarOperacao(estado, 'id-1', { tipo: 'venda', data: '2026-09-01', quantidade: 90, precoCentavos: 2200, custosCentavos: 0 }, opcoes);
    const p = posicaoDoAtivo(ativo(zerado));
    assert.equal(p.quantidade, 0);
    assert.equal(p.custoCentavos, 0);
    assert.equal(p.precoMedioCentavos, 0);
    assert.equal(p.vendas[1].lucroCentavos, 198000 - 189480); // R$ 85,20
  });

  it('arredondamento: a soma dos custos que saem nas vendas é exatamente o custo comprado', () => {
    const opcoes = { hoje: HOJE, gerarId: gerador() };
    let estado = adicionarAtivo({}, { tipo: 'fii', codigo: 'EXFI11', compra: { data: '2026-01-02', quantidade: 3, precoCentavos: 1000, custosCentavos: 1 } }, opcoes);
    estado = adicionarOperacao(estado, 'id-1', { tipo: 'venda', data: '2026-02-02', quantidade: 1, precoCentavos: 1000 }, opcoes);
    estado = adicionarOperacao(estado, 'id-1', { tipo: 'venda', data: '2026-03-02', quantidade: 2, precoCentavos: 1000 }, opcoes);
    const { vendas } = posicaoDoAtivo(ativo(estado));
    assert.equal(vendas[0].custoDasUnidadesCentavos + vendas[1].custoDasUnidadesCentavos, 3001);
  });
});

describe('valoresDoAtivo', () => {
  it('sem cotação: o valor atual é o custo (rendimento zero)', () => {
    assert.deepEqual(valoresDoAtivo(ativo(exemplo().estado)), {
      aplicadoCentavos: 189480, atualCentavos: 189480, semCotacao: true, encerrado: false,
    });
  });

  it('com cotação: quantidade × cotação', () => {
    const estado = atualizarCotacao(exemplo().estado, 'id-1', 2400, { hoje: HOJE });
    assert.equal(ativo(estado).cotacaoEm, HOJE);
    assert.deepEqual(valoresDoAtivo(ativo(estado)), {
      aplicadoCentavos: 189480, atualCentavos: 216000, semCotacao: false, encerrado: false,
    });
  });
});

describe('erros claros', () => {
  it('venda maior que a posição na data é recusada', () => {
    const { estado, opcoes } = exemplo();
    assert.throws(
      () => adicionarOperacao(estado, 'id-1', { tipo: 'venda', data: '2026-04-01', quantidade: 200, precoCentavos: 2000 }, opcoes),
      /Venda de 200 em 01\/04\/2026: na data, a carteira tinha só 100 ações de EXEM3\./,
    );
    assert.throws(
      () => adicionarOperacao(estado, 'id-1', { tipo: 'venda', data: '2026-03-01', quantidade: 1, precoCentavos: 2000 }, opcoes),
      /tinha só 0 ações/,
    );
  });

  it('remover uma compra que deixaria uma venda maior que a posição é recusado', () => {
    const { estado } = exemplo();
    // Sem a compra de 100, a venda de 60 ficaria com só 50 ações.
    assert.throws(() => removerOperacao(estado, 'id-1', 'id-2'), /Venda de 60 em 20\/08\/2026: na data, a carteira tinha só 50 ações/);
    // Sem a compra de 50, a venda de 60 ainda cabe nas 100: pode remover.
    assert.equal(posicaoDoAtivo(ativo(removerOperacao(estado, 'id-1', 'id-3'))).quantidade, 40);
  });

  it('a única operação não pode ser removida (remova o ativo)', () => {
    const estado = adicionarAtivo({}, { tipo: 'acao', codigo: 'EXEM3', compra: { data: '2026-03-10', quantidade: 1, precoCentavos: 100 } }, { hoje: HOJE, gerarId: gerador() });
    assert.throws(() => removerOperacao(estado, 'id-1', 'id-2'), /É a única operação de EXEM3/);
  });

  it('dados da operação', () => {
    const { estado, opcoes } = exemplo();
    const tentar = (op) => () => adicionarOperacao(estado, 'id-1', { tipo: 'compra', data: '2026-09-01', quantidade: 1, precoCentavos: 100, ...op }, opcoes);
    assert.throws(tentar({ tipo: 'troca' }), /compra ou venda/);
    assert.throws(tentar({ data: '2026-02-30' }), /escolha uma data válida/);
    assert.throws(tentar({ data: '2026-10-11' }), /não pode ser depois de hoje/);
    assert.throws(tentar({ quantidade: 1.5 }), /número inteiro maior que zero/);
    assert.throws(tentar({ quantidade: 0 }), /número inteiro maior que zero/);
    assert.throws(tentar({ precoCentavos: 0 }), /O preço deve ser maior que zero/);
    assert.throws(tentar({ custosCentavos: -1 }), /Os custos devem ser zero ou mais/);
  });

  it('código repetido na carteira; depois de remover o ativo, pode cadastrar de novo', () => {
    const { estado, opcoes } = exemplo();
    const nova = { tipo: 'acao', codigo: 'EXEM3', compra: { data: '2026-09-01', quantidade: 1, precoCentavos: 100 } };
    assert.throws(() => adicionarAtivo(estado, nova, opcoes), /EXEM3 já está na carteira: use "Nova operação" nele\./);
    const semEle = removerInvestimento(estado, 'id-1');
    assert.equal(adicionarAtivo(semEle, nova, opcoes).investimentos.length, 2);
  });

  it('tipo errado, ativo removido, cotação zero', () => {
    const { estado, opcoes } = exemplo();
    assert.throws(() => adicionarAtivo(estado, { tipo: 'cdb', codigo: 'EXEM4', compra: {} }, opcoes), /Escolha Ação ou FII/);
    assert.throws(() => atualizarCotacao(estado, 'id-1', 0, { hoje: HOJE }), /A cotação deve ser maior que zero/);
    const removido = removerInvestimento(estado, 'id-1');
    assert.throws(() => atualizarCotacao(removido, 'id-1', 100, { hoje: HOJE }), /não existe mais/);
  });
});

describe('na carteira', () => {
  it('ações e FIIs entram no resumo, nos seus grupos; posição zerada vai para o fim e não conta no grupo', () => {
    const { estado: base, opcoes } = exemplo();
    let estado = atualizarCotacao(base, 'id-1', 2400, { hoje: HOJE });
    estado = adicionarAtivo(estado, { tipo: 'fii', codigo: 'EXFI11', compra: { data: '2026-04-01', quantidade: 10, precoCentavos: 10000 } }, opcoes);
    estado = adicionarAtivo(estado, { tipo: 'acao', codigo: 'VEND3', compra: { data: '2026-04-01', quantidade: 5, precoCentavos: 1000 } }, opcoes);
    const vend3 = estado.investimentos.find((i) => i.nome === 'VEND3').id;
    estado = adicionarOperacao(estado, vend3, { tipo: 'venda', data: '2026-05-01', quantidade: 5, precoCentavos: 1200 }, opcoes);
    estado = adicionarInvestimento(estado, {
      tipo: 'cdb', nome: 'CDB', dataAplicacao: '2026-01-10', valorAplicadoCentavos: 100000, valorAtualCentavos: 104000, valorAtualEm: '2026-10-01',
    }, opcoes);

    const r = resumoDaCarteira(estado);
    assert.deepEqual(r.itens.map((i) => i.investimento.nome), ['EXEM3', 'CDB', 'EXFI11', 'VEND3']);
    assert.equal(r.itens[3].encerrado, true);
    assert.deepEqual(r.grupos.map((g) => [g.nome, g.quantidade, g.atualCentavos]), [
      ['Renda fixa e fundos', 1, 104000],
      ['Ações', 1, 216000],
      ['FIIs', 1, 100000],
    ]);
    assert.equal(r.aplicadoCentavos, 189480 + 100000 + 100000);
    assert.equal(r.atualCentavos, 216000 + 104000 + 100000);
  });
});
