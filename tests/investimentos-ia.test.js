/**
 * Testes dos indicadores da carteira e da IA dos investimentos (Fase 04, parte 4.6).
 * Rodar com: npm test
 *
 * Histórico de teste com números redondos: CDI de 1% e IPCA de 0,5% em todo mês.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAS_MINIMOS_PARA_COMPARAR,
  comparacaoDaAplicacao,
  indicadoresDaCarteira,
  textoDaComparacao,
  linhasDosIndicadores,
  INSTRUCOES_CARTEIRA,
  mensagemDaCarteira,
} from '../src/investimentos-ia.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { adicionarInvestimento } from '../src/carteira.js';
import { comEstimativas } from '../src/renda-fixa.js';

const HOJE = '2026-10-10';

function meses(de, ate) {
  const lista = [];
  for (let [a, m] = de.split('-').map(Number); `${a}-${String(m).padStart(2, '0')}` <= ate; m === 12 ? (a += 1, m = 1) : (m += 1)) {
    lista.push(`${a}-${String(m).padStart(2, '0')}`);
  }
  return lista;
}
const diasDoMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

const HISTORICO = {
  inicio: '2016-01',
  cdi: [
    ...meses('2016-01', '2026-09').map((mes) => ({ mes, percentual: 1, ultimoDia: diasDoMes(mes) })),
    { mes: '2026-10', percentual: 0.4, ultimoDia: 8 },
  ],
  ipca: meses('2016-01', '2026-09').map((mes) => ({ mes, percentual: 0.5 })),
};
const RADAR = {
  taxas: {
    selicMeta: { valor: 13.75, data: '2026-10-09' },
    cdi: { anual: 13.65, data: '2026-10-08' },
    ipca: { mes: '2026-09', mensal: 0.82, acumulado12m: 4.58 },
    poupanca: { mensal: 0.6218, data: '2026-10-08' },
    historico: HISTORICO,
  },
};

/** Exemplo do app sem investimentos, mais os investimentos pedidos. */
function carteira(...investimentos) {
  let estado = { ...criarDadosDeExemplo(HOJE), investimentos: [] };
  let n = 0;
  for (const dados of investimentos) {
    n += 1;
    estado = adicionarInvestimento(estado, dados, { hoje: HOJE, gerarId: () => `inv-${n}` });
  }
  return estado;
}

const cdb = {
  tipo: 'cdb', nome: 'CDB 100', dataAplicacao: '2026-01-01', valorAplicadoCentavos: 100000, reserva: true,
  taxa: { indexador: 'cdi', percentual: 100 },
};
const poupanca = {
  tipo: 'poupanca', nome: 'Poupança antiga', dataAplicacao: '2026-01-01', valorAplicadoCentavos: 50000,
  valorAtualCentavos: 51000, valorAtualEm: '2026-05-01',
};

describe('comparacaoDaAplicacao', () => {
  it('CDB a 100% do CDI estimado: 100% do CDI e ganho real sobre o IPCA do período', () => {
    const estado = comEstimativas(carteira(cdb), HISTORICO, HOJE);
    const inv = estado.investimentos[0];
    const c = comparacaoDaAplicacao({ investimento: inv, aplicadoCentavos: 100000, atualCentavos: inv.valorAtualCentavos }, HISTORICO);
    assert.equal(c.dias, 281); // 01/01 a 09/10/2026
    assert.ok(Math.abs(c.percentualDoCdi - 100) < 0.01);
    const ipca = 1.005 ** 9 * 1.005 ** (8 / 31) - 1; // jan a set + 8 dias de out (projetado)
    assert.ok(Math.abs(c.ipcaNoPeriodo - ipca * 100) < 0.01);
    assert.ok(c.ganhoReal > 0);
  });

  it('sem comparação: sem histórico, antes de 2016 ou menos de 30 dias', () => {
    const item = (dataAplicacao, valorAtualEm) => ({
      investimento: { dataAplicacao, valorAtualEm }, aplicadoCentavos: 100, atualCentavos: 101,
    });
    assert.equal(comparacaoDaAplicacao(item('2026-01-01', '2026-06-01'), null), null);
    assert.equal(comparacaoDaAplicacao(item('2015-01-01', '2026-06-01'), HISTORICO), null);
    assert.equal(DIAS_MINIMOS_PARA_COMPARAR, 30);
    assert.equal(comparacaoDaAplicacao(item('2026-06-01', '2026-06-20'), HISTORICO), null);
  });
});

