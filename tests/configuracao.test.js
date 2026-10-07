/**
 * Testes das mudanças feitas pela tela "Configurar".
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS (o exemplo do app).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  textoDoValor,
  lerValorComSinal,
  lerValorPositivo,
  salvarDinheiroDoMes,
  categoriasAtivas,
  adicionarCategoria,
  editarCategoria,
  removerCategoria,
  adicionarFormaPagamento,
  removerFormaPagamento,
  TAMANHO_MAXIMO_FORMA,
} from '../src/configuracao.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { virarMes } from '../src/meses.js';

const AGORA = new Date('2026-11-05T12:00:00.000Z');
const exemplo = () => criarDadosDeExemplo('2026-11-03');

describe('textoDoValor', () => {
  it('formata para o campo, sem o R$, e volta ao mesmo valor', () => {
    assert.equal(textoDoValor(150000), '1.500,00');
    assert.equal(textoDoValor(0), '0,00');
    assert.equal(textoDoValor(-15050), '-150,50');
    for (const centavos of [150000, 99, -15050, 123456789]) {
      assert.equal(lerValorComSinal(textoDoValor(centavos), 'saldo'), centavos);
    }
  });
});

describe('lerValorComSinal', () => {
  it('lê valores positivos e negativos', () => {
    assert.equal(lerValorComSinal('1.500,00', 'saldo'), 150000);
    assert.equal(lerValorComSinal('-150,50', 'saldo'), -15050);
    assert.equal(lerValorComSinal(' -0,99 ', 'saldo'), -99);
  });

  it('rejeita texto inválido, apontando o campo informado', () => {
    assert.throws(() => lerValorComSinal('abc', 'saldo'), { name: 'ErroValidacao', campo: 'saldo' });
    assert.throws(() => lerValorComSinal('', 'saldo'), { name: 'ErroValidacao', campo: 'saldo' });
    assert.throws(() => lerValorComSinal('--5', 'saldo'), { name: 'ErroValidacao', campo: 'saldo' });
  });
});

describe('lerValorPositivo', () => {
  it('campo vazio vale zero', () => {
    assert.equal(lerValorPositivo('', 'renda'), 0);
    assert.equal(lerValorPositivo('   ', 'renda'), 0);
  });

  it('lê o valor e rejeita negativo', () => {
    assert.equal(lerValorPositivo('2.000', 'renda'), 200000);
    assert.throws(() => lerValorPositivo('-10', 'renda'), { name: 'ErroValidacao', campo: 'renda' });
  });
});

describe('salvarDinheiroDoMes', () => {
  it('salva saldo e renda e confirma o saldo sugerido', () => {
    // Novembro criado pela virada: saldo sugerido, ainda não confirmado.
    const comOutubro = { ...exemplo(), meses: [{ ...exemplo().meses[0], mes: '2026-10' }] };
    const { estado } = virarMes(comOutubro, '2026-11');
    assert.equal(estado.meses[1].saldoConfirmado, false);

    const salvo = salvarDinheiroDoMes(
      estado, '2026-11', { saldoInicialCentavos: 32000, rendaPrevistaCentavos: 200000 }, { agora: AGORA },
    );
    const novembro = salvo.meses.find((m) => m.mes === '2026-11');

    assert.equal(novembro.saldoInicialCentavos, 32000);
    assert.equal(novembro.rendaPrevistaCentavos, 200000);
    assert.equal(novembro.saldoConfirmado, true);
    assert.equal(novembro.atualizadoEm, '2026-11-05T12:00:00.000Z');
    assert.equal(salvo.meses.find((m) => m.mes === '2026-10'), estado.meses[0]); // outubro intacto
  });

  it('aceita saldo negativo, mas não renda negativa', () => {
    const salvo = salvarDinheiroDoMes(exemplo(), '2026-11', { saldoInicialCentavos: -5000, rendaPrevistaCentavos: 0 });
    assert.equal(salvo.meses[0].saldoInicialCentavos, -5000);

    assert.throws(
      () => salvarDinheiroDoMes(exemplo(), '2026-11', { saldoInicialCentavos: 0, rendaPrevistaCentavos: -1 }),
      { name: 'ErroValidacao', campo: 'rendaPrevistaCentavos' },
    );
  });

  it('rejeita mês que não existe', () => {
    assert.throws(
      () => salvarDinheiroDoMes(exemplo(), '2027-01', { saldoInicialCentavos: 0, rendaPrevistaCentavos: 0 }),
      { name: 'ErroValidacao', campo: 'mes' },
    );
  });
});

describe('categorias', () => {
  it('adiciona uma categoria nova', () => {
    const estado = adicionarCategoria(exemplo(), { nome: 'Farmácia', orcamentoCentavos: 10000 });
    const farmacia = categoriasAtivas(estado).find((c) => c.nome === 'Farmácia');
    assert.equal(farmacia.orcamentoCentavos, 10000);
    assert.equal(categoriasAtivas(estado).length, 5);
  });

  it('não aceita nome repetido, nem com maiúsculas ou espaços diferentes', () => {
    assert.throws(
      () => adicionarCategoria(exemplo(), { nome: '  lanches ', orcamentoCentavos: 0 }),
      { name: 'ErroValidacao', campo: 'nome' },
    );
  });

  it('edita nome e orçamento mantendo o mesmo id', () => {
    const original = exemplo();
    const lanches = original.categorias.find((c) => c.nome === 'Lanches');
    const estado = editarCategoria(original, lanches.id, { nome: 'iFood', orcamentoCentavos: 25000 }, { agora: AGORA });
    const editada = estado.categorias.find((c) => c.id === lanches.id);

    assert.equal(editada.nome, 'iFood');
    assert.equal(editada.orcamentoCentavos, 25000);
    assert.equal(editada.atualizadoEm, '2026-11-05T12:00:00.000Z');
    assert.equal(lanches.nome, 'Lanches'); // o original não muda
  });

  it('editar mantendo o próprio nome é permitido', () => {
    const original = exemplo();
    const lanches = original.categorias.find((c) => c.nome === 'Lanches');
    const estado = editarCategoria(original, lanches.id, { nome: 'Lanches', orcamentoCentavos: 1000 });
    assert.equal(estado.categorias.find((c) => c.id === lanches.id).orcamentoCentavos, 1000);
  });

  it('editar para o nome de outra categoria não é permitido', () => {
    const original = exemplo();
    const lanches = original.categorias.find((c) => c.nome === 'Lanches');
    assert.throws(
      () => editarCategoria(original, lanches.id, { nome: 'Mercado', orcamentoCentavos: 0 }),
      { name: 'ErroValidacao', campo: 'nome' },
    );
  });

  it('remover é exclusão suave: some da lista ativa, mas continua guardada', () => {
    const original = exemplo();
    const lanches = original.categorias.find((c) => c.nome === 'Lanches');
    const estado = removerCategoria(original, lanches.id, { agora: AGORA });

    assert.equal(categoriasAtivas(estado).some((c) => c.id === lanches.id), false);
    assert.equal(estado.categorias.find((c) => c.id === lanches.id).excluidoEm, '2026-11-05T12:00:00.000Z');
  });

  it('depois de remover, o nome fica livre para uma categoria nova', () => {
    const original = exemplo();
    const lanches = original.categorias.find((c) => c.nome === 'Lanches');
    const estado = adicionarCategoria(removerCategoria(original, lanches.id), { nome: 'Lanches', orcamentoCentavos: 0 });
    assert.equal(categoriasAtivas(estado).filter((c) => c.nome === 'Lanches').length, 1);
  });

  it('não deixa remover a última categoria', () => {
    let estado = exemplo();
    const ativas = categoriasAtivas(estado);
    for (const c of ativas.slice(1)) estado = removerCategoria(estado, c.id);

    assert.throws(() => removerCategoria(estado, ativas[0].id), { name: 'ErroValidacao', campo: 'categoria' });
  });

  it('não edita nem remove categoria inexistente ou já removida', () => {
    const original = exemplo();
    const lanches = original.categorias.find((c) => c.nome === 'Lanches');
    const semLanches = removerCategoria(original, lanches.id);

    assert.throws(() => editarCategoria(semLanches, lanches.id, { nome: 'X', orcamentoCentavos: 0 }), { campo: 'categoria' });
    assert.throws(() => removerCategoria(semLanches, lanches.id), { campo: 'categoria' });
  });
});

describe('formas de pagamento', () => {
  it('adiciona sem espaços nas pontas', () => {
    const estado = adicionarFormaPagamento(exemplo(), '  Nubank  ');
    assert.deepEqual(estado.formasPagamento, ['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Nubank']);
  });

  it('rejeita vazio, repetido ou longo demais', () => {
    assert.throws(() => adicionarFormaPagamento(exemplo(), '   '), { campo: 'formaPagamento' });
    assert.throws(() => adicionarFormaPagamento(exemplo(), 'pix'), { campo: 'formaPagamento' });
    assert.throws(
      () => adicionarFormaPagamento(exemplo(), 'x'.repeat(TAMANHO_MAXIMO_FORMA + 1)),
      { campo: 'formaPagamento' },
    );
  });

  it('remove uma forma da lista', () => {
    const estado = removerFormaPagamento(exemplo(), 'Débito');
    assert.deepEqual(estado.formasPagamento, ['Pix', 'Crédito', 'Dinheiro']);
  });

  it('não deixa remover a última, nem uma que não existe', () => {
    let estado = exemplo();
    for (const f of ['Crédito', 'Débito', 'Dinheiro']) estado = removerFormaPagamento(estado, f);

    assert.throws(() => removerFormaPagamento(estado, 'Pix'), { campo: 'formaPagamento' });
    assert.throws(() => removerFormaPagamento(exemplo(), 'Boleto'), { campo: 'formaPagamento' });
  });
});
