/**
 * Testes do painel da tela de lançamento.
 * Rodar com: npm test
 *
 * Usa os dados de exemplo (fictícios) num dia fixo: 10 de novembro de 2026.
 * Situação inicial do exemplo: Lanches R$ 100 de R$ 200, Transporte R$ 60
 * de R$ 300, Mercado R$ 150 de R$ 600, Diversos R$ 40 sem orçamento.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calcularPainel, tituloDoMes, problemaNaDataDoGasto } from '../src/painel.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { dadosDoMes } from '../src/meses.js';
import { formatarCentavos } from '../src/dinheiro.js';

const HOJE = '2026-11-10';

/** Visão de novembro dos dados de exemplo (o formato que a tela usa). */
function exemploDeNovembro() {
  return dadosDoMes(criarDadosDeExemplo(HOJE), '2026-11');
}

function painel(valorTexto, nomeCategoria, dados = exemploDeNovembro()) {
  const categoria = dados.categorias.find((c) => c.nome === nomeCategoria);
  return calcularPainel({ dados, valorTexto, categoriaId: categoria.id, formaPagamento: 'Pix', hoje: HOJE });
}

describe('tituloDoMes', () => {
  it('escreve o mês por extenso com inicial maiúscula', () => {
    assert.equal(tituloDoMes('2026-11'), 'Novembro de 2026');
    assert.equal(tituloDoMes('2027-01'), 'Janeiro de 2027');
  });
});

describe('dados de exemplo', () => {
  it('são montados no mês do dia informado', () => {
    const dados = criarDadosDeExemplo('2027-03-15');
    assert.equal(dados.meses.length, 1);
    assert.equal(dados.meses[0].mes, '2027-03');
    assert.ok(dados.lancamentos.every((l) => l.data === '2027-03-01'));
  });
});

describe('calcularPainel sem valor', () => {
  it('fica neutro e não gera lançamento', () => {
    const p = painel('', 'Lanches');
    assert.equal(p.cor, 'neutro');
    assert.equal(p.lancamento, null);
    assert.equal(p.frase, 'Digite um valor para ver o veredito.');
  });

  it('valor digitado errado também fica neutro, sem erro', () => {
    for (const texto of ['abc', '0', '12,345', '0,00']) {
      assert.equal(painel(texto, 'Lanches').cor, 'neutro', `texto "${texto}"`);
    }
  });

  it('mostra a situação atual do mês', () => {
    const p = painel('', 'Lanches');
    // 1500,00 − 389,80 de fixos − 350,00 de gastos = 760,20
    assert.equal(p.linhaSaldo, 'O mês fecha em R$\u00a0760,20');
    assert.equal(p.numero, 'R$\u00a0100,00');
    assert.equal(p.usadoTexto, 'Usado: 50%');
  });
});

describe('calcularPainel com valor', () => {
  it('Lanches com R$ 40 no dia 10: amarelo, ritmo acelerado', () => {
    const p = painel('40,00', 'Lanches');
    assert.equal(p.cor, 'amarelo');
    assert.equal(p.frase, 'Atenção: Lanches está acelerado. Sobram R$\u00a060,00.');
    assert.equal(p.usadoTexto, 'Usado: 70%');
    assert.equal(p.linhaSaldo, 'Com este gasto, o mês fecha em R$\u00a0720,20');
    assert.ok(p.lancamento !== null);
    assert.equal(p.lancamento.valorCentavos, 4000);
    assert.equal(p.lancamento.data, HOJE);
  });

  it('Mercado com R$ 40: verde', () => {
    const p = painel('40', 'Mercado');
    assert.equal(p.cor, 'verde');
    assert.equal(p.legenda, 'sobram em Mercado de R$\u00a0600,00');
  });

  it('Lanches com R$ 120: vermelho, categoria estourada', () => {
    const p = painel('120,00', 'Lanches');
    assert.equal(p.cor, 'vermelho');
    assert.equal(p.legenda, 'acima do orçamento de Lanches');
  });

  it('Diversos (sem orçamento): o número mostrado é o saldo do mês', () => {
    const p = painel('10,00', 'Diversos');
    assert.equal(p.cor, 'verde');
    assert.equal(p.numero, 'R$\u00a0750,20');
    assert.equal(p.usadoTexto, 'Sem orçamento');
  });

  it('textos do cabeçalho', () => {
    const p = painel('', 'Lanches');
    assert.equal(p.tituloMes, 'Novembro de 2026');
    assert.equal(p.diaTexto, 'Dia 10 de 30');
    assert.equal(p.hojeTexto, 'Hoje: 33% do mês');
  });
});

describe('calcularPainel com categoria inexistente', () => {
  it('lança erro', () => {
    const dados = exemploDeNovembro();
    assert.throws(
      () => calcularPainel({ dados, valorTexto: '10', categoriaId: 'nao-existe', formaPagamento: 'Pix', hoje: HOJE }),
      { name: 'ErroValidacao', campo: 'categoriaId' },
    );
  });
});

