/**
 * Testes do Radar de opções no app (Fase 04, parte 4.3a).
 * Rodar com: npm test
 *
 * O arquivo do radar é gerado pelo robô (tests/radar-robo.test.js confere
 * que o arquivo dele passa por aqui). Valores fictícios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDERECO_RADAR,
  FORMATO_RADAR,
  VERSAO_RADAR,
  HORAS_PARA_BUSCAR_DE_NOVO,
  DIAS_PARA_AVISAR_ATRASO,
  INDEXADORES,
  lerRadar,
  deveBuscarRadar,
  radarAtrasado,
  textoDaTaxa,
  titulosDoTesouro,
} from '../src/radar.js';

const titulo = (mudanca = {}) => ({
  nome: 'Tesouro Selic 2031', tipo: 'Tesouro Selic', indexador: 'selic',
  vencimento: '2031-03-01', taxaCompra: 0.07, precoCompraCentavos: 1712345, ...mudanca,
});

const radar = (mudanca = {}) => ({
  formato: FORMATO_RADAR,
  versao: VERSAO_RADAR,
  geradoEm: '2026-10-10T10:31:00.000Z',
  tesouro: {
    fonte: 'Tesouro Nacional (Tesouro Transparente)',
    link: 'https://www.tesourotransparente.gov.br/',
    dataBase: '2026-10-09',
    titulos: [
      titulo(),
      titulo({ nome: 'Tesouro Prefixado 2029', tipo: 'Tesouro Prefixado', indexador: 'prefixado', taxaCompra: 13.52, precoCompraCentavos: 75432 }),
      titulo({ nome: 'Tesouro IPCA+ 2035', tipo: 'Tesouro IPCA+', indexador: 'ipca', taxaCompra: 7.2, precoCompraCentavos: 234567 }),
    ],
  },
  ...mudanca,
});

describe('endereço e identificação', () => {
  it('lê o arquivo público que o robô publica na branch radar-dados', () => {
    assert.equal(ENDERECO_RADAR, 'https://raw.githubusercontent.com/Icaroms/painel-financeiro/radar-dados/radar.json');
    assert.equal(FORMATO_RADAR, 'painel-financeiro-radar');
    assert.equal(VERSAO_RADAR, 1);
  });
});

describe('lerRadar', () => {
  it('radar certo volta igual', () => {
    const r = radar();
    assert.equal(lerRadar(r), r);
  });

  it('erros claros', () => {
    assert.throws(() => lerRadar(null), /não é do Painel Financeiro/);
    assert.throws(() => lerRadar({ ...radar(), formato: 'outro' }), /não é do Painel Financeiro/);
    assert.throws(() => lerRadar(radar({ versao: VERSAO_RADAR + 1 })), /versão mais nova do app/);
    assert.throws(() => lerRadar(radar({ geradoEm: 'ontem' })), /não diz quando foi gerado/);
    const semPreco = radar();
    semPreco.tesouro.titulos[0].precoCompraCentavos = 0;
    assert.throws(() => lerRadar(semPreco), /Tesouro Direto do radar está incompleta/);
  });
});

describe('quando buscar e quando avisar', () => {
  const agora = new Date('2026-10-10T18:00:00.000Z');
  const horasAntes = (horas) => new Date(agora.getTime() - horas * 3600 * 1000).toISOString();

  it(`busca de novo depois de ${HORAS_PARA_BUSCAR_DE_NOVO} horas, ou sem busca anterior`, () => {
    assert.equal(deveBuscarRadar(undefined, agora), true);
    assert.equal(deveBuscarRadar(horasAntes(HORAS_PARA_BUSCAR_DE_NOVO - 0.1), agora), false);
    assert.equal(deveBuscarRadar(horasAntes(HORAS_PARA_BUSCAR_DE_NOVO), agora), true);
  });

  it(`avisa com radar de mais de ${DIAS_PARA_AVISAR_ATRASO} dias (o robô pode ter parado)`, () => {
    assert.equal(radarAtrasado(radar({ geradoEm: horasAntes(24 * DIAS_PARA_AVISAR_ATRASO - 1) }), agora), false);
    assert.equal(radarAtrasado(radar({ geradoEm: horasAntes(24 * DIAS_PARA_AVISAR_ATRASO + 1) }), agora), true);
  });
});

describe('textoDaTaxa', () => {
  it('do jeito que o Tesouro Direto mostra', () => {
    assert.equal(textoDaTaxa({ indexador: 'selic', taxaCompra: 0.07 }), 'Selic + 0,07% ao ano');
    assert.equal(textoDaTaxa({ indexador: 'selic', taxaCompra: -0.01 }), 'Selic − 0,01% ao ano');
    assert.equal(textoDaTaxa({ indexador: 'ipca', taxaCompra: 7.2 }), 'IPCA + 7,20% ao ano');
    assert.equal(textoDaTaxa({ indexador: 'igpm', taxaCompra: 6.4 }), 'IGP-M + 6,40% ao ano');
    assert.equal(textoDaTaxa({ indexador: 'prefixado', taxaCompra: 13.52 }), '13,52% ao ano');
  });
});

describe('titulosDoTesouro', () => {
  it('todos, ou só um tipo de rendimento', () => {
    assert.equal(titulosDoTesouro(radar()).length, 3);
    assert.deepEqual(titulosDoTesouro(radar(), 'ipca').map((t) => t.nome), ['Tesouro IPCA+ 2035']);
    assert.deepEqual(INDEXADORES.map((i) => i.id), ['selic', 'prefixado', 'ipca', 'igpm']);
  });
});
