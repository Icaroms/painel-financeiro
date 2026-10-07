/**
 * Testes do modelo de dados.
 * Rodar com: npm test
 *
 * Os dados aqui são FICTÍCIOS. Dados financeiros reais nunca entram
 * no repositório.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  criarCategoria,
  criarFixo,
  fixoAtivoNoMes,
  ajustarValorFixo,
  criarLancamento,
  criarMes,
  ajustarFixoNoMes,
  valorDoFixoNoMes,
  excluirRegistro,
} from '../src/modelo.js';

// Momento fixo e id previsível: o teste dá sempre o mesmo resultado.
const AGORA = new Date('2026-11-03T13:00:00.000Z');
const DEPOIS = new Date('2026-11-10T13:00:00.000Z');
const OPCOES = { agora: AGORA, gerarId: () => 'id-teste' };

/** Dados válidos de um fixo; cada teste muda só o que interessa. */
const FIXO_VALIDO = {
  nome: 'Academia',
  valorCentavos: 9990,
  diaVencimento: 5,
  formaPagamento: 'Pix',
  mesInicial: '2026-09',
};

describe('campos de controle', () => {
  it('todo registro nasce com id, datas e excluidoEm nulo', () => {
    const categoria = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 50000 }, OPCOES);
    assert.equal(categoria.id, 'id-teste');
    assert.equal(categoria.criadoEm, '2026-11-03T13:00:00.000Z');
    assert.equal(categoria.atualizadoEm, '2026-11-03T13:00:00.000Z');
    assert.equal(categoria.excluidoEm, null);
  });

  it('sem opções, gera um UUID de verdade', () => {
    const a = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 0 });
    const b = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 0 });
    assert.match(a.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(a.id, b.id);
  });
});

describe('criarCategoria', () => {
  it('cria com nome sem espaços nas pontas', () => {
    const categoria = criarCategoria({ nome: '  Lanches  ', orcamentoCentavos: 20000 }, OPCOES);
    assert.equal(categoria.nome, 'Lanches');
    assert.equal(categoria.orcamentoCentavos, 20000);
  });

  it('aceita orçamento zero', () => {
    const categoria = criarCategoria({ nome: 'Diversos', orcamentoCentavos: 0 }, OPCOES);
    assert.equal(categoria.orcamentoCentavos, 0);
  });

  it('rejeita nome vazio', () => {
    assert.throws(
      () => criarCategoria({ nome: '   ', orcamentoCentavos: 100 }, OPCOES),
      { name: 'ErroValidacao', campo: 'nome' },
    );
  });

  it('rejeita orçamento negativo ou com casas decimais', () => {
    assert.throws(
      () => criarCategoria({ nome: 'Lanches', orcamentoCentavos: -1 }, OPCOES),
      { name: 'ErroValidacao', campo: 'orcamentoCentavos' },
    );
    assert.throws(
      () => criarCategoria({ nome: 'Lanches', orcamentoCentavos: 200.5 }, OPCOES),
      { name: 'ErroValidacao', campo: 'orcamentoCentavos' },
    );
  });
});

describe('criarFixo', () => {
  it('cria fixo sem fim (mesFinal nulo)', () => {
    const fixo = criarFixo(FIXO_VALIDO, OPCOES);
    assert.equal(fixo.nome, 'Academia');
    assert.equal(fixo.mesFinal, null);
  });

  it('cria parcelamento com mês final', () => {
    const fixo = criarFixo(
      { ...FIXO_VALIDO, nome: 'Fone (parcelado)', mesInicial: '2026-09', mesFinal: '2026-11' },
      OPCOES,
    );
    assert.equal(fixo.mesFinal, '2026-11');
  });

  it('aceita valor zero para fixo variável', () => {
    const fixo = criarFixo({ ...FIXO_VALIDO, valorCentavos: 0 }, OPCOES);
    assert.equal(fixo.valorCentavos, 0);
  });

  it('rejeita dia de vencimento fora de 1 a 31', () => {
    for (const dia of [0, 32, 5.5]) {
      assert.throws(
        () => criarFixo({ ...FIXO_VALIDO, diaVencimento: dia }, OPCOES),
        { name: 'ErroValidacao', campo: 'diaVencimento' },
      );
    }
  });

  it('rejeita mês inicial inválido', () => {
    assert.throws(
      () => criarFixo({ ...FIXO_VALIDO, mesInicial: '2026-13' }, OPCOES),
      { name: 'ErroValidacao', campo: 'mesInicial' },
    );
  });

  it('rejeita mês final antes do mês inicial', () => {
    assert.throws(
      () => criarFixo({ ...FIXO_VALIDO, mesInicial: '2026-10', mesFinal: '2026-09' }, OPCOES),
      { name: 'ErroValidacao', campo: 'mesFinal' },
    );
  });

  it('rejeita forma de pagamento vazia', () => {
    assert.throws(
      () => criarFixo({ ...FIXO_VALIDO, formaPagamento: '' }, OPCOES),
      { name: 'ErroValidacao', campo: 'formaPagamento' },
    );
  });
});

