/**
 * Testes do comentário da IA sobre o Radar (Fase 04, parte 4.3d).
 * Rodar com: npm test
 *
 * Nenhum teste usa a internet: aqui só se monta a mensagem.
 * Dados de exemplo (fictícios) no dia 10/10/2026: carteira de R$ 2.630,70
 * (renda fixa R$ 1.565,70 e ações R$ 1.065,00), reserva de R$ 513,40
 * (6% da meta de R$ 7.438,80) e parte Investir do mês de R$ 112,04.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCOES_RADAR, ITENS_PARA_IA, mensagemDoRadar } from '../src/radar-ia.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';

const HOJE = '2026-10-10';
const estado = criarDadosDeExemplo(HOJE);

const ativo = (codigo, preco, mes) => ({
  codigo, nome: `EMPRESA ${codigo}`, tipo: 'acao', precoCentavos: preco, volumeCentavos: 4_530_000_000, negocios: 100,
  variacoes: { semana: 1.2, mes, ano: null },
});

const radar = {
  formato: 'painel-financeiro-radar', versao: 1, geradoEm: '2026-10-10T10:31:00.000Z', tesouro: null,
  mercado: { fonte: 'B3', link: 'https://www.b3.com.br/', dataBase: '2026-10-09', referencias: {}, ativos: [] },
  fiis: { fonte: 'CVM e B3', link: 'https://dados.cvm.gov.br/', dataBase: '2026-10-09', mesReferencia: '2026-09', itens: [] },
};

describe('INSTRUCOES_RADAR', () => {
  it('comenta, não manda comprar nem prevê; formato com os três títulos', () => {
    assert.match(INSTRUCOES_RADAR, /Use apenas os números fornecidos/);
    assert.match(INSTRUCOES_RADAR, /Não diga para comprar, vender ou investir em nenhum ativo/);
    assert.match(INSTRUCOES_RADAR, /Não preveja preço/);
    assert.match(INSTRUCOES_RADAR, /reserva de emergência abaixo da meta/);
    assert.match(INSTRUCOES_RADAR, /rendimento passado não garante/);
    assert.match(INSTRUCOES_RADAR, /## O que a lista mostra\n.*\n## Com a sua carteira\n.*\n## Antes de decidir/s);
  });
});

describe('mensagemDoRadar: lista de ações', () => {
  const visao = {
    tipo: 'acao', lista: 'altas', periodo: 'mes', precoMaximoCentavos: 11204,
    itens: Array.from({ length: 12 }, (_, i) => ativo(`AAA${i}3`, 3456, 22.4 - i)),
  };
  const { instrucoes, conteudo } = mensagemDoRadar(radar, visao, estado, HOJE);

  it('a lista, a fonte, o aviso da variação e o filtro', () => {
    assert.equal(instrucoes, INSTRUCOES_RADAR);
    assert.match(conteudo, /^Lista: Maiores altas de ações \(variação de preço no mês; dados da B3 de 09\/10\/2026\)\./);
    assert.match(conteudo, /A variação é só do preço: não inclui dividendos/);
    assert.match(conteudo, /Filtro: só ações de até R\$ 112,04 por unidade\./);
  });

  it(`cada item com preço, variações e volume; no máximo ${ITENS_PARA_IA} itens`, () => {
    assert.match(conteudo, /- AAA03 \(EMPRESA AAA03\): R\$ 34,56 por ação; semana \+1,2%, mês \+22,4%, 12 meses —; R\$ 45,3 mi negociados no dia\./);
    assert.equal((conteudo.match(/^- AAA/gm) ?? []).length, ITENS_PARA_IA);
  });

  it('a carteira: total, grupos com porcentagem, maiores posições, reserva e Investir do mês', () => {
    assert.match(conteudo, /- Total: R\$ 2\.630,70 \(aplicado R\$ 2\.504,90\)\./);
    assert.match(conteudo, /- Renda fixa e fundos: R\$ 1\.565,70 \(60% da carteira\)\./);
    assert.match(conteudo, /- Ações: R\$ 1\.065,00 \(40% da carteira\)\./);
    assert.match(conteudo, /- Maiores posições: EXEM3 \(Ação, 40%\); CDB Banco Exemplo \(CDB, 40%\); Tesouro Selic \(Tesouro Direto, 20%\)\./);
    assert.match(conteudo, /- Reserva de emergência: R\$ 513,40 de R\$ 7\.438,80 \(6% da meta de 6 meses de custo\)\./);
    assert.match(conteudo, /- Parte "Investir" da sobra deste mês: R\$ 112,04\./);
  });

  it('texto limpo e pedido no fim', () => {
    assert.ok(!/undefined|NaN/.test(conteudo));
    assert.ok(!conteudo.includes(' '));
    assert.match(conteudo, /Comente esta lista para a pessoa\.$/);
  });
});

describe('mensagemDoRadar: FIIs por dividendos, lista vazia e carteira vazia', () => {
  it('dividendos com a fonte da CVM e o P/VP', () => {
    const fii = { codigo: 'ALFA11', nome: 'FII ALFA', precoCentavos: 945, volumeCentavos: 1, dividendos12m: 12.31, pvp: 1.02, ultimoMes: '2026-09' };
    const { conteudo } = mensagemDoRadar(radar, { tipo: 'fii', lista: 'dividendos', periodo: 'mes', precoMaximoCentavos: null, itens: [fii] }, estado, HOJE);
    assert.match(conteudo, /^Lista: FIIs com maiores dividendos em 12 meses \(informados pelos fundos à CVM até set\/2026; preços da B3 de 09\/10\/2026\)\./);
    assert.match(conteudo, /- ALFA11 \(FII ALFA\): R\$ 9,45 por cota; dividendos em 12 meses 12,31%; P\/VP 1,02\./);
    assert.ok(!/Filtro:/.test(conteudo));
  });

  it('lista vazia e pessoa sem investimentos', () => {
    const semCarteira = { ...estado, investimentos: [] };
    const { conteudo } = mensagemDoRadar(radar, { tipo: 'acao', lista: 'baixas', periodo: 'semana', precoMaximoCentavos: null, itens: [] }, semCarteira, HOJE);
    assert.match(conteudo, /A lista está vazia com esses filtros\./);
    assert.match(conteudo, /- Nenhum investimento cadastrado no app\./);
  });
});
