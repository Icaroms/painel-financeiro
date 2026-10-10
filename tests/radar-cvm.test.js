/**
 * Testes do robô do Radar: dividendos e P/VP dos FIIs pela CVM (Fase 04, parte 4.3c).
 * Rodar com: npm test
 *
 * Nenhum teste usa a internet. Os CSVs imitam os do Informe Mensal
 * Estruturado da CVM (separador ";"), com fundos, CNPJs e ISINs fictícios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  enderecoDoAno,
  MESES_MINIMOS,
  DY_MES_MAXIMO,
  lerCsvCvm,
  acharColuna,
  numeroCvm,
  mesCvm,
  lerInformesFii,
  resumoDoFundo,
  montarFiis,
} from '../scripts/radar/cvm.js';
import { montarRadar } from '../scripts/radar/gerar-radar.js';
import { lerRadar } from '../src/radar.js';

/** Meses de nov/2025 a out/2026 (12 meses). */
const MESES = Array.from({ length: 12 }, (_, i) => {
  const total = 2025 * 12 + 10 + i;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
});

const GERAL = [
  'CNPJ_Fundo_Classe;Data_Referencia;Versao;Nome_Fundo_Classe;Codigo_ISIN',
  '11.111.111/0001-11;2026-10-01;1;FUNDO ALFA;BRAAAACTF001',
  '22.222.222/0001-22;2026-10-01;1;FUNDO BETA;BRBBBBCTF002',
  '33.333.333/0001-33;2026-10-01;1;FUNDO VELHO;BRCCCCCTF003',
  '44.444.444/0001-44;2026-10-01;1;SEM ISIN;',
].join('\n');

/** Complemento: Alfa com 12 meses (DY 0,9% ao mês), Beta com só 8 meses, Velho parou em jun/2026. */
function complemento({ fracao = false } = {}) {
  const dy = (v) => String(fracao ? v / 100 : v);
  const linhas = ['CNPJ_Fundo_Classe;Data_Referencia;Versao;Valor_Patrimonial_Cotas;Percentual_Dividend_Yield_Mes'];
  for (const mes of MESES) {
    linhas.push(`11.111.111/0001-11;${mes}-01;1;100.00;${dy(0.9)}`);
  }
  // Versão 2 corrige o DY de out/2026 do Alfa (vale a mais nova).
  linhas.push(`11.111.111/0001-11;2026-10-01;2;95.00;${dy(1.0)}`);
  for (const mes of MESES.slice(4)) linhas.push(`22.222.222/0001-22;${mes}-01;1;50,00;${dy(0.7)}`);
  for (const mes of MESES.slice(0, 8)) linhas.push(`33.333.333/0001-33;${mes}-01;1;80.00;${dy(0.8)}`);
  // Mês com DY absurdo (erro de digitação do fundo): ignorado.
  linhas[3] = linhas[3].replace(/;[^;]+$/, `;${dy(90)}`);
  return linhas.join('\n');
}

describe('leitura dos CSVs da CVM', () => {
  it('endereço do ano', () => {
    assert.equal(enderecoDoAno(2026), 'https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_2026.zip');
  });

  it('cabeçalho sem acento e minúsculo; coluna achada por pedaços do nome', () => {
    const { cabecalho } = lerCsvCvm('CNPJ_Fundo_Classe;Data_Referência;Código ISIN\nx;y;z');
    assert.deepEqual(cabecalho, ['cnpj_fundo_classe', 'data_referencia', 'codigo_isin']);
    assert.equal(acharColuna(cabecalho, ['isin'], 'geral'), 2);
    assert.throws(() => acharColuna(cabecalho, ['dividend', 'yield'], 'complemento'), /não achei a coluna com "dividend yield" no arquivo complemento\. Cabeçalho: /);
  });

  it('números com ponto ou vírgula; meses ISO ou brasileiros', () => {
    assert.equal(numeroCvm('0.85'), 0.85);
    assert.equal(numeroCvm('0,85'), 0.85);
    assert.equal(numeroCvm('1.234,56'), 1234.56);
    assert.equal(numeroCvm('8.5E-3'), 0.0085);
    assert.equal(numeroCvm(''), null);
    assert.equal(mesCvm('2026-08-01'), '2026-08');
    assert.equal(mesCvm('31/08/2026'), '2026-08');
    assert.equal(mesCvm('ago/26'), null);
  });

  it('arquivo vazio dá erro claro', () => {
    assert.throws(() => lerCsvCvm(''), /veio vazio/);
  });
});

