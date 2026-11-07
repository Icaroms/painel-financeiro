/**
 * Testes das entradas de dinheiro, da previsão com média real e dos
 * orçamentos (11/2026). Rodar com: npm test
 *
 * Dados FICTÍCIOS. O caso que motivou a mudança: a pessoa começou a usar o
 * app em novembro, depois de o salário cair. Informou o saldo com o salário
 * dentro e deixou a renda em zero. A previsão dos meses seguintes passou a
 * contar ZERO de salário.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  adicionarEntradaFixa, editarEntradaFixa, removerEntradaFixa, definirStatusDaEntrada, situacaoDaEntradaNoMes,
  adicionarEntradaAvulsa, removerEntradaAvulsa, rendaDoMes, detalheDaRendaDoMes, entradaPrevistaNoMes,
  transformarRendaEmEntradaFixa, entradaAtivaNoMes, MAXIMO_ENTRADAS_FIXAS, conferirComBanco,
} from '../src/entradas.js';
import { estimativaDiaADia, projetarMeses, premissasDaPrevisao } from '../src/fluxo.js';
import { livreParaODiaADia, alertaDosOrcamentos, sugerirOrcamentos, aplicarSugestao } from '../src/orcamento.js';
import { criarCategoria, criarFixo, criarMes, criarLancamento } from '../src/modelo.js';
import { dadosDoMes, sobraDoMes, virarMes } from '../src/meses.js';
import { resumoDoMes } from '../src/resumo-mes.js';
import { ErroValidacao } from '../src/erros.js';

const MES = '2026-11';
const HOJE = '2026-11-07';
const AGORA = new Date('2026-11-07T12:00:00Z');
let contador = 0;
const gerarId = () => `id-${(contador += 1)}`;

const lazer = criarCategoria({ nome: 'Lazer', orcamentoCentavos: 300000 });
const mercado = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 200000 });

/** Saldo de R$ 2.600 já com o salário; renda zero; contas de R$ 624,69. */
function estadoDoIcaro(extra = {}) {
  return {
    meses: [criarMes({ mes: MES, saldoInicialCentavos: 260000, rendaPrevistaCentavos: 0 })],
    categorias: [lazer, mercado],
    fixos: [criarFixo({
      nome: 'Contas', valorCentavos: 62469, diaVencimento: 10, formaPagamento: 'Pix', mesInicial: '2026-01',
    })],
    lancamentos: [],
    formasPagamento: ['Pix'],
    cartoes: [],
    ...extra,
  };
}

const comSalario = (statusNoMes = 'no-saldo', estado = estadoDoIcaro()) => adicionarEntradaFixa(
  estado, { nome: 'Salário', valorCentavos: 231200, dia: 5 }, MES, { statusNoMes, agora: AGORA, gerarId },
);
const salarioDe = (estado) => estado.entradasFixas[0];

describe('entradas fixas: cadastro', () => {
  it('cadastra o salário a partir do mês, com a situação deste mês', () => {
    const estado = comSalario('no-saldo');
    const salario = salarioDe(estado);
    assert.equal(salario.nome, 'Salário');
    assert.equal(salario.valorCentavos, 231200);
    assert.equal(salario.mesInicial, MES);
    assert.equal(salario.mesFinal, null);
    assert.equal(estado.meses[0].statusEntradas[salario.id], 'no-saldo');
  });

  it('valida nome, valor, dia e o limite de entradas', () => {
    const e = estadoDoIcaro();
    assert.throws(() => adicionarEntradaFixa(e, { nome: ' ', valorCentavos: 100, dia: 5 }, MES), /nome/);
    assert.throws(() => adicionarEntradaFixa(e, { nome: 'X', valorCentavos: 0, dia: 5 }, MES), /maior que zero/);
    assert.throws(() => adicionarEntradaFixa(e, { nome: 'X', valorCentavos: 100, dia: 32 }, MES), /1 a 31/);
    let cheio = e;
    for (let i = 0; i < MAXIMO_ENTRADAS_FIXAS; i += 1) {
      cheio = adicionarEntradaFixa(cheio, { nome: `E${i}`, valorCentavos: 100, dia: 1 }, MES, { gerarId });
    }
    assert.throws(() => adicionarEntradaFixa(cheio, { nome: 'Mais', valorCentavos: 100, dia: 1 }, MES), ErroValidacao);
  });

  it('editar muda o valor padrão; remover tira a criada neste mês e encerra a antiga', () => {
    const estado = comSalario('prevista');
    const id = salarioDe(estado).id;
    const editado = editarEntradaFixa(estado, id, { nome: 'Salário', valorCentavos: 250000, dia: 6 });
    assert.equal(salarioDe(editado).valorCentavos, 250000);
    assert.equal(salarioDe(editado).dia, 6);

    assert.equal(removerEntradaFixa(estado, id, MES).entradasFixas.length, 0);
    const encerrado = salarioDe(removerEntradaFixa(estado, id, '2027-01'));
    assert.equal(encerrado.mesFinal, '2026-12');
    assert.equal(entradaAtivaNoMes(encerrado, '2026-12'), true);
    assert.equal(entradaAtivaNoMes(encerrado, '2027-01'), false);
  });
});

