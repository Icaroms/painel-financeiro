/**
 * Testes do Radar de opções no app (Fase 04, partes 4.3a e 4.3b).
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
  LISTAS_DO_MERCADO,
  PERIODOS,
  FAIXAS_DE_PRECO,
  LIMITE_DA_LISTA,
  periodoDisponivel,
  listaDoMercado,
  textoDaVariacao,
  textoDoVolume,
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

/** Ativo da B3 de teste. */
const ativo = (codigo, tipo, preco, volume, semana, mes, ano) => ({
  codigo, nome: `NOME ${codigo}`, tipo, precoCentavos: preco, volumeCentavos: volume, negocios: 100,
  variacoes: { semana, mes, ano },
});

/** Radar com a parte de ações e FIIs (12 meses sem pregão de referência). */
const comMercado = () => radar({
  mercado: {
    fonte: 'B3 (Série Histórica de Cotações)',
    link: 'https://www.b3.com.br/',
    dataBase: '2026-10-09',
    referencias: { semana: '2026-10-02', mes: '2026-09-09', ano: null },
    ativos: [
      ativo('AAAA3', 'acao', 3456, 900_000_000, 2.1, 8.2, null),
      ativo('BBBB4', 'acao', 850, 500_000_000, -1.5, -12.3, null),
      ativo('CCCC3', 'acao', 15000, 300_000_000, 0.4, 3.0, null),
      ativo('DDDD3', 'acao', 420, 150_000_000, 5.0, null, null), // desdobramento no mês
      ativo('FIIA11', 'fii', 9800, 80_000_000, 0.8, 1.9, null),
      ativo('FIIB11', 'fii', 1050, 40_000_000, -0.6, -2.4, null),
    ],
  },
});

describe('endereço e identificação', () => {
  it('lê o arquivo público que o robô publica na branch radar-dados', () => {
    assert.equal(ENDERECO_RADAR, 'https://raw.githubusercontent.com/Icaroms/painel-financeiro/radar-dados/radar.json');
    assert.equal(FORMATO_RADAR, 'painel-financeiro-radar');
    assert.equal(VERSAO_RADAR, 1);
  });
});

describe('lerRadar', () => {
  it('radar certo volta igual; parte que falta vira null', () => {
    const r = radar();
    assert.deepEqual(lerRadar(r), { ...r, mercado: null });
    assert.deepEqual(lerRadar({ ...comMercado(), tesouro: null }).tesouro, null);
  });

  it('radar sem nenhuma parte é recusado', () => {
    assert.throws(() => lerRadar({ ...radar(), tesouro: null }), /O radar veio vazio/);
  });

  it('parte de ações e FIIs incompleta é recusada', () => {
    const r = comMercado();
    r.mercado.ativos[0].tipo = 'etf';
    assert.throws(() => lerRadar(r), /ações e FIIs do radar está incompleta/);
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

describe('ações e FIIs (parte 4.3b)', () => {
  const r = lerRadar(comMercado());

  it('listas, períodos e faixas de preço', () => {
    assert.deepEqual(LISTAS_DO_MERCADO.map((l) => l.id), ['altas', 'baixas', 'negociados']);
    assert.deepEqual(PERIODOS.map((p) => p.texto), ['na semana', 'no mês', 'em 12 meses']);
    assert.deepEqual(FAIXAS_DE_PRECO.map((f) => f.maximoCentavos), [null, 1000, 5000, 10000]);
    assert.equal(LIMITE_DA_LISTA, 20);
  });

  it('período sem pregão de referência não está disponível', () => {
    assert.equal(periodoDisponivel(r, 'mes'), true);
    assert.equal(periodoDisponivel(r, 'ano'), false);
    assert.equal(periodoDisponivel(radar(), 'mes'), false); // radar sem a parte de ações
  });

  it('maiores altas: só quem subiu, da maior alta para a menor (variação vazia fica de fora)', () => {
    assert.deepEqual(listaDoMercado(r, { tipo: 'acao', lista: 'altas', periodo: 'mes' }).map((a) => a.codigo), ['AAAA3', 'CCCC3']);
    assert.deepEqual(listaDoMercado(r, { tipo: 'acao', lista: 'altas', periodo: 'semana' }).map((a) => a.codigo), ['DDDD3', 'AAAA3', 'CCCC3']);
  });

  it('maiores baixas: só quem caiu, da maior queda para a menor', () => {
    assert.deepEqual(listaDoMercado(r, { tipo: 'acao', lista: 'baixas', periodo: 'mes' }).map((a) => a.codigo), ['BBBB4']);
    assert.deepEqual(listaDoMercado(r, { tipo: 'fii', lista: 'baixas', periodo: 'mes' }).map((a) => a.codigo), ['FIIB11']);
  });

  it('mais negociados: pelo volume do dia', () => {
    assert.deepEqual(listaDoMercado(r, { tipo: 'acao', lista: 'negociados', periodo: 'mes' }).map((a) => a.codigo), ['AAAA3', 'BBBB4', 'CCCC3', 'DDDD3']);
  });

  it('preço máximo de 1 unidade (ex.: o que cabe na parte Investir do mês)', () => {
    assert.deepEqual(listaDoMercado(r, { tipo: 'acao', lista: 'negociados', periodo: 'mes', precoMaximoCentavos: 1000 }).map((a) => a.codigo), ['BBBB4', 'DDDD3']);
    assert.deepEqual(listaDoMercado(r, { tipo: 'fii', lista: 'altas', periodo: 'mes', precoMaximoCentavos: 5000 }).map((a) => a.codigo), []);
  });

  it('no máximo 20 por lista', () => {
    const muitos = comMercado();
    muitos.mercado.ativos = Array.from({ length: 30 }, (_, i) => ativo(`XX${String(i).padStart(2, '0')}3`, 'acao', 1000, 200_000_000 - i, 1, 1, 1));
    assert.equal(listaDoMercado(lerRadar(muitos), { tipo: 'acao', lista: 'negociados', periodo: 'mes' }).length, 20);
  });

  it('textos da variação e do volume', () => {
    assert.equal(textoDaVariacao(8.2), '+8,2%');
    assert.equal(textoDaVariacao(-12.3), '−12,3%');
    assert.equal(textoDaVariacao(0), '0,0%');
    assert.equal(textoDaVariacao(null), '—');
    assert.equal(textoDoVolume(123_456_789_000), 'R$ 1,2 bi');
    assert.equal(textoDoVolume(4_530_000_000), 'R$ 45,3 mi');
    assert.equal(textoDoVolume(30_000_000), 'R$ 300 mil');
  });
});
