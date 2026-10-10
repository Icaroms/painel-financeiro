/**
 * Testes do robô do Radar (Fase 04, parte 4.3a): leitura do CSV do Tesouro
 * Direto, montagem do radar.json e o workflow do GitHub Actions.
 * Rodar com: npm test
 *
 * Nenhum teste usa a internet: o CSV abaixo imita o arquivo oficial
 * (mesmas colunas do documento de metadados do Tesouro Transparente),
 * com valores fictícios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FONTE_TESOURO,
  dataDoTesouro,
  numeroDoTesouro,
  indexadorDoTipo,
  lerCsvTesouro,
} from '../scripts/radar/tesouro.js';
import { FORMATO_RADAR, VERSAO_RADAR, montarRadar } from '../scripts/radar/gerar-radar.js';
import * as app from '../src/radar.js';

/** CSV de teste: duas datas; na mais nova, 6 títulos à venda e 1 fora de venda (preço zero). */
const CSV = [
  '﻿Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
  'Tesouro Selic;01/03/2031;08/10/2026;0,08;0,09;17.000,00;16.990,00;16.990,00',
  'Tesouro Selic;01/03/2031;09/10/2026;-0,01;0,08;17.123,45;17.100,00;17.100,00',
  'Tesouro Prefixado;01/01/2029;09/10/2026;13,52;13,64;754,32;751,10;751,10',
  'Tesouro IPCA+;15/05/2035;09/10/2026;7,20;7,32;2.345,67;2.330,00;2.330,00',
  'Tesouro IPCA+ com Juros Semestrais;15/08/2050;09/10/2026;6,95;7,07;4.100,00;4.080,00;4.080,00',
  'Tesouro Renda+ Aposentadoria Extra;15/12/2049;09/10/2026;7,10;7,22;1.200,00;1.190,00;1.190,00',
  'Tesouro IGPM+ com Juros Semestrais;01/01/2031;09/10/2026;6,40;6,52;5.000,00;4.990,00;4.990,00',
  'Tesouro Prefixado;01/01/2026;09/10/2026;0,00;0,00;0,00;1.000,00;1.000,00',
  '',
].join('\r\n');

describe('conversões do CSV do Tesouro', () => {
  it('datas DD/MM/AAAA e números com vírgula', () => {
    assert.equal(dataDoTesouro('09/10/2026'), '2026-10-09');
    assert.equal(dataDoTesouro('2026-10-09'), null);
    assert.equal(numeroDoTesouro('17.123,45'), 17123.45);
    assert.equal(numeroDoTesouro('-0,01'), -0.01);
    assert.equal(numeroDoTesouro(''), null);
    assert.equal(numeroDoTesouro('abc'), null);
  });

  it('indexador pelo nome do tipo (Renda+ e Educa+ são IPCA)', () => {
    assert.equal(indexadorDoTipo('Tesouro Selic'), 'selic');
    assert.equal(indexadorDoTipo('Tesouro Prefixado com Juros Semestrais'), 'prefixado');
    assert.equal(indexadorDoTipo('Tesouro IPCA+'), 'ipca');
    assert.equal(indexadorDoTipo('Tesouro Renda+ Aposentadoria Extra'), 'ipca');
    assert.equal(indexadorDoTipo('Tesouro Educa+'), 'ipca');
    assert.equal(indexadorDoTipo('Tesouro IGPM+ com Juros Semestrais'), 'igpm');
    assert.equal(indexadorDoTipo('Outro título'), 'outro');
  });
});