describe('indicadoresDaCarteira', () => {
  it('carteira vazia: null', () => {
    assert.equal(indicadoresDaCarteira(carteira(), RADAR, HOJE), null);
  });

  it('concentração, liquidez, reserva, comparações, pendências e fatos de atenção', () => {
    const estado = comEstimativas(carteira(cdb, poupanca, {
      tipo: 'cdb', nome: 'CDB sem taxa', dataAplicacao: '2026-09-20', valorAplicadoCentavos: 10000,
    }), HISTORICO, HOJE);
    const ind = indicadoresDaCarteira(estado, RADAR, HOJE);
    assert.equal(ind.quantidade, 3);
    assert.equal(ind.maiorPosicao.nome, 'CDB 100');
    assert.ok(ind.maiorPosicao.fracao > 0.5);
    assert.equal(ind.liquidez.fracao, 1); // tudo em renda fixa
    assert.equal(ind.reserva.atualCentavos, estado.investimentos[0].valorAtualCentavos);
    assert.ok(ind.reserva.mesesCobertos > 0 && ind.reserva.mesesCobertos < 1);
    assert.equal(ind.aplicacoes.length, 3);
    assert.equal(ind.aplicacoes[0].taxa, '100% do CDI');
    assert.equal(ind.aplicacoes[0].estimado, true);
    // Poupança: R$ 500 → R$ 510 em 120 dias (2%), CDI ~4% no período: rendeu menos que o CDI.
    const poup = ind.aplicacoes.find((a) => a.nome === 'Poupança antiga');
    assert.ok(poup.comparacao.percentualDoCdi < 60);
    // CDB sem taxa, com 20 dias: sem comparação.
    assert.equal(ind.aplicacoes.find((a) => a.nome === 'CDB sem taxa').comparacao, null);
    assert.deepEqual(ind.pendencias, [
      'Poupança antiga: valor de 01/05/2026, há mais de 90 dias',
      'CDB sem taxa: sem a taxa contratada (o valor não é estimado)',
    ]);
    assert.match(ind.atencao[0], /A reserva de emergência está em \d+% da meta/);
    assert.match(ind.atencao[1], /^CDB 100 é \d+% da carteira\.$/);
    assert.equal(ind.taxas.poupanca.mensal, 0.6218);
  });

  it('aplicação abaixo da inflação vira fato de atenção; um investimento só também', () => {
    const estado = carteira({
      tipo: 'fundo', nome: 'Fundo ruim', dataAplicacao: '2026-01-01', valorAplicadoCentavos: 100000,
      valorAtualCentavos: 100500, valorAtualEm: '2026-10-01',
    });
    const ind = indicadoresDaCarteira(estado, RADAR, HOJE);
    assert.ok(ind.atencao.includes('A carteira inteira está em um investimento só.'));
    assert.ok(ind.atencao.includes('Fundo ruim rendeu menos que a inflação no período.'));
  });

  it('sem radar: indicadores sem comparações e sem taxas', () => {
    const ind = indicadoresDaCarteira(carteira(cdb), null, HOJE);
    assert.equal(ind.aplicacoes[0].comparacao, null);
    assert.equal(ind.taxas, null);
  });
});

describe('textos', () => {
  it('comparação e linhas do quadro', () => {
    assert.equal(
      textoDaComparacao({ dias: 300, rendimento: 11.2, cdiNoPeriodo: 10, percentualDoCdi: 112, ipcaNoPeriodo: 3, ganhoReal: 7.96 }),
      'rendeu +11,2% em 300 dias: 112% do CDI e ganho real de +8,0% (CDI +10,0%, IPCA +3,0% no período)',
    );
    const ind = indicadoresDaCarteira(comEstimativas(carteira(cdb, poupanca), HISTORICO, HOJE), RADAR, HOJE);
    const linhas = linhasDosIndicadores(ind);
    assert.deepEqual(linhas.slice(0, 3).map((l) => l.titulo), ['Maior posição', 'Liquidez', 'Reserva']);
    assert.match(linhas[0].texto, /^CDB 100 \(\d+% da carteira\)$/);
    assert.match(linhas[2].texto, /^cobre \d+,\d (mês|meses) de custo \(meta: 6\)$/);
    assert.ok(linhas.some((l) => l.titulo === 'CDB 100' && /100% do CDI/.test(l.texto)));
    assert.equal(linhas.at(-1).titulo, 'Pendências');
  });
});

describe('mensagemDaCarteira', () => {
  it('leva os números, as taxas, os fatos e as pendências; sem dados pessoais', () => {
    const ind = indicadoresDaCarteira(comEstimativas(carteira(cdb, poupanca), HISTORICO, HOJE), RADAR, HOJE);
    const { instrucoes, conteudo } = mensagemDaCarteira(ind);
    assert.equal(instrucoes, INSTRUCOES_CARTEIRA);
    assert.match(instrucoes, /Não diga para comprar, vender ou resgatar/);
    assert.match(instrucoes, /## Como está a carteira\n[\s\S]*## Pontos de atenção\n[\s\S]*## Para você decidir/);
    assert.match(conteudo, /- Total: R\$ [\d.,]+ \(aplicado R\$ 1\.500,00\), 2 investimentos\./);
    assert.match(conteudo, /CDB 100 \(CDB\): taxa contratada 100% do CDI, valor estimado; rendeu/);
    assert.match(conteudo, /Taxas de hoje \(Banco Central\): Selic 13\.75% ao ano; CDI 13\.65% ao ano; IPCA 4\.58% em 12 meses; poupança 0\.6218% ao mês\./);
    assert.match(conteudo, /Fatos que o app destacou:/);
    assert.match(conteudo, /Pendências de dados:\n- Poupança antiga: valor de 01\/05\/2026/);
    assert.doesNotMatch(conteudo, / /);
  });
});