describe('entradas fixas: situação no mês e dinheiro do mês', () => {
  it('"já estava no saldo" não conta de novo; prevista e recebida contam', () => {
    const noSaldo = comSalario('no-saldo');
    assert.equal(rendaDoMes(noSaldo.meses[0], noSaldo.entradasFixas), 0);
    assert.equal(sobraDoMes(noSaldo, MES), 260000 - 62469);

    const prevista = comSalario('prevista');
    assert.equal(rendaDoMes(prevista.meses[0], prevista.entradasFixas), 231200);
    assert.equal(sobraDoMes(prevista, MES), 260000 + 231200 - 62469);
  });

  it('recebida com valor diferente usa o valor real; "não veio" conta zero', () => {
    const estado = comSalario('prevista');
    const id = salarioDe(estado).id;
    const recebida = definirStatusDaEntrada(estado, MES, id, 'recebida', { valorCentavos: 240000, agora: AGORA });
    assert.deepEqual(situacaoDaEntradaNoMes(salarioDe(recebida), recebida.meses[0]), {
      status: 'recebida', valorCentavos: 240000, contaCentavos: 240000, dia: 5,
    });
    const naoVeio = definirStatusDaEntrada(recebida, MES, id, 'nao-veio');
    assert.equal(rendaDoMes(naoVeio.meses[0], naoVeio.entradasFixas), 0);
    assert.equal(naoVeio.meses[0].valoresEntradas[id], undefined, 'o valor real some fora de "recebida"');
    const deVolta = definirStatusDaEntrada(naoVeio, MES, id, 'prevista');
    assert.equal(deVolta.meses[0].statusEntradas[id], undefined);
  });

  it('o resumo do mês mostra o dinheiro do mês com as entradas, em partes', () => {
    const estado = adicionarEntradaAvulsa(comSalario('prevista'), { valorCentavos: 15000, data: '2026-11-06', descricao: 'Freela' }, { gerarId });
    const r = resumoDoMes(estado, MES, HOJE);
    assert.equal(r.dinheiroDoMesCentavos, 260000 + 231200 + 15000);
    assert.deepEqual(r.entradas, {
      outrasCentavos: 0, fixasCentavos: 231200, avulsasCentavos: 15000, totalCentavos: 246200, jaEntrouCentavos: 15000,
    });
    // Na conta agora: o salário ainda está "previsto", então só a avulsa entrou.
    assert.equal(r.naContaAgoraCentavos, 260000 + 15000);
  });
});

describe('entradas avulsas', () => {
  it('registra no mês da data e apaga', () => {
    const estado = adicionarEntradaAvulsa(estadoDoIcaro(), { valorCentavos: 5000, data: '2026-11-03', descricao: '  Pix do João ' }, { gerarId, agora: AGORA });
    const [avulsa] = estado.meses[0].entradasAvulsas;
    assert.equal(avulsa.descricao, 'Pix do João');
    assert.equal(detalheDaRendaDoMes(estado.meses[0], []).avulsasCentavos, 5000);
    const apagado = removerEntradaAvulsa(estado, MES, avulsa.id);
    assert.equal(apagado.meses[0].entradasAvulsas.length, 0);
  });

  it('data de um mês que não existe nos dados: erro claro', () => {
    assert.throws(() => adicionarEntradaAvulsa(estadoDoIcaro(), { valorCentavos: 5000, data: '2026-08-01' }), /não existe/);
    assert.throws(() => adicionarEntradaAvulsa(estadoDoIcaro(), { valorCentavos: 0, data: '2026-11-01' }), /maior que zero/);
  });
});