describe('lerCsvTesouro', () => {
  const { dataBase, titulos } = lerCsvTesouro(CSV);

  it('usa só a data mais recente e só os títulos à venda (preço maior que zero)', () => {
    assert.equal(dataBase, '2026-10-09');
    assert.equal(titulos.length, 6);
    assert.ok(!titulos.some((t) => t.vencimento === '2026-01-01'));
  });

  it('cada título com nome, indexador, vencimento, taxa e preço em centavos; ordem por tipo e vencimento', () => {
    assert.deepEqual(titulos.map((t) => t.nome), [
      'Tesouro IGPM+ com Juros Semestrais 2031',
      'Tesouro IPCA+ 2035',
      'Tesouro IPCA+ com Juros Semestrais 2050',
      'Tesouro Prefixado 2029',
      'Tesouro Renda+ Aposentadoria Extra 2049',
      'Tesouro Selic 2031',
    ]);
    assert.deepEqual(titulos.find((t) => t.indexador === 'selic'), {
      nome: 'Tesouro Selic 2031', tipo: 'Tesouro Selic', indexador: 'selic',
      vencimento: '2031-03-01', taxaCompra: -0.01, precoCompraCentavos: 1712345,
    });
  });

  it('cabeçalho com acento, maiúsculas e vírgula como separador também funciona', () => {
    // Com vírgula como separador, os números não podem ter vírgula: aqui só inteiros.
    const outro = 'Tipo Título,DATA VENCIMENTO,Data Base,Taxa Compra Manhã,PU Compra Manhã\nTesouro Selic,01/03/2031,09/10/2026,0,100';
    assert.equal(lerCsvTesouro(outro).titulos[0].precoCompraCentavos, 10000);
  });

  it('erros claros: arquivo vazio, coluna que sumiu, nenhum título à venda', () => {
    assert.throws(() => lerCsvTesouro(''), /veio vazio/);
    assert.throws(() => lerCsvTesouro('Tipo Titulo;Data Base\nx;09/10/2026'), /não achei a coluna "data vencimento"/);
    const semVenda = CSV.split('\r\n').filter((l, i) => i === 0 || l.includes(';0,00;0,00;0,00')).join('\n');
    assert.throws(() => lerCsvTesouro(semVenda), /Nenhum título à venda/);
  });
});

describe('montarRadar', () => {
  const agora = new Date('2026-10-10T10:31:00.000Z');
  const radar = montarRadar({ tesouro: lerCsvTesouro(CSV), agora });

  it('identificação, data de geração, fonte e link', () => {
    assert.equal(radar.formato, 'painel-financeiro-radar');
    assert.equal(radar.versao, 1);
    assert.equal(radar.geradoEm, '2026-10-10T10:31:00.000Z');
    assert.equal(radar.tesouro.fonte, FONTE_TESOURO.nome);
    assert.match(radar.tesouro.link, /^https:\/\/www\.tesourotransparente\.gov\.br\//);
  });

  it('o arquivo do robô passa na conferência do app (mesmo formato e versão)', () => {
    assert.equal(FORMATO_RADAR, app.FORMATO_RADAR);
    assert.equal(VERSAO_RADAR, app.VERSAO_RADAR);
    assert.equal(app.lerRadar(JSON.parse(JSON.stringify(radar))).tesouro.titulos.length, 6);
  });
});

describe('workflow do robô (.github/workflows/radar.yml)', () => {
  const yml = readFileSync(fileURLToPath(new URL('../.github/workflows/radar.yml', import.meta.url)), 'utf8');

  it('roda todo dia e também pelo botão "Run workflow"', () => {
    assert.match(yml, /schedule:\s*\n\s*#[^\n]*\n\s*- cron: '30 10 \* \* 1-6'/);
    assert.match(yml, /workflow_dispatch:/);
  });

  it('só pede permissão de escrever o conteúdo, e gera o radar com o script do repositório', () => {
    assert.match(yml, /permissions:\s*\n\s*contents: write/);
    assert.match(yml, /node scripts\/radar\/gerar-radar\.js "\$RUNNER_TEMP\/radar\/radar\.json"/);
  });

  it('publica na branch radar-dados, que é de onde o app lê', () => {
    assert.match(yml, /git push -q --force [^\n]* radar-dados/);
    assert.match(app.ENDERECO_RADAR, /\/radar-dados\/radar\.json$/);
  });
});