describe('fixoAtivoNoMes', () => {
  const parcelado = criarFixo(
    { ...FIXO_VALIDO, nome: 'Fone (parcelado)', mesInicial: '2026-09', mesFinal: '2026-11' },
    OPCOES,
  );
  const semFim = criarFixo(FIXO_VALIDO, OPCOES);

  it('não vale antes do mês inicial', () => {
    assert.equal(fixoAtivoNoMes(parcelado, '2026-08'), false);
  });

  it('vale do mês inicial até o mês final, inclusive', () => {
    assert.equal(fixoAtivoNoMes(parcelado, '2026-09'), true);
    assert.equal(fixoAtivoNoMes(parcelado, '2026-10'), true);
    assert.equal(fixoAtivoNoMes(parcelado, '2026-11'), true); // última parcela
  });

  it('some sozinho depois da última parcela', () => {
    assert.equal(fixoAtivoNoMes(parcelado, '2026-12'), false);
  });

  it('fixo sem fim continua valendo anos depois', () => {
    assert.equal(fixoAtivoNoMes(semFim, '2030-01'), true);
  });

  it('fixo excluído não vale em mês nenhum', () => {
    const excluido = excluirRegistro(semFim, { agora: DEPOIS });
    assert.equal(fixoAtivoNoMes(excluido, '2026-11'), false);
  });

  it('rejeita mês inválido', () => {
    assert.throws(() => fixoAtivoNoMes(semFim, '11/2026'), { name: 'ErroValidacao', campo: 'mes' });
  });
});

describe('ajustarValorFixo', () => {
  it('muda o valor e renova atualizadoEm, sem alterar o original', () => {
    const original = criarFixo(FIXO_VALIDO, OPCOES);
    const ajustado = ajustarValorFixo(original, 10990, { agora: DEPOIS });

    assert.equal(ajustado.valorCentavos, 10990);
    assert.equal(ajustado.atualizadoEm, '2026-11-10T13:00:00.000Z');
    assert.equal(ajustado.criadoEm, original.criadoEm);
    assert.equal(original.valorCentavos, 9990); // o original continua igual
  });

  it('rejeita valor inválido', () => {
    const original = criarFixo(FIXO_VALIDO, OPCOES);
    assert.throws(
      () => ajustarValorFixo(original, -100),
      { name: 'ErroValidacao', campo: 'valorCentavos' },
    );
  });
});

describe('criarLancamento', () => {
  const DADOS = { valorCentavos: 4590, categoriaId: 'cat-lanches', formaPagamento: 'Pix' };

  it('usa a data de hoje quando ela não é informada', () => {
    // Data local, para o teste dar certo em qualquer fuso.
    const agoraLocal = new Date(2026, 10, 3, 21, 0); // 3 de novembro, 21:00 local
    const lancamento = criarLancamento(DADOS, { agora: agoraLocal, gerarId: () => 'id-teste' });
    assert.equal(lancamento.data, '2026-11-03');
  });

  it('aceita uma data informada e descrição opcional', () => {
    const lancamento = criarLancamento(
      { ...DADOS, data: '2026-11-01', descricao: '  Pizza  ' },
      OPCOES,
    );
    assert.equal(lancamento.data, '2026-11-01');
    assert.equal(lancamento.descricao, 'Pizza');
  });

  it('descrição vazia por padrão', () => {
    assert.equal(criarLancamento(DADOS, OPCOES).descricao, '');
  });

  it('rejeita valor zero ou negativo', () => {
    for (const valor of [0, -100]) {
      assert.throws(
        () => criarLancamento({ ...DADOS, valorCentavos: valor }, OPCOES),
        { name: 'ErroValidacao', campo: 'valorCentavos' },
      );
    }
  });

  it('rejeita data inexistente', () => {
    assert.throws(
      () => criarLancamento({ ...DADOS, data: '2026-02-30' }, OPCOES),
      { name: 'ErroValidacao', campo: 'data' },
    );
  });

  it('rejeita lançamento sem categoria', () => {
    assert.throws(
      () => criarLancamento({ ...DADOS, categoriaId: '' }, OPCOES),
      { name: 'ErroValidacao', campo: 'categoriaId' },
    );
  });
});