describe('lerInformesFii', () => {
  it('liga o informe ao ISIN pelo CNPJ e fica com a versão mais nova de cada mês', () => {
    const { fundos, escalaDy } = lerInformesFii({ geral: [GERAL], complemento: [complemento()] });
    assert.equal(escalaDy, 'porcentagem');
    assert.deepEqual([...fundos.keys()].sort(), ['BRAAAACTF001', 'BRBBBBCTF002', 'BRCCCCCTF003']);
    assert.deepEqual(fundos.get('BRAAAACTF001').meses.get('2026-10'), { dy: 1.0, vpCota: 95 });
  });

  it('DY que vem como fração (0,009) vira porcentagem (0,9%)', () => {
    const { fundos, escalaDy } = lerInformesFii({ geral: [GERAL], complemento: [complemento({ fracao: true })] });
    assert.equal(escalaDy, 'fracao');
    assert.equal(fundos.get('BRAAAACTF001').meses.get('2026-09').dy, 0.9);
  });
});

describe('resumoDoFundo e montarFiis', () => {
  const { fundos } = lerInformesFii({ geral: [GERAL], complemento: [complemento()] });

  it(`dividendos de 12 meses: soma dos meses válidos (mês acima de ${DY_MES_MAXIMO}% é ignorado)`, () => {
    // Alfa: 12 meses, um deles com DY absurdo (ignorado): 10 × 0,9 + 1,0 (out) = 10,0
    assert.deepEqual(resumoDoFundo(fundos.get('BRAAAACTF001').meses), {
      ultimoMes: '2026-10', dividendos12m: 10, mesesComDados: 11, vpCotaCentavos: 9500,
    });
  });

  it(`com menos de ${MESES_MINIMOS} meses, os dividendos de 12 meses ficam vazios`, () => {
    assert.equal(resumoDoFundo(fundos.get('BRBBBBCTF002').meses).dividendos12m, null);
  });

  it('só FIIs com liquidez (do mercado) e com informe recente; P/VP = preço ÷ valor patrimonial', () => {
    const ativos = [
      { codigo: 'ALFA11', nome: 'FII ALFA', tipo: 'fii', isin: 'BRAAAACTF001', precoCentavos: 8550, volumeCentavos: 90_000_000 },
      { codigo: 'BETA11', nome: 'FII BETA', tipo: 'fii', isin: 'BRBBBBCTF002', precoCentavos: 5500, volumeCentavos: 50_000_000 },
      { codigo: 'VELH11', nome: 'FII VELHO', tipo: 'fii', isin: 'BRCCCCCTF003', precoCentavos: 7000, volumeCentavos: 40_000_000 },
      { codigo: 'SEMI11', nome: 'FII SEM INFORME', tipo: 'fii', isin: 'BRZZZZCTF009', precoCentavos: 1000, volumeCentavos: 40_000_000 },
      { codigo: 'AAAA3', nome: 'ACAO', tipo: 'acao', isin: 'BRAAAAACNOR1', precoCentavos: 1000, volumeCentavos: 900_000_000 },
    ];
    const fiis = montarFiis({ ativos, dataBase: '2026-10-09', fundos });
    assert.equal(fiis.mesReferencia, '2026-10');
    assert.deepEqual(fiis.itens, [
      { codigo: 'ALFA11', nome: 'FII ALFA', precoCentavos: 8550, volumeCentavos: 90_000_000, dividendos12m: 10, pvp: 0.9, ultimoMes: '2026-10' },
      { codigo: 'BETA11', nome: 'FII BETA', precoCentavos: 5500, volumeCentavos: 50_000_000, dividendos12m: null, pvp: 1.1, ultimoMes: '2026-10' },
    ]);
  });

  it('o radar com a parte dos FIIs passa na conferência do app', () => {
    const fiis = montarFiis({
      ativos: [{ codigo: 'ALFA11', nome: 'FII ALFA', tipo: 'fii', isin: 'BRAAAACTF001', precoCentavos: 8550, volumeCentavos: 90_000_000 }],
      dataBase: '2026-10-09',
      fundos,
    });
    const radar = JSON.parse(JSON.stringify(montarRadar({ tesouro: null, mercado: null, fiis })));
    assert.equal(lerRadar(radar).fiis.itens[0].pvp, 0.9);
  });
});
