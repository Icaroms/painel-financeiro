/**
 * Testes da carteira de investimentos (Fase 04, parte 4.2a).
 * Rodar com: npm test
 *
 * Dia fixo: 10 de outubro de 2026. Valores fictícios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRUPOS_DE_INVESTIMENTO,
  TIPOS_DE_INVESTIMENTO,
  TAMANHO_MAXIMO_NOME,
  tipoDoInvestimento,
  investimentosAtivos,
  adicionarInvestimento,
  editarInvestimento,
  atualizarValorAtual,
  removerInvestimento,
  rendimento,
  textoDoPercentual,
  resumoDaCarteira,
} from '../src/carteira.js';
import { empacotar, desempacotar } from '../src/persistencia.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';

const HOJE = '2026-10-10';
const AGORA = new Date('2026-10-10T15:00:00.000Z');

/** Ids previsíveis: inv-1, inv-2... */
function gerador() {
  let n = 0;
  return () => `inv-${(n += 1)}`;
}

/** Estado mínimo: só o que a carteira usa. */
const vazio = () => ({ investimentos: [] });

const cdb = {
  tipo: 'cdb', nome: '  CDB Banco X 2028  ', dataAplicacao: '2026-03-10',
  valorAplicadoCentavos: 100000, valorAtualCentavos: 105000, valorAtualEm: '2026-10-01',
};

describe('tipos e grupos', () => {
  it('renda fixa, fundos e imóvel; cada tipo num grupo que existe', () => {
    assert.deepEqual(TIPOS_DE_INVESTIMENTO.map((t) => t.id), ['cdb', 'tesouro', 'lci-lca', 'poupanca', 'fundo', 'outro-renda-fixa', 'imovel']);
    const grupos = GRUPOS_DE_INVESTIMENTO.map((g) => g.id);
    for (const tipo of TIPOS_DE_INVESTIMENTO) assert.ok(grupos.includes(tipo.grupo), tipo.id);
    assert.equal(tipoDoInvestimento('tesouro').nome, 'Tesouro Direto');
    assert.equal(tipoDoInvestimento('acao'), undefined); // ações entram na 4.2b
  });
});

describe('adicionarInvestimento', () => {
  it('guarda os dados, sem espaços nas pontas do nome, com os campos de controle', () => {
    const estado = adicionarInvestimento(vazio(), cdb, { hoje: HOJE, agora: AGORA, gerarId: gerador() });
    assert.deepEqual(estado.investimentos, [{
      id: 'inv-1', criadoEm: AGORA.toISOString(), atualizadoEm: AGORA.toISOString(), excluidoEm: null,
      tipo: 'cdb', nome: 'CDB Banco X 2028', dataAplicacao: '2026-03-10',
      valorAplicadoCentavos: 100000, valorAtualCentavos: 105000, valorAtualEm: '2026-10-01',
    }]);
  });

  it('sem valor atual: igual ao aplicado, na data da aplicação', () => {
    const estado = adicionarInvestimento(vazio(), { ...cdb, valorAtualCentavos: null, valorAtualEm: null }, { hoje: HOJE, gerarId: gerador() });
    assert.equal(estado.investimentos[0].valorAtualCentavos, 100000);
    assert.equal(estado.investimentos[0].valorAtualEm, '2026-03-10');
  });

  it('dados sem a lista (gravados antes da Fase 04) também aceitam', () => {
    const estado = adicionarInvestimento({}, cdb, { hoje: HOJE, gerarId: gerador() });
    assert.equal(estado.investimentos.length, 1);
  });

  it('erros claros', () => {
    const tentar = (mudanca) => () => adicionarInvestimento(vazio(), { ...cdb, ...mudanca }, { hoje: HOJE });
    assert.throws(tentar({ tipo: 'acao' }), /Escolha o tipo/);
    assert.throws(tentar({ nome: '   ' }), /Dê um nome/);
    assert.throws(tentar({ nome: 'x'.repeat(TAMANHO_MAXIMO_NOME + 1) }), /no máximo 40 letras/);
    assert.throws(tentar({ dataAplicacao: '2026-02-30' }), /A data da aplicação: escolha uma data válida/);
    assert.throws(tentar({ dataAplicacao: '2026-10-11' }), /A data da aplicação não pode ser depois de hoje/);
    assert.throws(tentar({ valorAplicadoCentavos: 0 }), /O valor aplicado deve ser maior que zero/);
    assert.throws(tentar({ valorAtualCentavos: -1 }), /O valor atual deve ser zero ou mais/);
    assert.throws(tentar({ valorAtualEm: '2026-10-11' }), /A data do valor atual não pode ser depois de hoje/);
    assert.throws(tentar({ valorAtualEm: '2026-03-09' }), /não pode ser antes da aplicação/);
  });

  it('valor atual zero é aceito (ex.: fundo que perdeu tudo)', () => {
    const estado = adicionarInvestimento(vazio(), { ...cdb, valorAtualCentavos: 0 }, { hoje: HOJE, gerarId: gerador() });
    assert.equal(estado.investimentos[0].valorAtualCentavos, 0);
  });
});

