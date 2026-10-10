/**
 * Testes da análise do mês com IA (Fase 03, parte 3.3).
 * Rodar com: npm test
 *
 * Usa os dados de exemplo (fictícios) num dia fixo: 10 de novembro de 2026.
 * Nenhum teste usa a internet: aqui só se monta a mensagem e se lê a resposta.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCOES_ANALISE,
  MESES_ESTIMADOS,
  mensagemDoMes,
  trechosDaLinha,
  blocosDaResposta,
  textoParaCopiar,
} from '../src/analise.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { definirStatusDaFatura } from '../src/fluxo.js';

const HOJE = '2026-11-10';
const exemplo = () => criarDadosDeExemplo(HOJE);

describe('INSTRUCOES_ANALISE', () => {
  it('traz as regras e o formato com os três títulos', () => {
    assert.match(INSTRUCOES_ANALISE, /Use apenas os números fornecidos/);
    assert.match(INSTRUCOES_ANALISE, /nunca ordens/);
    assert.match(INSTRUCOES_ANALISE, /Não recomende investimentos/);
    assert.match(INSTRUCOES_ANALISE, /no máximo 180 palavras/);
    assert.match(INSTRUCOES_ANALISE, /## Resumo\n.*\n## Pontos de atenção\n.*\n## Sugestões/s);
  });
});

describe('mensagemDoMes', () => {
  const { conteudo } = mensagemDoMes(exemplo(), HOJE);

  it('dinheiro do mês: o mesmo resumo da aba Mês', () => {
    assert.match(conteudo, /Mês: novembro de 2026\. Hoje é dia 10 de 30 \(33% do mês\)\./);
    assert.match(conteudo, /Dinheiro do mês \(saldo inicial \+ renda prevista\): R\$ 1\.500,00\./);
    assert.match(conteudo, /Já pago: R\$ 200,00 \(contas fixas R\$ 0,00, gastos à vista R\$ 200,00, faturas R\$ 0,00\)\./);
    assert.match(conteudo, /Ainda previsto para sair: R\$ 539,80\./);
    assert.match(conteudo, /Deve sobrar no fim do mês: R\$ 760,20\. Folga mínima que o app usa: R\$ 200,00\./);
  });

  it('categorias com orçamento, uso e a cor do app; sem orçamento também aparece', () => {
    assert.match(conteudo, /- Lanches: R\$ 100,00 de R\$ 200,00 \(50% usado\); sobram R\$ 100,00; cor amarelo \(acelerado\)\./);
    assert.match(conteudo, /- Transporte: R\$ 60,00 de R\$ 300,00 \(20% usado\); sobram R\$ 240,00; cor verde \(no ritmo\)\./);
    assert.match(conteudo, /- Diversos: R\$ 40,00 gastos, sem orçamento\./);
  });

  it('contas fixas previstas com dia e atrasadas marcadas', () => {
    assert.match(conteudo, /Contas fixas: 0 paga\(s\), 3 prevista\(s\) \(2 atrasada\(s\)\), 0 dispensada\(s\)\./);
    assert.match(conteudo, /- Academia: R\$ 99,90, dia 5, ATRASADA\./);
    assert.match(conteudo, /- Streaming: R\$ 39,90, dia 12\./);
  });

  it('faturas com contas fixas no cartão, total no banco e limite', () => {
    assert.match(conteudo, /- Crédito: vence 10\/11, prevista; compras R\$ 150,00, mais R\$ 39,90 de contas fixas \(total no banco R\$ 189,90\); limite disponível R\$ 1\.770,20 de R\$ 2\.000,00\./);
  });

  it('fatura paga aparece como paga', () => {
    const pago = definirStatusDaFatura(exemplo(), '2026-11', 'Crédito', 'pago');
    assert.match(mensagemDoMes(pago, HOJE).conteudo, /- Crédito: vence 10\/11, paga;/);
  });

  it('gastos: total e os maiores, com a forma de pagamento', () => {
    assert.match(conteudo, /Gastos lançados no mês: 4, somando R\$ 350,00\./);
    assert.match(conteudo, /- Mercado: R\$ 150,00 em 01\/11 \(Crédito\)\./);
  });

  it(`próximos ${MESES_ESTIMADOS} meses como estimativa`, () => {
    assert.match(conteudo, /Próximos meses \(estimativa do app/);
    assert.match(conteudo, /- dezembro de 2026: deve sobrar R\$/);
    assert.match(conteudo, /- janeiro de 2027: deve sobrar R\$/);
  });

  it('texto limpo: sem undefined, NaN nem o espaço especial do Intl', () => {
    assert.ok(!/undefined|NaN/.test(conteudo));
    assert.ok(!conteudo.includes(' '));
    assert.match(conteudo, /Analise este mês para a pessoa\.$/);
  });
});

describe('trechosDaLinha', () => {
  it('separa o negrito e tira o itálico', () => {
    assert.deepEqual(trechosDaLinha('O **Crédito** está *acelerado*.'), [
      { texto: 'O ', negrito: false },
      { texto: 'Crédito', negrito: true },
      { texto: ' está acelerado.', negrito: false },
    ]);
  });

  it('asterisco sem par continua como texto', () => {
    assert.deepEqual(trechosDaLinha('3 * 2 = 6'), [{ texto: '3 * 2 = 6', negrito: false }]);
  });
});

describe('blocosDaResposta e textoParaCopiar', () => {
  const resposta = [
    '## Resumo',
    'O mês está **tranquilo**.',
    'Sobram R$ 760,20.',
    '',
    '## Pontos de atenção',
    '- Academia atrasada',
    '* Lanches acelerado',
    '## Sugestões',
    '• Uma opção é pagar a Academia hoje.',
  ].join('\n');

  it('títulos, parágrafo (linhas seguidas juntas) e listas', () => {
    const blocos = blocosDaResposta(resposta);
    assert.deepEqual(blocos.map((b) => b.tipo), ['titulo', 'paragrafo', 'titulo', 'lista', 'titulo', 'lista']);
    assert.deepEqual(blocos[1].trechos, [
      { texto: 'O mês está ', negrito: false },
      { texto: 'tranquilo', negrito: true },
      { texto: '. Sobram R$ 760,20.', negrito: false },
    ]);
    assert.equal(blocos[3].itens.length, 2);
  });

  it('título com negrito perde os asteriscos', () => {
    assert.deepEqual(blocosDaResposta('# **Resumo**')[0], { tipo: 'titulo', trechos: [{ texto: 'Resumo', negrito: false }] });
  });

  it('resposta sem formatação vira só parágrafos', () => {
    assert.deepEqual(blocosDaResposta('Linha um.\n\nLinha dois.').map((b) => b.tipo), ['paragrafo', 'paragrafo']);
  });

  it('texto para copiar: sem asteriscos, itens com "•"', () => {
    assert.equal(textoParaCopiar(blocosDaResposta(resposta)), [
      'Resumo',
      'O mês está tranquilo. Sobram R$ 760,20.',
      'Pontos de atenção',
      '• Academia atrasada\n• Lanches acelerado',
      'Sugestões',
      '• Uma opção é pagar a Academia hoje.',
    ].join('\n\n'));
  });
});