describe('previsão dos meses seguintes', () => {
  it('O BUG: sem entrada fixa e renda zero, os meses seguintes ficam sem salário', () => {
    const [, dezembro] = projetarMeses(dadosDoMes(estadoDoIcaro(), MES), 1);
    assert.equal(dezembro.entradasCentavos, 0);
  });

  it('com o salário cadastrado ("já estava no saldo"), dezembro recebe o salário', () => {
    const visao = dadosDoMes(comSalario('no-saldo'), MES);
    const [novembro, dezembro] = projetarMeses(visao, 1);
    assert.equal(novembro.sobraCentavos, 260000 - 62469);
    assert.equal(dezembro.entradasCentavos, 231200);
    assert.equal(dezembro.contasCentavos, 62469);
    // Sem histórico, o dia a dia é a soma dos orçamentos (R$ 5.000).
    assert.equal(dezembro.diaADiaCentavos, 500000);
    assert.equal(dezembro.sobraCentavos, novembro.sobraCentavos + 231200 - 62469 - 500000);
  });

  it('dados antigos (sem entradas fixas): a renda deste mês continua sendo a dos próximos', () => {
    const estado = estadoDoIcaro();
    estado.meses[0] = { ...estado.meses[0], rendaPrevistaCentavos: 100000 };
    assert.deepEqual(entradaPrevistaNoMes(estado.meses[0], [], '2026-12'), { centavos: 100000, fonte: 'renda-do-mes' });
  });

  it('com meses anteriores, o dia a dia é a MÉDIA do que foi gasto (sem parceladas)', () => {
    const estado = comSalario('no-saldo');
    estado.meses = [
      criarMes({ mes: '2026-09', saldoInicialCentavos: 0 }),
      criarMes({ mes: '2026-10', saldoInicialCentavos: 0 }),
      ...estado.meses,
    ];
    estado.lancamentos = [
      criarLancamento({ valorCentavos: 100000, categoriaId: lazer.id, formaPagamento: 'Pix', data: '2026-09-10' }),
      criarLancamento({ valorCentavos: 140000, categoriaId: mercado.id, formaPagamento: 'Pix', data: '2026-10-10' }),
      // Parcelada: fica fora da média (as parcelas entram nas faturas).
      criarLancamento({ valorCentavos: 900000, categoriaId: lazer.id, formaPagamento: 'Pix', data: '2026-10-11', parcelas: 1 }),
    ];
    estado.lancamentos[2] = { ...estado.lancamentos[2], parcelas: 5 };
    const visao = dadosDoMes(estado, MES);
    assert.deepEqual(estimativaDiaADia(visao), { centavos: 120000, fonte: 'media', meses: 2 });
    const premissas = premissasDaPrevisao(visao);
    assert.deepEqual(premissas.entrada, { centavos: 231200, fonte: 'entradas-fixas' });
    assert.equal(premissas.contasCentavos, 62469);
  });

  it('virada do mês: com entradas fixas, as "outras entradas" não se repetem', () => {
    const estado = comSalario('prevista');
    estado.meses[0] = { ...estado.meses[0], rendaPrevistaCentavos: 30000 };
    const { criado } = virarMes(estado, '2026-12', { gerarId });
    assert.equal(criado.rendaPrevistaCentavos, 0);
    // A sobra de novembro (sugerida como saldo de dezembro) inclui salário e outras entradas.
    assert.equal(criado.saldoInicialCentavos, 260000 + 231200 + 30000 - 62469);
  });

  it('transformar a renda prevista em salário fixo não muda o dinheiro do mês', () => {
    const estado = estadoDoIcaro();
    estado.meses[0] = { ...estado.meses[0], rendaPrevistaCentavos: 231200 };
    const antes = sobraDoMes(estado, MES);
    const depois = transformarRendaEmEntradaFixa(estado, MES, { dia: 5 }, { gerarId });
    assert.equal(depois.meses[0].rendaPrevistaCentavos, 0);
    assert.equal(salarioDe(depois).valorCentavos, 231200);
    assert.equal(sobraDoMes(depois, MES), antes);
    assert.throws(() => transformarRendaEmEntradaFixa(estadoDoIcaro(), MES, { dia: 5 }), /Não há renda/);
  });
});

