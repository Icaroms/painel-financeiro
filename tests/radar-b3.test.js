/**
 * Testes do robô do Radar: cotações da B3 (Fase 04, parte 4.3b).
 * Rodar com: npm test
 *
 * Nenhum teste usa a internet. As linhas de teste são montadas campo a
 * campo nas posições do layout oficial da B3 (SeriesHistoricas_Layout.pdf),
 * com códigos e valores fictícios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  enderecoDoDia,
  LIQUIDEZ_MINIMA,
  lerLinhaCotahist,
  lerCotahist,
  pareceDesdobramento,
  variacao,
  montarMercado,
} from '../scripts/radar/b3.js';
import { menosDias, menosMeses, datasParaTentar, datasDosPeriodos, hojeEmBrasilia, DIAS_PARA_TRAS } from '../scripts/radar/baixar.js';
import { montarRadar } from '../scripts/radar/gerar-radar.js';
import { lerRadar } from '../src/radar.js';

/** Escreve um valor numa posição da linha (posições do layout, começando em 1). */
function colocar(linha, inicio, fim, valor, { numero = false } = {}) {
  const tamanho = fim - inicio + 1;
  const texto = numero ? String(valor).padStart(tamanho, '0') : String(valor).padEnd(tamanho, ' ');
  return linha.slice(0, inicio - 1) + texto.slice(0, tamanho) + linha.slice(fim);
}

/** Linha de cotação (TIPREG 01) com 245 caracteres. Preço e volume em centavos. */
function linha({ data = '20261009', codbdi = '02', codigo, tpmerc = '010', nome = 'EMPRESA', especi = 'ON', preco, negocios = 1000, volume, fator = 1 }) {
  let l = ' '.repeat(245);
  l = colocar(l, 1, 2, '01');
  l = colocar(l, 3, 10, data);
  l = colocar(l, 11, 12, codbdi);
  l = colocar(l, 13, 24, codigo);
  l = colocar(l, 25, 27, tpmerc);
  l = colocar(l, 28, 39, nome);
  l = colocar(l, 40, 49, especi);
  for (const [inicio, fim] of [[57, 69], [70, 82], [83, 95], [96, 108], [109, 121]]) l = colocar(l, inicio, fim, preco, { numero: true });
  l = colocar(l, 148, 152, negocios, { numero: true });
  l = colocar(l, 153, 170, 5000, { numero: true });
  l = colocar(l, 171, 188, volume, { numero: true });
  l = colocar(l, 211, 217, fator, { numero: true });
  return l;
}

/** Arquivo do dia com cabeçalho (00) e rodapé (99), como o da B3. */
const arquivo = (data, linhas) => [
  `00COTAHIST.${data.slice(0, 4)}BOVESPA ${data}`.padEnd(245, ' '),
  ...linhas,
  `99COTAHIST.${data.slice(0, 4)}BOVESPA ${data}`.padEnd(245, ' '),
].join('\r\n');

describe('endereço do arquivo do dia', () => {
  it('COTAHIST_D + DDMMAAAA', () => {
    assert.equal(enderecoDoDia('2026-10-09'), 'https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D09102026.ZIP');
  });
});

describe('lerLinhaCotahist (posições do layout oficial)', () => {
  it('lê data, classificação, código, mercado, nome, preço, negócios e volume', () => {
    const r = lerLinhaCotahist(linha({ codigo: 'AAAA3', nome: 'EMPRESA A', preco: 3456, negocios: 12345, volume: 98_765_432_10 }));
    assert.deepEqual(r, {
      data: '2026-10-09', codbdi: '02', codigo: 'AAAA3', tpmerc: '010', nome: 'EMPRESA A', especificacao: 'ON',
      precoCentavos: 3456, negocios: 12345, volumeCentavos: 98_765_432_10, fator: 1,
    });
  });

  it('cotação por lote de mil (FATCOT 1000) vira preço de 1 unidade', () => {
    assert.equal(lerLinhaCotahist(linha({ codigo: 'LOTE3', preco: 1_234_000, volume: 1, fator: 1000 })).precoCentavos, 1234);
  });

  it('cabeçalho, rodapé e linha curta são ignorados', () => {
    assert.equal(lerLinhaCotahist('00COTAHIST.2026BOVESPA 20261009'.padEnd(245, ' ')), null);
    assert.equal(lerLinhaCotahist('01curta'), null);
  });
});

describe('lerCotahist', () => {
  const texto = arquivo('20261009', [
    linha({ codigo: 'AAAA3', preco: 3456, volume: 900_000_000 }),
    linha({ codigo: 'FIIA11', codbdi: '12', especi: 'CI', preco: 9800, volume: 80_000_000 }),
    linha({ codigo: 'AAAA3F', codbdi: '96', tpmerc: '020', preco: 3457, volume: 1_000_000 }), // fracionário: fora
    linha({ codigo: 'BOVA11', codbdi: '14', preco: 12000, volume: 5_000_000_000 }), // ETF: fora (por enquanto)
    linha({ codigo: 'AAAA3J', codbdi: '78', tpmerc: '070', preco: 50, volume: 9_000_000 }), // opção: fora
    linha({ codigo: 'RJUD3', codbdi: '08', preco: 100, volume: 200_000_000 }), // recuperação judicial: fora
  ]);

  it('só ações do lote padrão e FIIs à vista, com o tipo', () => {
    const { data, papeis } = lerCotahist(texto);
    assert.equal(data, '2026-10-09');
    assert.deepEqual([...papeis.keys()], ['AAAA3', 'FIIA11']);
    assert.equal(papeis.get('FIIA11').tipo, 'fii');
    assert.equal(papeis.get('AAAA3').tipo, 'acao');
  });

  it('arquivo sem cotação (ex.: página de erro) dá erro claro', () => {
    assert.throws(() => lerCotahist('<html>não encontrado</html>'), /não tem nenhuma linha de cotação/);
  });
});

