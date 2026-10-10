/**
 * Testes da conversão das contas fixas parceladas em compras no cartão
 * (Fase 02, parte 2.3).
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS, parecidos com os reais. Hoje é 10/10/2026.
 * Os dois cartões fecham dia 3 e vencem dia 10 (datas de exemplo).
 *
 *   Remador             R$ 117,53  parcela 3 de 12  Cartão Careca  (ago/2026 a jul/2027)
 *   Amazon Ferramentas  R$ 150,51  parcela 2 de 3   Cartão Nubank  (set/2026 a nov/2026)
 *   Amazon Papelaria    R$  87,67  parcela 3 de 3   Cartão Nubank  (ago/2026 a out/2026)
 *   Anel Namoro         R$  92,50  parcela 4 de 4   Cartão Careca  (jul/2026 a out/2026)
 *   Claude              R$ 110,00  mensal           Cartão Careca  (continua conta fixa)
 *   Curso               R$ 200,00  parcela 1 de 5   Pix            (não é cartão)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  contasParaConverter,
  converterFixo,
  comprasConvertidas,
  desfazerConversao,
  faturasPagasComAParcela,
  avisoAoDesfazer,
  CATEGORIA_DA_CONVERSAO,
} from '../src/conversao.js';
import { criarCartao, removerCartao } from '../src/cartoes.js';
import { criarCategoria, criarFixo, criarMes, contaComoConsumo } from '../src/modelo.js';
import { definirStatusDoFixo } from '../src/fixos.js';
import { saidasDoLancamento, faturasDoMes, projetarMeses, definirStatusDaFatura } from '../src/fluxo.js';
import { sobraDoMes, dadosDoMes, buscarMes } from '../src/meses.js';
import { resumoDoMes } from '../src/resumo-mes.js';
import { filtrarGastos, semanasDeGastos } from '../src/historico.js';
import { removerFormaPagamento } from '../src/configuracao.js';
import { empacotar, desempacotar } from '../src/persistencia.js';

const MES = '2026-10';
const HOJE = '2026-10-10';
const AGORA = new Date('2026-10-10T12:00:00Z');

const careca = criarCartao({ formaPagamento: 'Cartão Careca', limiteCentavos: 200000, diaFechamento: 3, diaVencimento: 10 });
const nubank = criarCartao({ formaPagamento: 'Cartão Nubank', limiteCentavos: 300000, diaFechamento: 3, diaVencimento: 10 });

const fixo = (nome, valorCentavos, formaPagamento, mesInicial, mesFinal, extra = {}) => criarFixo({
  nome, valorCentavos, diaVencimento: 10, formaPagamento, mesInicial, mesFinal, ...extra,
});

function estadoDeTeste() {
  return {
    meses: [criarMes({ mes: MES, saldoInicialCentavos: 100000, rendaPrevistaCentavos: 300000 })],
    categorias: [criarCategoria({ nome: 'Lanches', orcamentoCentavos: 30000 })],
    fixos: [
      fixo('Remador', 11753, 'Cartão Careca', '2026-08', '2027-07'),
      fixo('Amazon Ferramentas', 15051, 'Cartão Nubank', '2026-09', '2026-11'),
      fixo('Amazon Papelaria', 8767, 'Cartão Nubank', '2026-08', '2026-10'),
      fixo('Anel Namoro', 9250, 'Cartão Careca', '2026-07', '2026-10'),
      fixo('Claude', 11000, 'Cartão Careca', '2026-01', null),
      fixo('Curso', 20000, 'Pix', '2026-10', '2027-02'),
    ],
    lancamentos: [],
    formasPagamento: ['Pix', 'Cartão Careca', 'Cartão Nubank'],
    cartoes: [careca, nubank],
  };
}

const idDe = (estado, nome) => estado.fixos.find((f) => f.nome === nome).id;
const planoDe = (estado, nome, hoje = HOJE) =>
  contasParaConverter(estado, MES, hoje).find((p) => p.fixo.nome === nome);
const converter = (estado, nome) => converterFixo(estado, idDe(estado, nome), MES, { hoje: HOJE, agora: AGORA });

describe('contasParaConverter: quais contas aparecem', () => {
  it('só as parceladas em cartão cadastrado, em ordem alfabética', () => {
    const nomes = contasParaConverter(estadoDeTeste(), MES, HOJE).map((p) => p.fixo.nome);
    // O Claude é mensal (continua conta fixa) e o Curso é no Pix.
    assert.deepEqual(nomes, ['Amazon Ferramentas', 'Amazon Papelaria', 'Anel Namoro', 'Remador']);
  });

  it('Remador: parcelas 3 a 12 vão para as faturas e a conta termina em setembro', () => {
    const plano = planoDe(estadoDeTeste(), 'Remador');
    assert.equal(plano.total, 12);
    assert.equal(plano.parcelasPagas, 2);
    assert.equal(plano.restantes, 10);
    assert.equal(plano.primeiraParcela, 3);
    assert.equal(plano.valorRestanteCentavos, 117530); // 10 x 117,53
    assert.equal(plano.mesPrimeira, '2026-10');
    assert.equal(plano.mesUltima, '2027-07');
    assert.equal(plano.fixoTerminaEm, '2026-09');
    assert.equal(plano.motivo, null);
  });

  it('parcela de outubro já marcada como Paga: a conversão começa em novembro', () => {
    let estado = estadoDeTeste();
    estado = definirStatusDoFixo(estado, MES, idDe(estado, 'Remador'), 'pago', { agora: AGORA });
    const plano = planoDe(estado, 'Remador');
    assert.equal(plano.mesPrimeira, '2026-11');
    assert.equal(plano.primeiraParcela, 4);
    assert.equal(plano.restantes, 9);
    assert.equal(plano.fixoTerminaEm, '2026-10'); // outubro continua como conta paga
  });

  it('pagamento automático que já venceu conta como pago', () => {
    const estado = estadoDeTeste();
    estado.fixos = estado.fixos.map((f) => (f.nome === 'Remador'
      ? { ...f, pagamentoAutomatico: true, diaVencimento: 5 } : f));
    assert.equal(planoDe(estado, 'Remador', HOJE).mesPrimeira, '2026-11');
    // No dia 4 ainda não venceu: outubro entra na conversão.
    assert.equal(planoDe(estado, 'Remador', '2026-10-04').mesPrimeira, '2026-10');
  });

  it('última parcela (outubro) já paga: não sobra nada, a conta não aparece', () => {
    let estado = estadoDeTeste();
    estado = definirStatusDoFixo(estado, MES, idDe(estado, 'Amazon Papelaria'), 'pago', { agora: AGORA });
    assert.equal(planoDe(estado, 'Amazon Papelaria'), undefined);
  });

  it('última parcela (outubro) ainda prevista: converte só ela', () => {
    const plano = planoDe(estadoDeTeste(), 'Anel Namoro');
    assert.deepEqual([plano.primeiraParcela, plano.restantes, plano.mesPrimeira, plano.mesUltima],
      [4, 1, '2026-10', '2026-10']);
  });

  it('conta que começa neste mês: nenhuma parcela paga, a conta fixa será excluída', () => {
    const estado = estadoDeTeste();
    estado.fixos.push(fixo('Fone', 5000, 'Cartão Nubank', '2026-10', '2026-12'));
    const plano = planoDe(estado, 'Fone');
    assert.equal(plano.parcelasPagas, 0);
    assert.equal(plano.fixoTerminaEm, null);
  });

  it('conta que só começa no futuro: converte desde a 1ª parcela', () => {
    const estado = estadoDeTeste();
    estado.fixos.push(fixo('Viagem', 30000, 'Cartão Nubank', '2026-12', '2027-03'));
    const plano = planoDe(estado, 'Viagem');
    assert.deepEqual([plano.mesPrimeira, plano.restantes, plano.fixoTerminaEm], ['2026-12', 4, null]);
  });

  it('conta já encerrada ou de cartão que não está cadastrado: não aparece', () => {
    const estado = estadoDeTeste();
    estado.fixos.push(fixo('Antiga', 5000, 'Cartão Nubank', '2026-01', '2026-06'));
    estado.formasPagamento.push('Cartão Inter');
    estado.fixos.push(fixo('Inter', 5000, 'Cartão Inter', '2026-09', '2026-12'));
    const nomes = contasParaConverter(estado, MES, HOJE).map((p) => p.fixo.nome);
    assert.ok(!nomes.includes('Antiga'));
    assert.ok(!nomes.includes('Inter'));
  });

  it('mais de 24 parcelas ou valor zero: aparece, mas com o motivo de não converter', () => {
    const estado = estadoDeTeste();
    estado.fixos.push(fixo('Sofá', 10000, 'Cartão Nubank', '2026-01', '2028-12')); // 36 parcelas
    estado.fixos.push(fixo('Variável', 0, 'Cartão Nubank', '2026-09', '2026-12'));
    assert.match(planoDe(estado, 'Sofá').motivo, /até 24 parcelas/);
    assert.match(planoDe(estado, 'Variável').motivo, /valor zero/);
    assert.throws(() => converter(estado, 'Sofá'), /até 24 parcelas/);
  });
});

describe('converterFixo', () => {
  it('cria a compra inteira com as parcelas já pagas e encerra a conta fixa', () => {
    const { estado, lancamento } = converter(estadoDeTeste(), 'Remador');

    assert.equal(lancamento.valorCentavos, 141036); // 12 x 117,53
    assert.equal(lancamento.parcelas, 12);
    assert.equal(lancamento.formaPagamento, 'Cartão Careca');
    assert.equal(lancamento.descricao, 'Remador');
    assert.equal(lancamento.categoriaId, CATEGORIA_DA_CONVERSAO);
    assert.equal(lancamento.data, HOJE);
    assert.deepEqual(lancamento.conversao, {
      fixoId: idDe(estado, 'Remador'), primeiraFatura: '2026-08', parcelasPagas: 2, mesFinalAnterior: '2027-07',
    });

    const remador = estado.fixos.find((f) => f.nome === 'Remador');
    assert.equal(remador.mesFinal, '2026-09');
    assert.equal(remador.excluidoEm, null);
  });

  it('as faturas recebem só as parcelas que faltam, com o número original', () => {
    const { lancamento } = converter(estadoDeTeste(), 'Remador');
    const saidas = saidasDoLancamento(lancamento, [careca, nubank]);

    assert.equal(saidas.length, 10);
    assert.deepEqual(saidas.map((s) => s.numero), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.ok(saidas.every((s) => s.valorCentavos === 11753 && s.total === 12));
    assert.equal(saidas[0].mes, '2026-10');
    assert.equal(saidas[0].vencimento, '2026-10-10');
    assert.equal(saidas[9].mes, '2027-07');
  });

  it('a fatura de outubro do Careca passa a ter a parcela 3/12 do Remador', () => {
    const { estado } = converter(estadoDeTeste(), 'Remador');
    const [fatura] = faturasDoMes(estado.lancamentos, estado.cartoes, buscarMes(estado, MES));
    assert.equal(fatura.formaPagamento, 'Cartão Careca');
    assert.equal(fatura.totalCentavos, 11753);
    assert.equal(fatura.itens[0].numero, 3);
  });

  it('a sobra do mês e a projeção dos meses seguintes não mudam', () => {
    const antes = estadoDeTeste();
    let depois = antes;
    for (const nome of ['Remador', 'Amazon Ferramentas', 'Amazon Papelaria', 'Anel Namoro']) {
      depois = converter(depois, nome).estado;
    }
    assert.equal(sobraDoMes(depois, MES), sobraDoMes(antes, MES));
    assert.deepEqual(projetarMeses(dadosDoMes(depois, MES), 10), projetarMeses(dadosDoMes(antes, MES), 10));
  });

  it('conta que começou neste mês: a conta fixa é excluída', () => {
    const inicial = estadoDeTeste();
    inicial.fixos.push(fixo('Fone', 5000, 'Cartão Nubank', '2026-10', '2026-12'));
    const { estado, lancamento } = converter(inicial, 'Fone');
    assert.notEqual(estado.fixos.find((f) => f.nome === 'Fone').excluidoEm, null);
    assert.equal(saidasDoLancamento(lancamento, estado.cartoes).length, 3);
  });

  it('conta que não é parcelada num cartão: erro claro', () => {
    const estado = estadoDeTeste();
    assert.throws(() => converter(estado, 'Claude'), /conta parcelada num cartão/);
    assert.throws(() => converter(estado, 'Curso'), /conta parcelada num cartão/);
  });

  it('não muda o estado recebido', () => {
    const estado = estadoDeTeste();
    const copia = structuredClone(estado);
    converter(estado, 'Remador');
    assert.deepEqual(estado, copia);
  });
});

describe('compra convertida não é consumo', () => {
  it('fica fora das categorias, dos gastos do mês e do histórico', () => {
    const { estado, lancamento } = converter(estadoDeTeste(), 'Remador');
    assert.equal(contaComoConsumo(lancamento), false);

    const resumo = resumoDoMes(estado, MES, HOJE);
    assert.equal(resumo.gastos.length, 0);
    assert.ok(resumo.categorias.every((c) => c.gastoCentavos === 0));
    // Mas a parcela está na fatura prevista do mês.
    assert.equal(resumo.faturas[0].totalCentavos, 11753);

    assert.equal(filtrarGastos(estado).gastos.length, 0);
    assert.deepEqual(semanasDeGastos(estado, null, HOJE).semanas, []);
  });
});

describe('comprasConvertidas e desfazerConversao', () => {
  it('lista as convertidas com as parcelas que faltam', () => {
    const { estado } = converter(estadoDeTeste(), 'Remador');
    const [item] = comprasConvertidas(estado);
    assert.equal(item.lancamento.descricao, 'Remador');
    assert.equal(item.valorParcelaCentavos, 11753);
    assert.deepEqual([item.parcelasPagas, item.total, item.mesPrimeira, item.mesUltima], [2, 12, '2026-10', '2027-07']);
  });

  it('desfazer: a conta fixa volta como era e a compra é excluída', () => {
    const original = estadoDeTeste();
    const { estado, lancamento } = converter(original, 'Remador');
    const desfeito = desfazerConversao(estado, lancamento.id, { agora: AGORA });

    const remador = desfeito.fixos.find((f) => f.nome === 'Remador');
    assert.equal(remador.mesFinal, '2027-07');
    assert.equal(remador.excluidoEm, null);
    assert.notEqual(desfeito.lancamentos.find((l) => l.id === lancamento.id).excluidoEm, null);
    assert.equal(comprasConvertidas(desfeito).length, 0);
    assert.equal(sobraDoMes(desfeito, MES), sobraDoMes(original, MES));
  });

  it('desfazer uma conta que tinha sido excluída: ela volta a existir', () => {
    const inicial = estadoDeTeste();
    inicial.fixos.push(fixo('Fone', 5000, 'Cartão Nubank', '2026-10', '2026-12'));
    const { estado, lancamento } = converter(inicial, 'Fone');
    const desfeito = desfazerConversao(estado, lancamento.id, { agora: AGORA });
    assert.equal(desfeito.fixos.find((f) => f.nome === 'Fone').excluidoEm, null);
  });

  it('desfazer um lançamento que não veio de conversão: erro', () => {
    const { estado } = converter(estadoDeTeste(), 'Remador');
    assert.throws(() => desfazerConversao(estado, 'id-que-nao-existe'), /não veio de uma conversão/);
  });
});

describe('aviso ao desfazer quando a fatura já foi paga', () => {
  it('nenhuma fatura paga: sem aviso', () => {
    const { estado, lancamento } = converter(estadoDeTeste(), 'Remador');
    assert.deepEqual(faturasPagasComAParcela(estado, lancamento.id), []);
    assert.equal(avisoAoDesfazer(estado, lancamento.id), null);
  });

  it('fatura de outubro paga: avisa o mês e a parcela', () => {
    const convertido = converter(estadoDeTeste(), 'Remador');
    const estado = definirStatusDaFatura(convertido.estado, MES, 'Cartão Careca', 'pago', { agora: AGORA });
    const id = convertido.lancamento.id;

    assert.deepEqual(faturasPagasComAParcela(estado, id), [{ mes: '2026-10', numero: 3, total: 12 }]);
    assert.equal(
      avisoAoDesfazer(estado, id),
      'A fatura de outubro de 2026 do Cartão Careca já está Paga: ' +
        'a parcela 3/12 desse mês volta a ser conta fixa e já fica marcada como Paga.',
    );
  });

  it('a fatura paga de OUTRO cartão não conta', () => {
    const convertido = converter(estadoDeTeste(), 'Remador');
    const estado = definirStatusDaFatura(convertido.estado, MES, 'Cartão Nubank', 'pago', { agora: AGORA });
    assert.equal(avisoAoDesfazer(estado, convertido.lancamento.id), null);
  });

  it('duas faturas pagas: avisa os dois meses no plural', () => {
    const inicial = estadoDeTeste();
    inicial.meses.push(criarMes({ mes: '2026-11', saldoInicialCentavos: 0, rendaPrevistaCentavos: 300000 }));
    const convertido = converter(inicial, 'Remador');
    let estado = definirStatusDaFatura(convertido.estado, MES, 'Cartão Careca', 'pago', { agora: AGORA });
    estado = definirStatusDaFatura(estado, '2026-11', 'Cartão Careca', 'pago', { agora: AGORA });

    assert.equal(
      avisoAoDesfazer(estado, convertido.lancamento.id),
      'As faturas de outubro de 2026 e novembro de 2026 do Cartão Careca já estão Pagas: ' +
        'as parcelas 3/12 e 4/12 desses meses voltam a ser conta fixa e já ficam marcadas como Pagas.',
    );
  });

  it('lançamento que não é conversão: lista vazia', () => {
    assert.deepEqual(faturasPagasComAParcela(estadoDeTeste(), 'id-que-nao-existe'), []);
  });
});

describe('desfazer com fatura já paga: a parcela volta como Paga', () => {
  it('marca a conta fixa como Paga só nos meses com a fatura paga', () => {
    const inicial = estadoDeTeste();
    inicial.meses.push(criarMes({ mes: '2026-11', saldoInicialCentavos: 0, rendaPrevistaCentavos: 300000 }));
    const convertido = converter(inicial, 'Remador');
    const pago = definirStatusDaFatura(convertido.estado, MES, 'Cartão Careca', 'pago', { agora: AGORA });

    const desfeito = desfazerConversao(pago, convertido.lancamento.id, { agora: AGORA });
    const id = idDe(desfeito, 'Remador');
    assert.equal(buscarMes(desfeito, MES).statusFixos[id], 'pago'); // outubro: fatura paga
    assert.equal(buscarMes(desfeito, '2026-11').statusFixos[id], undefined); // novembro: fatura prevista
  });

  it('o "já pago" do mês continua o mesmo depois de desfazer', () => {
    const convertido = converter(estadoDeTeste(), 'Remador');
    const pago = definirStatusDaFatura(convertido.estado, MES, 'Cartão Careca', 'pago', { agora: AGORA });
    const antes = resumoDoMes(pago, MES, HOJE).jaPago.totalCentavos;

    const desfeito = desfazerConversao(pago, convertido.lancamento.id, { agora: AGORA });
    const depois = resumoDoMes(desfeito, MES, HOJE);
    assert.equal(depois.jaPago.totalCentavos, antes); // R$ 117,53: antes na fatura, agora na conta fixa
    assert.equal(depois.jaPago.fixosCentavos, 11753);
  });

  it('sem fatura paga: nenhum mês muda', () => {
    const { estado, lancamento } = converter(estadoDeTeste(), 'Remador');
    const desfeito = desfazerConversao(estado, lancamento.id, { agora: AGORA });
    assert.deepEqual(desfeito.meses, estado.meses);
  });
});

describe('o cartão com compra convertida fica protegido', () => {
  it('não deixa de ser cartão nem sai da lista de formas até desfazer', () => {
    const { estado, lancamento } = converter(estadoDeTeste(), 'Remador');
    assert.throws(() => removerCartao(estado, 'Cartão Careca'), /Desfaça a conversão/);
    assert.throws(() => removerFormaPagamento(estado, 'Cartão Careca'), /Desfaça a conversão/);
    // O outro cartão continua livre.
    assert.doesNotThrow(() => removerCartao(estado, 'Cartão Nubank'));

    const desfeito = desfazerConversao(estado, lancamento.id, { agora: AGORA });
    assert.doesNotThrow(() => removerCartao(desfeito, 'Cartão Careca'));
  });
});

describe('gravação', () => {
  it('a conversão sobrevive à gravação e ao backup', () => {
    const { estado } = converter(estadoDeTeste(), 'Remador');
    const lido = desempacotar(JSON.parse(JSON.stringify(empacotar(estado, { agora: AGORA }))));
    const [item] = comprasConvertidas(lido);
    assert.equal(item.parcelasPagas, 2);
    assert.equal(saidasDoLancamento(item.lancamento, lido.cartoes).length, 10);
  });
});
