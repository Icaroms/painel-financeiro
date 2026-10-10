/**
 * Testes das mensagens que vão para a IA explicar (Fase 03, parte 3.2).
 * Rodar com: npm test
 *
 * Usa os dados de exemplo (fictícios) num dia fixo: 10 de novembro de 2026.
 * No exemplo, "Crédito" é um cartão (limite R$ 2.000, fecha dia 3, vence dia 10).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCOES_EXPLICAR, mensagemDaCompra, mensagemDaOpcaoSimulada } from '../src/explicacoes.js';
import { calcularPainel } from '../src/painel.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { dadosDoMes } from '../src/meses.js';
import { simularCompra } from '../src/simulador.js';

const HOJE = '2026-11-10';
const dados = () => dadosDoMes(criarDadosDeExemplo(HOJE), '2026-11');

function painel(valorTexto, nomeCategoria, formaPagamento = 'Pix', parcelas = 1) {
  const d = dados();
  const categoria = d.categorias.find((c) => c.nome === nomeCategoria);
  return calcularPainel({ dados: d, valorTexto, categoriaId: categoria.id, formaPagamento, hoje: HOJE, parcelas });
}

/** Nada de "undefined", "NaN" nem o espaço especial do Intl no texto enviado. */
function semDefeitos(texto) {
  assert.ok(!/undefined|NaN|null/.test(texto), `texto com defeito: ${texto}`);
  assert.ok(!texto.includes(' '), 'o texto usa espaço comum');
}

describe('INSTRUCOES_EXPLICAR', () => {
  it('traz as regras da fase: só explicar, não mudar o veredito, curto, sem investimentos', () => {
    assert.match(INSTRUCOES_EXPLICAR, /Use apenas os números fornecidos/);
    assert.match(INSTRUCOES_EXPLICAR, /Não mude o veredito/);
    assert.match(INSTRUCOES_EXPLICAR, /2 a 4 frases/);
    assert.match(INSTRUCOES_EXPLICAR, /nunca como ordem/);
    assert.match(INSTRUCOES_EXPLICAR, /Não recomende investimentos/);
    assert.match(INSTRUCOES_EXPLICAR, /português do Brasil/);
  });
});