describe('orçamentos', () => {
  it('livre do mês = salário − contas fixas − folga (o salário vale mesmo "no saldo")', () => {
    const livre = livreParaODiaADia(comSalario('no-saldo'), MES);
    assert.equal(livre.entradasCentavos, 231200);
    assert.equal(livre.fonteEntradas, 'entradas-fixas');
    assert.equal(livre.contasCentavos, 62469);
    assert.equal(livre.parcelasCentavos, 0);
    assert.equal(livre.livreCentavos, 231200 - 62469 - 20000);
  });

  it('alerta quando a soma dos orçamentos passa do livre; sem alerta quando cabe', () => {
    const alerta = alertaDosOrcamentos(comSalario('no-saldo'), MES);
    assert.equal(alerta.somaCentavos, 500000);
    assert.equal(alerta.excessoCentavos, 500000 - (231200 - 62469 - 20000));

    const pequenos = comSalario('no-saldo', estadoDoIcaro({
      categorias: [criarCategoria({ nome: 'Lazer', orcamentoCentavos: 50000 })],
    }));
    assert.equal(alertaDosOrcamentos(pequenos, MES), null);
  });

  it('sugestão: divide o livre pelo peso dos orçamentos atuais (sem gastos), de R$ 10 em R$ 10', () => {
    const sugestao = sugerirOrcamentos(comSalario('no-saldo'), MES);
    assert.equal(sugestao.ok, true);
    assert.equal(sugestao.base, 'orcamentos');
    const livre = 231200 - 62469 - 20000; // 148.731
    const [l, m] = sugestao.itens;
    assert.equal(l.sugeridoCentavos, Math.floor((livre * 0.6) / 1000) * 1000);
    assert.equal(m.sugeridoCentavos, Math.floor((livre * 0.4) / 1000) * 1000);
    assert.ok(l.sugeridoCentavos + m.sugeridoCentavos <= livre);
  });

  it('sugestão pelos gastos quando houver; sem entradas, explica o que falta', () => {
    const estado = comSalario('no-saldo');
    estado.lancamentos = [criarLancamento({ valorCentavos: 30000, categoriaId: mercado.id, formaPagamento: 'Pix', data: '2026-11-02' })];
    const sugestao = sugerirOrcamentos(estado, MES);
    assert.equal(sugestao.base, 'gastos');
    assert.equal(sugestao.itens.find((i) => i.categoria.nome === 'Lazer').sugeridoCentavos, 0);

    const semSalario = sugerirOrcamentos(estadoDoIcaro(), MES);
    assert.equal(semSalario.ok, false);
    assert.match(semSalario.motivo, /Entradas fixas/);
  });

  it('aplicar grava só o que mudou', () => {
    const estado = estadoDoIcaro();
    const novo = aplicarSugestao(estado, [
      { categoriaId: lazer.id, orcamentoCentavos: 80000 },
      { categoriaId: mercado.id, orcamentoCentavos: 200000 },
    ], { agora: AGORA });
    assert.equal(novo.categorias[0].orcamentoCentavos, 80000);
    assert.equal(novo.categorias[0].atualizadoEm, AGORA.toISOString());
    assert.equal(novo.categorias[1], estado.categorias[1]);
    assert.throws(() => aplicarSugestao(estado, [{ categoriaId: lazer.id, orcamentoCentavos: -1 }]), /zero ou positivo/);
  });
});

describe('conferência com o banco', () => {
  it('O CASO REAL: salário recebido E dentro do saldo inicial → app com o salário a mais, e ele é apontado', () => {
    const estado = comSalario('recebida'); // saldo 2.600 já tinha o salário
    const r = resumoDoMes(estado, MES, HOJE);
    const conferencia = conferirComBanco({
      appCentavos: r.naContaAgoraCentavos, bancoCentavos: 260000, registroMes: estado.meses[0], entradasFixas: estado.entradasFixas,
    });
    assert.equal(conferencia.situacao, 'app-maior');
    assert.equal(conferencia.diferencaCentavos, 231200);
    assert.deepEqual(conferencia.suspeitas, [{ tipo: 'entrada-fixa', nome: 'Salário', valorCentavos: 231200 }]);
  });

  it('bate com até R$ 1,00 de diferença', () => {
    const estado = comSalario('no-saldo');
    assert.equal(conferirComBanco({ appCentavos: 100050, bancoCentavos: 100000, registroMes: estado.meses[0] }).situacao, 'bate');
  });

  it('app com menos: aponta o gasto com o valor da diferença (lançado duas vezes?)', () => {
    const estado = estadoDoIcaro();
    const gasto = criarLancamento({ valorCentavos: 4590, categoriaId: lazer.id, formaPagamento: 'Pix', data: '2026-11-05', descricao: 'Cinema' });
    const c = conferirComBanco({ appCentavos: 100000, bancoCentavos: 104590, registroMes: estado.meses[0], gastosDoMes: [gasto] });
    assert.equal(c.situacao, 'app-menor');
    assert.deepEqual(c.suspeitas, [{ tipo: 'gasto', nome: 'Cinema', valorCentavos: 4590 }]);
  });
});

