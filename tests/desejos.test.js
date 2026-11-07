/**
 * Testes da lista de desejos (11/2026). Rodar com: npm test
 * Dados FICTÍCIOS: o mesmo cenário do simulador (hoje 10/10/2026, cartão
 * fecha dia 3 e vence dia 10, outubro fecha com R$ 1.000 de sobra).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  adicionarDesejo, editarDesejo, removerDesejo, registrarPreco, removerPreco, resumoDosPrecos, avaliarDesejo,
  MAXIMO_DESEJOS, MAXIMO_PRECOS,
} from '../src/desejos.js';
import { mensagemDoDesejo, INSTRUCOES_DESEJO } from '../src/explicacoes.js';
import { criarCartao } from '../src/cartoes.js';
import { criarCategoria, criarFixo, criarMes } from '../src/modelo.js';
import { dadosDoMes } from '../src/meses.js';
import { ErroValidacao } from '../src/erros.js';

const HOJE = '2026-10-10';
const MES = '2026-10';
let n = 0;
const gerarId = () => `d-${(n += 1)}`;

function estado() {
  return {
    meses: [criarMes({ mes: MES, saldoInicialCentavos: -50000, rendaPrevistaCentavos: 280000 })],
    categorias: [criarCategoria({ nome: 'Dia a dia', orcamentoCentavos: 150000 })],
    fixos: [criarFixo({ nome: 'Aluguel', valorCentavos: 80000, diaVencimento: 5, formaPagamento: 'Pix', mesInicial: '2026-01' })],
    lancamentos: [],
    formasPagamento: ['Pix', 'Cartão Nubank'],
    cartoes: [criarCartao({ formaPagamento: 'Cartão Nubank', limiteCentavos: 1000000, diaFechamento: 3, diaVencimento: 10 })],
  };
}

const comTablet = (e = estado()) => adicionarDesejo(e, {
  nome: 'Tablet', formaPagamento: 'Cartão Nubank', parcelas: 5,
  preco: { valorCentavos: 260000, data: '2026-10-01', loja: 'Loja A' },
}, { gerarId });

describe('lista de desejos: cadastro e preços', () => {
  it('guarda o produto com o primeiro preço, a forma e as parcelas', () => {
    const [d] = comTablet().desejos;
    assert.equal(d.nome, 'Tablet');
    assert.equal(d.parcelas, 5);
    assert.equal(d.precos.length, 1);
    assert.equal(d.precos[0].loja, 'Loja A');
  });

  it('fora do cartão, as parcelas viram 1; nome repetido, forma inválida e preço zero dão erro', () => {
    const e = adicionarDesejo(estado(), {
      nome: 'Curso', formaPagamento: 'Pix', parcelas: 5, preco: { valorCentavos: 30000, data: HOJE },
    }, { gerarId });
    assert.equal(e.desejos[0].parcelas, 1);
    assert.throws(() => comTablet(comTablet()), /já está na lista/);
    assert.throws(() => adicionarDesejo(estado(), { nome: 'X', formaPagamento: 'Boleto', preco: { valorCentavos: 1, data: HOJE } }), /como pretende pagar/);
    assert.throws(() => adicionarDesejo(estado(), { nome: 'X', formaPagamento: 'Pix', preco: { valorCentavos: 0, data: HOJE } }), /maior que zero/);
  });

  it(`até ${MAXIMO_DESEJOS} produtos e ${MAXIMO_PRECOS} preços (os mais antigos saem)`, () => {
    let e = estado();
    for (let i = 0; i < MAXIMO_DESEJOS; i += 1) {
      e = adicionarDesejo(e, { nome: `P${i}`, formaPagamento: 'Pix', preco: { valorCentavos: 100, data: HOJE } }, { gerarId });
    }
    assert.throws(() => adicionarDesejo(e, { nome: 'Mais', formaPagamento: 'Pix', preco: { valorCentavos: 100, data: HOJE } }), ErroValidacao);

    let t = comTablet();
    const id = t.desejos[0].id;
    for (let i = 0; i < MAXIMO_PRECOS + 2; i += 1) {
      const dia = String((i % 28) + 1).padStart(2, '0');
      t = registrarPreco(t, id, { valorCentavos: 250000 + i, data: `2026-${i < 28 ? '09' : '10'}-${dia}` }, { gerarId });
    }
    assert.equal(t.desejos[0].precos.length, MAXIMO_PRECOS);
  });

  it('resumo: menor, primeiro, último e variação', () => {
    let e = comTablet();
    const id = e.desejos[0].id;
    e = registrarPreco(e, id, { valorCentavos: 249900, data: '2026-10-05', loja: 'Loja B' }, { gerarId });
    e = registrarPreco(e, id, { valorCentavos: 255000, data: '2026-10-09' }, { gerarId });
    const r = resumoDosPrecos(e.desejos[0]);
    assert.equal(r.menor.valorCentavos, 249900);
    assert.equal(r.menor.loja, 'Loja B');
    assert.equal(r.primeiro.valorCentavos, 260000);
    assert.equal(r.ultimo.valorCentavos, 255000);
    assert.equal(r.variacaoCentavos, -5000);
    assert.equal(r.quantos, 3);
  });

  it('editar, apagar preço (fica ao menos um) e remover o produto', () => {
    let e = comTablet();
    const d = e.desejos[0];
    e = editarDesejo(e, d.id, { nome: 'Tablet S10', formaPagamento: 'Pix', parcelas: 3 });
    assert.equal(e.desejos[0].nome, 'Tablet S10');
    assert.equal(e.desejos[0].parcelas, 1);
    assert.throws(() => removerPreco(e, d.id, d.precos[0].id), /pelo menos um preço/);
    e = registrarPreco(e, d.id, { valorCentavos: 1000, data: HOJE }, { gerarId });
    e = removerPreco(e, d.id, d.precos[0].id);
    assert.equal(e.desejos[0].precos.length, 1);
    assert.equal(removerDesejo(e, d.id).desejos.length, 0);
  });
});

describe('lista de desejos: avaliação no menor preço', () => {
  it('simula no menor preço, na forma e nas parcelas guardadas', () => {
    let e = comTablet();
    e = registrarPreco(e, e.desejos[0].id, { valorCentavos: 200000, data: '2026-10-08' }, { gerarId });
    const a = avaliarDesejo(dadosDoMes(e, MES), e.desejos[0], HOJE);
    assert.equal(a.ehCartao, true);
    assert.equal(a.opcao.parcelas, 5);
    assert.equal(a.opcao.totalCentavos, 200000);
    assert.ok(['verde', 'amarelo', 'vermelho'].includes(a.opcao.cor));
  });

  it('cartão removido de Configurar: devolve o erro em vez de quebrar', () => {
    const e = comTablet();
    const semCartao = { ...e, cartoes: [], formasPagamento: ['Pix'] };
    const a = avaliarDesejo(dadosDoMes(semCartao, MES), e.desejos[0], HOJE);
    assert.match(a.erro, /como vai pagar/);
  });

  it('mensagem para a IA: histórico, menor preço, simulação e pedido', () => {
    let e = comTablet();
    e = registrarPreco(e, e.desejos[0].id, { valorCentavos: 249900, data: '2026-10-05', loja: 'Loja B' }, { gerarId });
    const d = e.desejos[0];
    const { instrucoes, conteudo } = mensagemDoDesejo(d, avaliarDesejo(dadosDoMes(e, MES), d, HOJE), {
      hoje: HOJE, avisos: ['Sem salário cadastrado.'],
    });
    assert.equal(instrucoes, INSTRUCOES_DESEJO);
    assert.match(INSTRUCOES_DESEJO, /Não preveja preços futuros/);
    assert.match(conteudo, /Produto: "Tablet"/);
    assert.match(conteudo, /- 01\/10\/2026: R\$ 2\.600,00 \(Loja A\)/);
    assert.match(conteudo, /Menor preço: R\$ 2\.499,00 em 05\/10\/2026/);
    assert.match(conteudo, /Variação do primeiro para o último registro: -R\$ 101,00/);
    assert.match(conteudo, /em 5x de R\$ 499,80 no Cartão Nubank/);
    assert.match(conteudo, /Aviso do app sobre a previsão: Sem salário cadastrado\./);
    assert.ok(!/undefined|NaN/.test(conteudo));
  });
});