describe('mensagemDaCompra', () => {
  it('compra no Pix com orçamento: categoria, ritmo, saldo e veredito', () => {
    const p = painel('50', 'Lanches');
    const { instrucoes, conteudo } = mensagemDaCompra(p, { hoje: HOJE });

    assert.equal(instrucoes, INSTRUCOES_EXPLICAR);
    assert.match(conteudo, /Compra que a pessoa está avaliando \(ainda NÃO foi lançada\): R\$ 50,00\./);
    assert.match(conteudo, /Hoje é 10\/11\/2026, dia 10 de 30 do mês\./);
    assert.match(conteudo, /Categoria: Lanches\. Orçamento do mês: R\$ 200,00\. Já gasto antes desta compra: R\$ 100,00\. Com a compra: R\$ 150,00\. Sobram R\$ 50,00 na categoria\./);
    assert.match(conteudo, /Ritmo: 75% do orçamento usado com 33% do mês passado/);
    assert.match(conteudo, /Pagamento: Pix, o dinheiro sai da conta agora\./);
    assert.match(conteudo, /Saldo: com esta compra, o mês deve fechar em R\$/);
    assert.match(conteudo, /Folga mínima de saldo que o app usa: R\$ 200,00\./);
    assert.ok(conteudo.includes(`Frase do app: "${p.frase.replace(/\u00a0/g, ' ')}"`));
    assert.ok(!conteudo.includes('Limite do'), 'Pix não tem limite');
    semDefeitos(conteudo);
  });

  it('compra parcelada no cartão: parcelas, 1º vencimento, mês mais apertado e limite', () => {
    const { conteudo } = mensagemDaCompra(painel('300', 'Diversos', 'Crédito', 3), { hoje: HOJE });
    assert.match(conteudo, /Pagamento: Crédito, em 3x de R\$ 100,00; a 1ª parcela é paga em 10\/12\/2026\./);
    assert.match(conteudo, /o mês mais apertado com parcela é .+ de 2027|o mês mais apertado com parcela é .+ de 2026/);
    assert.match(conteudo, /\(estimativa do app/);
    // Disponível: 2.000 − 150 (Mercado) − 79,80 (Streaming de novembro e dezembro) = 1.770,20.
    assert.match(conteudo, /Limite do Crédito: R\$ 1\.770,20 disponíveis de R\$ 2\.000,00 antes da compra; R\$ 1\.470,20 depois\./);
    semDefeitos(conteudo);
  });

  it('categoria sem orçamento: diz que vale só o saldo', () => {
    const { conteudo } = mensagemDaCompra(painel('40', 'Diversos'), { hoje: HOJE });
    assert.match(conteudo, /Categoria: Diversos, sem orçamento definido \(vale só o saldo do mês\)\./);
    assert.ok(!conteudo.includes('Ritmo:'));
    semDefeitos(conteudo);
  });

  it('acima do orçamento: diz quanto passou', () => {
    const { conteudo } = mensagemDaCompra(painel('150', 'Lanches'), { hoje: HOJE });
    assert.match(conteudo, /Passa do orçamento da categoria em R\$ 50,00\./);
    assert.match(conteudo, /Veredito do app: VERMELHO \(passou\)\./);
  });
});

describe('mensagemDaOpcaoSimulada', () => {
  const contexto = { formaPagamento: 'Crédito', aVistaCentavos: 100000, hoje: HOJE };

  it('opção real do simulador: juros, datas, limite e quando comprar', () => {
    const { opcoes } = simularCompra(dados(), {
      formaPagamento: 'Crédito', aVistaCentavos: 100000, opcoes: [{ parcelas: 10, totalCentavos: 115000 }], hoje: HOJE,
    });
    const { conteudo } = mensagemDaOpcaoSimulada(opcoes[1], contexto);
    assert.match(conteudo, /compra em 10x de R\$ 115,00 no Crédito \(total R\$ 1\.150,00\)\. Preço à vista: R\$ 1\.000,00\./);
    assert.match(conteudo, /Juros: R\$ 150,00, cerca de 2,6% ao mês\./);
    assert.match(conteudo, /Compra feita hoje, 10\/11\/2026\./);
    assert.match(conteudo, /1ª parcela paga em 10\/12\/2026\./);
    assert.match(conteudo, /Limite do cartão depois da compra: R\$ 620,20 de R\$ 2\.000,00\./);
    assert.match(conteudo, /Quando comprar, segundo o app:/);
    assert.match(conteudo, /Veredito do app para esta opção: (VERDE|AMARELO|VERMELHO)/);
    semDefeitos(conteudo);
  });

  /** Opção montada à mão, para cada caso do "quando comprar". */
  const opcao = (melhorMomento, extra = {}) => ({
    parcelas: 1, totalCentavos: 100000, valorParcelaCentavos: 100000, jurosCentavos: 0, taxaMensal: 0,
    compraFutura: false, dataDaCompra: HOJE, primeiroVencimento: '2026-12-10',
    limite: { limiteCentavos: 200000, disponivelDepoisCentavos: 77020, estimativa: false },
    piorMes: { mes: '2026-12', sobraCentavos: 50000 }, estimativa: true, cor: 'verde',
    melhorMomento, ...extra,
  });

  it('cabe agora', () => {
    const { conteudo } = mensagemDaOpcaoSimulada(opcao({ esperaMeses: 0, mesDaCompra: '2026-11', terminam: [] }), contexto);
    assert.match(conteudo, /compra à vista no Crédito, por R\$ 1\.000,00/);
    assert.match(conteudo, /Quando comprar, segundo o app: agora/);
    assert.ok(!conteudo.includes('Juros'), 'à vista não fala de juros');
  });

  it('cabe mais tarde: compara com agora e diz o que termina', () => {
    const { conteudo } = mensagemDaOpcaoSimulada(opcao({
      esperaMeses: 2, mesDaCompra: '2027-01',
      piorMes: { mes: '2027-01', sobraCentavos: 30000 }, piorMesAgora: { mes: '2026-12', sobraCentavos: -70000 },
      terminam: [{ nome: 'Amazon Ferramentas', mes: '2026-12' }],
    }, { compraFutura: true, dataDaCompra: '2027-01-10', cor: 'amarelo' }), contexto);
    assert.match(conteudo, /Compra simulada para 10\/01\/2027 \(hoje é 10\/11\/2026\)\./);
    assert.match(conteudo, /a partir de janeiro de 2027\. Comprando agora, o mais apertado ficaria com -R\$ 700,00; comprando em janeiro de 2027, com R\$ 300,00\./);
    assert.match(conteudo, /Parcelamentos que terminam antes: Amazon Ferramentas em dezembro de 2026\./);
    assert.match(conteudo, /AMARELO \(atenção\)/);
  });

  it('não cabe nos próximos 12 meses', () => {
    const { conteudo } = mensagemDaOpcaoSimulada(opcao({
      esperaMeses: null, mesDaCompra: null, piorMes: null,
      piorMesAgora: { mes: '2026-12', sobraCentavos: -50000 }, terminam: [],
    }, { cor: 'vermelho' }), contexto);
    assert.match(conteudo, /não cabe acima da folga nos próximos 12 meses\. Comprando agora, o mais apertado seria dezembro de 2026, com -R\$ 500,00\./);
    semDefeitos(conteudo.replace('piorMes: null', ''));
  });
});