describe('criarMes', () => {
  it('cria o mês com saldo inicial e sem ajustes', () => {
    const novembro = criarMes({ mes: '2026-11', saldoInicialCentavos: 150000 }, OPCOES);
    assert.equal(novembro.mes, '2026-11');
    assert.equal(novembro.saldoInicialCentavos, 150000);
    assert.deepEqual(novembro.ajustesFixos, {});
  });

  it('aceita saldo inicial negativo', () => {
    const mes = criarMes({ mes: '2026-11', saldoInicialCentavos: -5000 }, OPCOES);
    assert.equal(mes.saldoInicialCentavos, -5000);
  });

  it('rejeita mês inválido', () => {
    assert.throws(
      () => criarMes({ mes: '2026-13', saldoInicialCentavos: 0 }, OPCOES),
      { name: 'ErroValidacao', campo: 'mes' },
    );
  });

  it('renda prevista é zero e o saldo é confirmado, por padrão', () => {
    const novembro = criarMes({ mes: '2026-11', saldoInicialCentavos: 150000 }, OPCOES);
    assert.equal(novembro.rendaPrevistaCentavos, 0);
    assert.equal(novembro.saldoConfirmado, true);
  });

  it('aceita renda prevista e saldo ainda não confirmado', () => {
    const novembro = criarMes(
      { mes: '2026-11', saldoInicialCentavos: 30000, rendaPrevistaCentavos: 200000, saldoConfirmado: false },
      OPCOES,
    );
    assert.equal(novembro.rendaPrevistaCentavos, 200000);
    assert.equal(novembro.saldoConfirmado, false);
  });

  it('rejeita renda prevista negativa', () => {
    assert.throws(
      () => criarMes({ mes: '2026-11', saldoInicialCentavos: 0, rendaPrevistaCentavos: -1 }, OPCOES),
      { name: 'ErroValidacao', campo: 'rendaPrevistaCentavos' },
    );
  });

  it('rejeita saldoConfirmado que não seja true ou false', () => {
    assert.throws(
      () => criarMes({ mes: '2026-11', saldoInicialCentavos: 0, saldoConfirmado: 'sim' }, OPCOES),
      { name: 'ErroValidacao', campo: 'saldoConfirmado' },
    );
  });

  it('rejeita saldo com casas decimais', () => {
    assert.throws(
      () => criarMes({ mes: '2026-11', saldoInicialCentavos: 1500.5 }, OPCOES),
      { name: 'ErroValidacao', campo: 'saldoInicialCentavos' },
    );
  });
});

describe('ajuste de fixo num mês só', () => {
  const fixo = criarFixo({ ...FIXO_VALIDO, nome: 'Consulta', valorCentavos: 0 }, { ...OPCOES, gerarId: () => 'fixo-consulta' });
  const novembro = criarMes({ mes: '2026-11', saldoInicialCentavos: 150000 }, OPCOES);

  it('sem ajuste, vale o valor padrão do fixo', () => {
    assert.equal(valorDoFixoNoMes(fixo, novembro), 0);
  });

  it('com ajuste, vale o valor do mês, sem mudar o fixo', () => {
    const ajustado = ajustarFixoNoMes(novembro, fixo, 25000, { agora: DEPOIS });
    assert.equal(valorDoFixoNoMes(fixo, ajustado), 25000);
    assert.equal(fixo.valorCentavos, 0);           // o fixo continua igual
    assert.deepEqual(novembro.ajustesFixos, {});    // o mês original também
    assert.equal(ajustado.atualizadoEm, '2026-11-10T13:00:00.000Z');
  });

  it('rejeita ajuste de fixo que não está ativo no mês', () => {
    const encerrado = criarFixo(
      { ...FIXO_VALIDO, nome: 'Fone (parcelado)', mesInicial: '2026-08', mesFinal: '2026-10' },
      OPCOES,
    );
    assert.throws(
      () => ajustarFixoNoMes(novembro, encerrado, 1000),
      { name: 'ErroValidacao', campo: 'fixo' },
    );
  });
});

describe('excluirRegistro', () => {
  it('marca a exclusão sem apagar os dados', () => {
    const lancamento = criarLancamento(
      { valorCentavos: 4590, categoriaId: 'cat-lanches', formaPagamento: 'Pix', data: '2026-11-03' },
      OPCOES,
    );
    const excluido = excluirRegistro(lancamento, { agora: DEPOIS });

    assert.equal(excluido.excluidoEm, '2026-11-10T13:00:00.000Z');
    assert.equal(excluido.atualizadoEm, '2026-11-10T13:00:00.000Z');
    assert.equal(excluido.valorCentavos, 4590);  // os dados continuam lá
    assert.equal(lancamento.excluidoEm, null);   // o original não muda
  });

  it('excluir de novo não muda nada', () => {
    const categoria = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 0 }, OPCOES);
    const primeira = excluirRegistro(categoria, { agora: DEPOIS });
    const segunda = excluirRegistro(primeira, { agora: new Date('2027-01-01T00:00:00.000Z') });
    assert.equal(segunda.excluidoEm, primeira.excluidoEm);
  });
});