describe('data do gasto', () => {
  /** Painel de Lanches com um valor e uma data escolhida. */
  function comData(valorTexto, data) {
    const dados = exemploDeNovembro();
    const lanches = dados.categorias.find((c) => c.nome === 'Lanches');
    return calcularPainel({ dados, valorTexto, categoriaId: lanches.id, formaPagamento: 'Pix', hoje: HOJE, data });
  }

  it('sem data escolhida, o gasto é de hoje', () => {
    const p = painel('10', 'Lanches');
    assert.equal(p.lancamento.data, HOJE);
    assert.equal(p.dataAnterior, false);
    assert.equal(p.dataTexto, 'Hoje');
  });

  it('aceita um dia anterior do mesmo mês e guarda o gasto nessa data', () => {
    const p = comData('10', '2026-11-03');
    assert.equal(p.lancamento.data, '2026-11-03');
    assert.equal(p.dataAnterior, true);
    assert.equal(p.dataTexto, 'Gasto do dia 03/11');
  });

  it('o veredito julga o mês como ele está hoje, qualquer que seja a data', () => {
    // Mesmo valor, datas diferentes: a cor e a frase são as mesmas.
    const deHoje = comData('40', HOJE);
    const antigo = comData('40', '2026-11-02');
    assert.equal(antigo.cor, deHoje.cor);
    assert.equal(antigo.frase, deHoje.frase);
  });

  it('data no futuro ou de outro mês não gera lançamento e explica o motivo', () => {
    const futuro = comData('10', '2026-11-11');
    assert.equal(futuro.lancamento, null);
    assert.equal(futuro.cor, 'neutro');
    assert.equal(futuro.frase, 'A data do gasto não pode ser depois de hoje.');

    const outroMes = comData('10', '2026-10-31');
    assert.equal(outroMes.lancamento, null);
    assert.match(outroMes.frase, /novembro de 2026/);
  });

  it('problemaNaDataDoGasto', () => {
    assert.equal(problemaNaDataDoGasto('2026-11-01', HOJE), null);
    assert.equal(problemaNaDataDoGasto(HOJE, HOJE), null);
    assert.equal(problemaNaDataDoGasto('', HOJE), 'Escolha uma data válida para o gasto.');
    assert.equal(problemaNaDataDoGasto('2026-11-31', HOJE), 'Escolha uma data válida para o gasto.');
  });
});

describe('compra no cartão no painel', () => {
  // No exemplo, "Crédito" é um cartão que fecha dia 3 e vence dia 10.
  function noCartao(valorTexto, parcelas) {
    const dados = exemploDeNovembro();
    const diversos = dados.categorias.find((c) => c.nome === 'Diversos');
    return calcularPainel({
      dados, valorTexto, categoriaId: diversos.id, formaPagamento: 'Crédito', hoje: HOJE, parcelas,
    });
  }

  it('mostra as parcelas e quando a 1ª é paga', () => {
    const p = noCartao('300', 3);
    assert.equal(p.ehCartao, true);
    assert.equal(p.lancamento.parcelas, 3);
    assert.equal(p.cartaoTexto, '3x de R$ 100,00 · 1ª parcela paga em 10/12');
  });

  it('o saldo julgado é o do mês da fatura, como estimativa', () => {
    const p = noCartao('50', 1);
    assert.equal(p.cartaoTexto, 'À vista no cartão · paga em 10/12');
    assert.match(p.linhaSaldo, /^Com esta compra, dezembro de 2026 deve fechar em .+ \(estimativa\)$/);
  });

  // Limite (parte 2.4): Crédito tem R$ 2.000 e o Mercado de R$ 150 está na fatura de novembro, ainda prevista.
  it('sem valor: mostra o limite disponível', () => {
    const p = noCartao('', 1);
    assert.equal(p.limiteTexto, `Limite disponível: ${formatarCentavos(185000)} de ${formatarCentavos(200000)}`);
    assert.equal(p.limiteEstourado, false);
  });

  it('com valor: mostra o limite que sobra depois da compra (o valor inteiro, mesmo parcelado)', () => {
    const p = noCartao('300', 3);
    assert.equal(p.limiteTexto, `Limite depois desta compra: ${formatarCentavos(155000)} de ${formatarCentavos(200000)}`);
    assert.equal(p.limiteEstourado, false);
  });

  it('compra que passa do limite: veredito vermelho com o limite disponível', () => {
    const p = noCartao('1900', 10);
    assert.equal(p.limiteEstourado, true);
    assert.equal(p.cor, 'vermelho');
    assert.equal(p.frase, `Passou do limite: o Crédito tem ${formatarCentavos(185000)} disponíveis.`);
    assert.equal(p.limiteTexto, `Passa do limite em ${formatarCentavos(5000)} (limite de ${formatarCentavos(200000)})`);
  });

  it('exatamente o limite disponível ainda cabe', () => {
    const p = noCartao('1850', 10);
    assert.equal(p.limiteEstourado, false);
    assert.equal(p.limiteTexto, `Limite depois desta compra: ${formatarCentavos(0)} de ${formatarCentavos(200000)}`);
  });

  it('forma que não é cartão ignora as parcelas', () => {
    const dados = exemploDeNovembro();
    const diversos = dados.categorias.find((c) => c.nome === 'Diversos');
    const p = calcularPainel({ dados, valorTexto: '50', categoriaId: diversos.id, formaPagamento: 'Pix', hoje: HOJE, parcelas: 3 });
    assert.equal(p.ehCartao, false);
    assert.equal(p.lancamento.parcelas, 1);
    assert.equal(p.cartaoTexto, '');
    assert.equal(p.limiteTexto, '');
    assert.equal(p.limiteEstourado, false);
  });
});
