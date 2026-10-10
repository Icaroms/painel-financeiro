/**
 * Testes do robô do Radar: taxas do Banco Central (Fase 04, parte 4.4a).
 * Rodar com: npm test
 *
 * Nenhum teste usa a internet. As respostas imitam a API do SGS do
 * Banco Central ([{ "data": "DD/MM/AAAA", "valor": "14.25" }]), com valores fictícios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FONTE_BCB,
  SERIES,
  FAIXAS,
  enderecoDaSerie,
  lerSerieSgs,
  cdiAnual,
  ipca12Meses,
  montarTaxas,
} from '../scripts/radar/bcb.js';
import { montarRadar } from '../scripts/radar/gerar-radar.js';
import { lerRadar, linhasDasTaxas } from '../src/radar.js';

/** IPCA de out/2025 a set/2026 (12 meses), como a API devolve. */
const IPCA_JSON = [
  ['01/10/2025', '0.09'], ['01/11/2025', '0.18'], ['01/12/2025', '0.33'],
  ['01/01/2026', '0.16'], ['01/02/2026', '0.70'], ['01/03/2026', '0.42'],
  ['01/04/2026', '0.38'], ['01/05/2026', '0.26'], ['01/06/2026', '0.24'],
  ['01/07/2026', '0.26'], ['01/08/2026', '-0.11'], ['01/09/2026', '0.48'],
].map(([data, valor]) => ({ data, valor }));

const series = () => ({
  selicMeta: lerSerieSgs([{ data: '09/10/2026', valor: '14.25' }]),
  cdiDiario: lerSerieSgs([{ data: '09/10/2026', valor: '0.055131' }]),
  ipcaMensal: lerSerieSgs(IPCA_JSON),
});

describe('endereço e séries', () => {
  it('usa a API pública do SGS com os códigos conhecidos', () => {
    assert.deepEqual({ ...SERIES }, { selicMeta: 432, cdiDiario: 12, ipcaMensal: 433 });
    assert.equal(enderecoDaSerie(433, 12), 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json');
    assert.match(FONTE_BCB.pagina, /^https:\/\/www3\.bcb\.gov\.br\//);
  });
});

describe('lerSerieSgs', () => {
  it('converte datas para AAAA-MM-DD, números com ponto, e ordena', () => {
    const lida = lerSerieSgs([{ data: '02/01/2026', valor: '0.5' }, { data: '01/12/2025', valor: '-0,1' }]);
    assert.deepEqual(lida, [{ data: '2025-12-01', valor: -0.1 }, { data: '2026-01-02', valor: 0.5 }]);
  });

  it('recusa série vazia ou valor quebrado', () => {
    assert.throws(() => lerSerieSgs([]), /BCB: a série veio vazia/);
    assert.throws(() => lerSerieSgs({ erro: 'x' }), /BCB: a série veio vazia/);
    assert.throws(() => lerSerieSgs([{ data: '2026-10-09', valor: '1' }]), /BCB: valor inválido/);
    assert.throws(() => lerSerieSgs([{ data: '09/10/2026', valor: '' }]), /BCB: valor inválido/);
  });
});

describe('cálculos', () => {
  it('CDI anual em 252 dias úteis', () => {
    assert.equal(cdiAnual(0.055131), 14.9);
    assert.equal(cdiAnual(0), 0);
  });

  it('IPCA de 12 meses é encadeado (maior que a soma simples)', () => {
    const mensais = Array(12).fill(1);
    assert.equal(ipca12Meses(mensais), 12.68); // 1,01^12 − 1; a soma daria 12
    assert.throws(() => ipca12Meses([1, 2]), /precisa de 12 meses \(vieram 2\)/);
  });
});

describe('montarTaxas', () => {
  it('monta a parte "taxas" com o último valor de cada série', () => {
    const taxas = montarTaxas(series());
    assert.deepEqual(taxas, {
      fonte: FONTE_BCB.nome,
      link: FONTE_BCB.pagina,
      selicMeta: { valor: 14.25, data: '2026-10-09' },
      cdi: { anual: 14.9, data: '2026-10-09' },
      ipca: { mes: '2026-09', mensal: 0.48, acumulado12m: ipca12Meses(IPCA_JSON.map((m) => Number(m.valor))) },
    });
  });

  it('usa só os 12 meses mais recentes quando vêm mais', () => {
    const s = series();
    s.ipcaMensal = [{ data: '2025-09-01', valor: 4.9 }, ...s.ipcaMensal];
    assert.equal(montarTaxas(s).ipca.acumulado12m, montarTaxas(series()).ipca.acumulado12m);
  });

  it('valor fora da faixa plausível acusa código de série errado', () => {
    const s = series();
    s.selicMeta = [{ data: '2026-10-09', valor: 0.05 }];
    assert.throws(() => montarTaxas(s), /meta da Selic fora da faixa plausível \(2 a 30\): 0\.05/);
    const s2 = series();
    s2.ipcaMensal[3] = { ...s2.ipcaMensal[3], valor: 14.25 };
    assert.throws(() => montarTaxas(s2), /IPCA do mês fora da faixa/);
    const s3 = series();
    s3.cdiDiario = [{ data: '2026-10-09', valor: 14.9 }]; // anual no lugar do diário
    assert.throws(() => montarTaxas(s3), /CDI anual fora da faixa/);
    assert.deepEqual(FAIXAS.selicMeta, [2, 30]);
  });
});

describe('robô → app', () => {
  it('o radar só com taxas passa no lerRadar do app', () => {
    const radar = JSON.parse(JSON.stringify(montarRadar({ tesouro: null, taxas: montarTaxas(series()) })));
    const lido = lerRadar(radar);
    assert.equal(lido.taxas.selicMeta.valor, 14.25);
    assert.equal(lido.tesouro, null);
  });

  it('o app recusa a parte das taxas incompleta', () => {
    const taxas = montarTaxas(series());
    const radar = montarRadar({ tesouro: null, taxas: { ...taxas, cdi: { anual: 'x', data: '2026-10-09' } } });
    assert.throws(() => lerRadar(radar), /taxas do Banco Central do radar está incompleta/);
  });

  it('linhas do quadro "Taxas de hoje"', () => {
    const linhas = linhasDasTaxas(montarTaxas(series()));
    assert.deepEqual(linhas.map((l) => l.nome), ['Selic', 'CDI', 'IPCA']);
    assert.equal(linhas[0].valor, '14,25% ao ano');
    assert.equal(linhas[0].detalhe, 'meta definida pelo Copom');
    assert.equal(linhas[1].valor, '14,90% ao ano');
    assert.equal(linhas[1].detalhe, 'taxa de 09/10/2026, em 252 dias úteis');
    assert.match(linhas[2].valor, /^\d+,\d{2}% em 12 meses$/);
    assert.equal(linhas[2].detalhe, '0,48% em setembro de 2026');
  });
});