describe('variação e desdobramento', () => {
  it('variação com 1 casa; sem preço antigo fica vazia', () => {
    assert.equal(variacao(1000, 1082), 8.2);
    assert.equal(variacao(1000, 877), -12.3);
    assert.equal(variacao(undefined, 1000), null);
  });

  it('preço que vira 1/2, 1/10 ou 3x parece desdobramento ou grupamento: variação vazia', () => {
    assert.equal(pareceDesdobramento(4000, 2010), true); // 1 para 2
    assert.equal(pareceDesdobramento(5000, 498), true); // 1 para 10
    assert.equal(pareceDesdobramento(100, 301), true); // grupamento 3 para 1
    assert.equal(pareceDesdobramento(1000, 1450), false); // alta de 45%: normal
    assert.equal(pareceDesdobramento(1000, 2500), false); // 2,5x não é inteiro
    assert.equal(variacao(4000, 2010), null);
  });
});

describe('datas dos pregões', () => {
  it('menos dias e menos meses (preso ao fim do mês)', () => {
    assert.equal(menosDias('2026-10-01', 1), '2026-09-30');
    assert.equal(menosMeses('2026-10-09', 1), '2026-09-09');
    assert.equal(menosMeses('2026-03-31', 1), '2026-02-28');
    assert.equal(menosMeses('2026-01-15', 12), '2025-01-15');
    assert.equal(menosMeses('2026-01-15', 1), '2025-12-15');
  });

  it(`tenta ${DIAS_PARA_TRAS} dias para trás (fim de semana e feriados)`, () => {
    assert.deepEqual(datasParaTentar('2026-10-12', 3), ['2026-10-12', '2026-10-11', '2026-10-10']);
    assert.equal(datasParaTentar('2026-10-12').length, DIAS_PARA_TRAS);
  });

  it('referências: 1 semana, 1 mês e 12 meses antes', () => {
    assert.deepEqual(datasDosPeriodos('2026-10-09'), { semana: '2026-10-02', mes: '2026-09-09', ano: '2025-10-09' });
  });

  it('"hoje" em Brasília: 01h UTC ainda é o dia anterior', () => {
    assert.equal(hojeEmBrasilia(new Date('2026-10-10T01:00:00Z')), '2026-10-09');
    assert.equal(hojeEmBrasilia(new Date('2026-10-10T10:30:00Z')), '2026-10-10');
  });
});

describe('montarMercado', () => {
  const atual = lerCotahist(arquivo('20261009', [
    linha({ codigo: 'AAAA3', preco: 1082, volume: 900_000_000 }),
    linha({ codigo: 'BBBB4', preco: 877, volume: 500_000_000 }),
    linha({ codigo: 'POUCO3', preco: 500, volume: LIQUIDEZ_MINIMA.acao - 1 }), // pouca negociação: fora
    linha({ codigo: 'FIIA11', codbdi: '12', preco: 9800, volume: LIQUIDEZ_MINIMA.fii }),
    linha({ codigo: 'NOVA3', preco: 2000, volume: 200_000_000 }), // não existia no mês passado
  ]));
  const mes = lerCotahist(arquivo('20260909', [
    linha({ data: '20260909', codigo: 'AAAA3', preco: 1000, volume: 1 }),
    linha({ data: '20260909', codigo: 'BBBB4', preco: 1000, volume: 1 }),
    linha({ data: '20260909', codigo: 'FIIA11', codbdi: '12', preco: 9600, volume: 1 }),
  ]));
  const mercado = montarMercado({ atual, referencias: { mes } });

  it('fonte, data e de quando é cada referência (semana e 12 meses sem pregão)', () => {
    assert.equal(mercado.dataBase, '2026-10-09');
    assert.deepEqual(mercado.referencias, { semana: null, mes: '2026-09-09', ano: null });
    assert.match(mercado.link, /^https:\/\/www\.b3\.com\.br\//);
  });

  it('só com liquidez, ordenados por volume, com as variações', () => {
    assert.deepEqual(mercado.ativos.map((a) => a.codigo), ['AAAA3', 'BBBB4', 'NOVA3', 'FIIA11']);
    assert.deepEqual(mercado.ativos[0].variacoes, { semana: null, mes: 8.2, ano: null });
    assert.equal(mercado.ativos[1].variacoes.mes, -12.3);
    assert.equal(mercado.ativos[2].variacoes.mes, null);
    assert.equal(mercado.ativos[3].variacoes.mes, 2.1);
  });

  it('o radar com tesouro vazio e mercado passa na conferência do app', () => {
    const radar = JSON.parse(JSON.stringify(montarRadar({ tesouro: null, mercado })));
    assert.equal(radar.tesouro, null);
    assert.equal(lerRadar(radar).mercado.ativos.length, 4);
  });
});
