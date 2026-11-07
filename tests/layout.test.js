/**
 * Testes do novo layout (11/2026): rotas e tela Início. Rodar com: npm test
 * Dados FICTÍCIOS (os de exemplo do app, em novembro de 2026).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { lerRota, PAGINAS_DE_AJUSTES } from '../src/rotas.js';
import { resumoDoInicio, SITUACAO_DO_SALDO, QUANTAS_SAIDAS } from '../src/resumo-inicio.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { adicionarEntradaFixa } from '../src/entradas.js';

describe('lerRota', () => {
  it('sem endereço ou desconhecido: Início', () => {
    for (const hash of ['', '#', '#inicio', '#qualquer', undefined]) {
      assert.deepEqual(lerRota(hash), { vista: 'inicio', parte: null, aba: 'inicio' });
    }
  });

  it('Novo gasto não marca aba (abre pelo "+")', () => {
    assert.deepEqual(lerRota('#lancar'), { vista: 'lancar', parte: null, aba: null });
    assert.deepEqual(lerRota('#gasto'), { vista: 'lancar', parte: null, aba: null });
  });

  it('Mês com as partes; parte desconhecida vira resumo; histórico fica na aba Mês', () => {
    assert.deepEqual(lerRota('#mes'), { vista: 'mes', parte: 'resumo', aba: 'mes' });
    assert.deepEqual(lerRota('#mes/entradas'), { vista: 'mes', parte: 'entradas', aba: 'mes' });
    assert.deepEqual(lerRota('#mes/xyz'), { vista: 'mes', parte: 'resumo', aba: 'mes' });
    assert.equal(lerRota('#historico').aba, 'mes');
  });

  it('Planejar, Investir e Avaliar compra ficam na aba Planejar; #investir antigo abre a parte Investir', () => {
    assert.deepEqual(lerRota('#planejar'), { vista: 'planejar', parte: 'compras', aba: 'planejar' });
    assert.deepEqual(lerRota('#planejar/investir'), { vista: 'planejar', parte: 'investir', aba: 'planejar' });
    assert.deepEqual(lerRota('#investir'), { vista: 'planejar', parte: 'investir', aba: 'planejar' });
    assert.deepEqual(lerRota('#investir/radar'), { vista: 'investir', parte: 'radar', aba: 'planejar' });
    assert.deepEqual(lerRota('#simular'), { vista: 'simular', parte: null, aba: 'planejar' });
  });

  it('Ajustes: menu ou uma página; #configurar antigo abre o menu', () => {
    assert.deepEqual(lerRota('#ajustes'), { vista: 'ajustes', parte: null, aba: 'ajustes' });
    assert.deepEqual(lerRota('#configurar'), { vista: 'ajustes', parte: null, aba: 'ajustes' });
    for (const pagina of PAGINAS_DE_AJUSTES) {
      assert.deepEqual(lerRota(`#ajustes/${pagina}`), { vista: 'configurar', parte: pagina, aba: 'ajustes' });
    }
    assert.deepEqual(lerRota('#ajustes/nada'), { vista: 'ajustes', parte: null, aba: 'ajustes' });
  });
});

describe('resumoDoInicio', () => {
  const HOJE = '2026-11-10';
  const exemplo = () => criarDadosDeExemplo(HOJE);

  it('número principal, situação com texto e na conta agora', () => {
    const r = resumoDoInicio(exemplo(), HOJE);
    assert.equal(r.mes, '2026-11');
    assert.equal(r.dia, 10);
    assert.equal(r.diasNoMes, 30);
    assert.equal(typeof r.deveSobrarCentavos, 'number');
    assert.equal(r.situacao, SITUACAO_DO_SALDO[r.cor]);
    assert.equal(typeof r.naContaAgoraCentavos, 'number');
  });

  it('avisos: sem salário cadastrado; some quando há entrada fixa', () => {
    const sem = resumoDoInicio(exemplo(), HOJE);
    assert.ok(sem.avisos.some((a) => a.id === 'salario' && a.link === '#ajustes/dinheiro'));
    const com = adicionarEntradaFixa(exemplo(), { nome: 'Salário', valorCentavos: 100000, dia: 5 }, '2026-11');
    assert.ok(!resumoDoInicio(com, HOJE).avisos.some((a) => a.id === 'salario'));
  });

  it('avisos: saldo sugerido e backup atrasado', () => {
    const estado = exemplo();
    estado.meses = estado.meses.map((m) => ({ ...m, saldoConfirmado: false }));
    const r = resumoDoInicio(estado, HOJE, { backupAtrasado: true });
    assert.equal(r.avisos[0].id, 'saldo', 'o saldo a confirmar vem primeiro');
    assert.ok(r.avisos.some((a) => a.id === 'backup' && a.link === '#ajustes/conta'));
  });

  it('próximas saídas: só previstas, em ordem de data, no máximo 4', () => {
    const r = resumoDoInicio(exemplo(), HOJE);
    assert.ok(r.proximas.length <= QUANTAS_SAIDAS);
    const datas = r.proximas.map((s) => s.data);
    assert.deepEqual(datas, [...datas].sort());
    for (const s of r.proximas) assert.ok(s.valorCentavos > 0);
  });

  it('categorias: só com orçamento, da mais cheia para a menos', () => {
    const r = resumoDoInicio(exemplo(), HOJE);
    assert.ok(r.categorias.length <= 3);
    const fracoes = r.categorias.map((c) => c.fracaoUsada);
    assert.deepEqual(fracoes, [...fracoes].sort((a, b) => b - a));
    for (const c of r.categorias) assert.ok(c.orcamentoCentavos > 0);
  });
});

import { resumosDosAjustes } from '../src/resumo-ajustes.js';

describe('resumosDosAjustes', () => {
  const HOJE = '2026-11-10';
  it('uma linha de resumo por página do menu e os pontos de atenção', () => {
    const estado = criarDadosDeExemplo(HOJE);
    const { textos, pontos } = resumosDosAjustes(estado, HOJE, {
      iaLigada: true, backupTexto: 'Último backup: hoje', backupAtrasado: false, versao: 'v35',
    });
    for (const pagina of PAGINAS_DE_AJUSTES) assert.equal(typeof textos[pagina], 'string', pagina);
    assert.match(textos.dinheiro, /^Saldo R\$/);
    assert.match(textos.dinheiro, /sem entradas fixas/);
    assert.match(textos.contas, /contas? · R\$/);
    assert.match(textos.categorias, /livre/);
    assert.equal(textos.ia, 'Ligada');
    assert.equal(textos.app, 'Versão v35');
    assert.equal(pontos.dinheiro, true, 'sem salário cadastrado: ponto em Dinheiro');
    assert.equal(pontos.conta, false);
  });
});