describe('editar, atualizar valor e remover', () => {
  const comCdb = () => adicionarInvestimento(vazio(), cdb, { hoje: HOJE, agora: AGORA, gerarId: gerador() });
  const DEPOIS = new Date('2026-10-10T16:00:00.000Z');

  it('editar troca os campos e mantém id e criadoEm', () => {
    const estado = editarInvestimento(comCdb(), 'inv-1', { ...cdb, nome: 'CDB 2029', valorAplicadoCentavos: 120000 }, { hoje: HOJE, agora: DEPOIS });
    const [item] = estado.investimentos;
    assert.equal(item.nome, 'CDB 2029');
    assert.equal(item.valorAplicadoCentavos, 120000);
    assert.equal(item.criadoEm, AGORA.toISOString());
    assert.equal(item.atualizadoEm, DEPOIS.toISOString());
  });

  it('atualizar o valor atual: novo valor com a data de hoje', () => {
    const [item] = atualizarValorAtual(comCdb(), 'inv-1', 106500, { hoje: HOJE, agora: DEPOIS }).investimentos;
    assert.equal(item.valorAtualCentavos, 106500);
    assert.equal(item.valorAtualEm, HOJE);
    assert.equal(item.valorAplicadoCentavos, 100000);
  });

  it('remover é exclusão suave: some da carteira, mas fica registrado', () => {
    const estado = removerInvestimento(comCdb(), 'inv-1', { agora: DEPOIS });
    assert.equal(estado.investimentos.length, 1);
    assert.equal(estado.investimentos[0].excluidoEm, DEPOIS.toISOString());
    assert.deepEqual(investimentosAtivos(estado), []);
  });

  it('investimento removido ou que não existe: erro claro', () => {
    const removido = removerInvestimento(comCdb(), 'inv-1');
    assert.throws(() => atualizarValorAtual(removido, 'inv-1', 1, { hoje: HOJE }), /não existe mais/);
    assert.throws(() => editarInvestimento(comCdb(), 'outro', cdb, { hoje: HOJE }), /não existe mais/);
  });
});

describe('rendimento e porcentagem', () => {
  it('diferença e porcentagem sobre o aplicado', () => {
    assert.deepEqual(rendimento(100000, 105000), { rendimentoCentavos: 5000, percentual: 5 });
    assert.deepEqual(rendimento(100000, 97700), { rendimentoCentavos: -2300, percentual: -2.3 });
    assert.deepEqual(rendimento(0, 0), { rendimentoCentavos: 0, percentual: null });
  });

  it('texto com uma casa e sinal', () => {
    assert.equal(textoDoPercentual(5), '+5,0%');
    assert.equal(textoDoPercentual(-2.34), '−2,3%');
    assert.equal(textoDoPercentual(0.04), '0,0%');
    assert.equal(textoDoPercentual(null), '');
  });
});

describe('resumoDaCarteira', () => {
  it('totais, grupos com investimento e lista do maior valor para o menor', () => {
    let estado = vazio();
    const opcoes = { hoje: HOJE, gerarId: gerador() };
    estado = adicionarInvestimento(estado, cdb, opcoes);
    estado = adicionarInvestimento(estado, { ...cdb, tipo: 'tesouro', nome: 'Tesouro Selic', valorAplicadoCentavos: 50000, valorAtualCentavos: 52000 }, opcoes);
    estado = adicionarInvestimento(estado, { ...cdb, tipo: 'imovel', nome: 'Apartamento', valorAplicadoCentavos: 20000000, valorAtualCentavos: 22000000 }, opcoes);
    estado = adicionarInvestimento(estado, { ...cdb, nome: 'Removido' }, opcoes);
    estado = removerInvestimento(estado, 'inv-4');

    const r = resumoDaCarteira(estado);
    assert.equal(r.aplicadoCentavos, 20150000);
    assert.equal(r.atualCentavos, 22157000);
    assert.equal(r.rendimentoCentavos, 2007000);
    assert.deepEqual(r.itens.map((i) => i.nome), ['Apartamento', 'CDB Banco X 2028', 'Tesouro Selic']);
    assert.deepEqual(r.grupos, [
      { id: 'renda-fixa', nome: 'Renda fixa e fundos', aplicadoCentavos: 150000, atualCentavos: 157000, quantidade: 2 },
      { id: 'imovel', nome: 'Imóveis', aplicadoCentavos: 20000000, atualCentavos: 22000000, quantidade: 1 },
    ]);
  });

  it('carteira vazia (ou dados sem a lista): tudo zero, sem grupos', () => {
    assert.deepEqual(resumoDaCarteira({}), {
      aplicadoCentavos: 0, atualCentavos: 0, rendimentoCentavos: 0, percentual: null, grupos: [], itens: [],
    });
  });
});

describe('backup e dados de exemplo', () => {
  it('a carteira vai e volta no backup (formato continua na versão 3)', () => {
    const estado = adicionarInvestimento(criarDadosDeExemplo(HOJE), cdb, { hoje: HOJE, gerarId: gerador() });
    const pacote = JSON.parse(JSON.stringify(empacotar(estado)));
    assert.equal(pacote.versao, 3);
    assert.deepEqual(desempacotar(pacote).investimentos, estado.investimentos);
  });

  it('o exemplo traz uma carteira fictícia, com datas até hoje', () => {
    const r = resumoDaCarteira(criarDadosDeExemplo(HOJE));
    assert.ok(r.itens.length >= 2);
    for (const item of r.itens) {
      assert.ok(item.dataAplicacao <= HOJE && item.valorAtualEm <= HOJE, item.nome);
    }
  });
});
