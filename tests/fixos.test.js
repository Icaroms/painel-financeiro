/**
 * Testes das contas fixas na configuração.
 * Rodar com: npm test
 *
 * Dados FICTÍCIOS. Mês de referência: novembro de 2026.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mesesDoParcelamento,
  parcelaNoMes,
  fixosDoMes,
  adicionarFixo,
  editarFixo,
  encerrarFixo,
  definirValorNoMes,
  definirStatusDoFixo,
  statusDoFixoNoMes,
  MAXIMO_PARCELAS,
} from '../src/fixos.js';
import { fixoAtivoNoMes } from '../src/modelo.js';
import { sobraDoMes, virarMes } from '../src/meses.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';

const MES = '2026-11';
const HOJE = '2026-11-05';
const AGORA = new Date('2026-11-05T12:00:00.000Z');
const exemplo = () => criarDadosDeExemplo('2026-11-03');

const MENSAL = { nome: 'Plano de celular', valorCentavos: 3490, diaVencimento: 3, formaPagamento: 'Pix', tipo: 'mensal' };
const PARCELADO = {
  nome: 'Fone', valorCentavos: 11753, diaVencimento: 7, formaPagamento: 'Crédito',
  tipo: 'parcelado', parcelaAtual: 3, totalParcelas: 12,
};

/** Adiciona um fixo e devolve o estado e o fixo criado. */
function comFixo(dados, estado = exemplo()) {
  const novo = adicionarFixo(estado, dados, MES, { agora: AGORA });
  return { estado: novo, fixo: novo.fixos[novo.fixos.length - 1] };
}

describe('mesesDoParcelamento', () => {
  it('parcela 3 de 12 em novembro: de setembro de 2026 a agosto de 2027', () => {
    assert.deepEqual(mesesDoParcelamento(MES, 3, 12), { mesInicial: '2026-09', mesFinal: '2027-08' });
  });

  it('primeira e última parcela', () => {
    assert.deepEqual(mesesDoParcelamento(MES, 1, 3), { mesInicial: '2026-11', mesFinal: '2027-01' });
    assert.deepEqual(mesesDoParcelamento(MES, 4, 4), { mesInicial: '2026-08', mesFinal: '2026-11' });
  });

  it('rejeita parcelas inválidas', () => {
    assert.throws(() => mesesDoParcelamento(MES, 0, 12), { campo: 'parcelaAtual' });
    assert.throws(() => mesesDoParcelamento(MES, 13, 12), { campo: 'parcelaAtual' });
    assert.throws(() => mesesDoParcelamento(MES, 1, 0), { campo: 'totalParcelas' });
    assert.throws(() => mesesDoParcelamento(MES, 1, MAXIMO_PARCELAS + 1), { campo: 'totalParcelas' });
    assert.throws(() => mesesDoParcelamento(MES, 1.5, 12), { campo: 'parcelaAtual' });
  });
});

describe('parcelaNoMes', () => {
  it('mostra qual parcela cai em cada mês', () => {
    const { fixo } = comFixo(PARCELADO);
    assert.deepEqual(parcelaNoMes(fixo, '2026-11'), { atual: 3, total: 12 });
    assert.deepEqual(parcelaNoMes(fixo, '2027-08'), { atual: 12, total: 12 });
  });

  it('fixo mensal não tem parcela', () => {
    const { fixo } = comFixo(MENSAL);
    assert.equal(parcelaNoMes(fixo, MES), null);
  });
});

describe('adicionarFixo', () => {
  it('mensal começa no mês de referência e não tem fim', () => {
    const { fixo } = comFixo(MENSAL);
    assert.equal(fixo.mesInicial, MES);
    assert.equal(fixo.mesFinal, null);
    assert.equal(fixo.valorCentavos, 3490);
  });

  it('parcelado tem mês inicial e final calculados', () => {
    const { fixo } = comFixo(PARCELADO);
    assert.equal(fixo.mesInicial, '2026-09');
    assert.equal(fixo.mesFinal, '2027-08');
  });

  it('o parcelado some sozinho depois da última parcela', () => {
    const { fixo } = comFixo(PARCELADO);
    assert.equal(fixoAtivoNoMes(fixo, '2027-08'), true);
    assert.equal(fixoAtivoNoMes(fixo, '2027-09'), false);
  });

  it('exige uma forma de pagamento da lista', () => {
    assert.throws(() => comFixo({ ...MENSAL, formaPagamento: 'Boleto' }), { campo: 'formaPagamento' });
  });

  it('exige o tipo e repassa as validações do modelo', () => {
    assert.throws(() => comFixo({ ...MENSAL, tipo: 'outro' }), { campo: 'tipo' });
    assert.throws(() => comFixo({ ...MENSAL, nome: '' }), { campo: 'nome' });
    assert.throws(() => comFixo({ ...MENSAL, diaVencimento: 32 }), { campo: 'diaVencimento' });
    assert.throws(() => comFixo({ ...MENSAL, valorCentavos: -1 }), { campo: 'valorCentavos' });
  });
});

describe('fixosDoMes', () => {
  it('lista os fixos do mês ordenados pelo dia, com valor e parcela', () => {
    const { estado } = comFixo(PARCELADO, comFixo(MENSAL).estado);
    const lista = fixosDoMes(estado, MES, HOJE);

    const dias = lista.map((item) => item.fixo.diaVencimento);
    assert.deepEqual(dias, [...dias].sort((a, b) => a - b));

    const fone = lista.find((item) => item.fixo.nome === 'Fone');
    assert.deepEqual(fone.parcela, { atual: 3, total: 12 });
    assert.equal(fone.valorCentavos, 11753);
    assert.equal(fone.ajustado, false);
  });

  it('marca o fixo ajustado só neste mês (a consulta do exemplo)', () => {
    const consulta = fixosDoMes(exemplo(), MES, HOJE).find((item) => item.fixo.nome === 'Consulta');
    assert.equal(consulta.ajustado, true);
    assert.equal(consulta.valorCentavos, 25000);
  });
});

describe('editarFixo', () => {
  it('muda os dados mantendo o id', () => {
    const { estado, fixo } = comFixo(MENSAL);
    const editado = editarFixo(estado, fixo.id, { ...MENSAL, valorCentavos: 3990, diaVencimento: 10 }, MES, { agora: AGORA })
      .fixos.find((f) => f.id === fixo.id);

    assert.equal(editado.valorCentavos, 3990);
    assert.equal(editado.diaVencimento, 10);
    assert.equal(editado.criadoEm, fixo.criadoEm);
  });

  it('editar um mensal antigo não muda o mês em que ele começou', () => {
    const { estado, fixo } = comFixo(MENSAL);
    const dezembro = virarMes(estado, '2026-12').estado;
    const editado = editarFixo(dezembro, fixo.id, { ...MENSAL, valorCentavos: 5000 }, '2026-12')
      .fixos.find((f) => f.id === fixo.id);
    assert.equal(editado.mesInicial, MES);
  });

  it('recalcula os meses de um parcelado', () => {
    const { estado, fixo } = comFixo(PARCELADO);
    const editado = editarFixo(estado, fixo.id, { ...PARCELADO, parcelaAtual: 1, totalParcelas: 6 }, MES)
      .fixos.find((f) => f.id === fixo.id);
    assert.equal(editado.mesInicial, '2026-11');
    assert.equal(editado.mesFinal, '2027-04');
  });

  it('rejeita fixo inexistente', () => {
    assert.throws(() => editarFixo(exemplo(), 'nao-existe', MENSAL, MES), { campo: 'fixo' });
  });
});

describe('encerrarFixo', () => {
  it('fixo antigo: termina no mês anterior e os meses passados continuam certos', () => {
    // Fixo de setembro (parcelado) encerrado em novembro.
    const { estado, fixo } = comFixo(PARCELADO);
    const { estado: depois, como } = encerrarFixo(estado, fixo.id, MES, { agora: AGORA });
    const encerrado = depois.fixos.find((f) => f.id === fixo.id);

    assert.equal(como, 'encerrado');
    assert.equal(encerrado.mesFinal, '2026-10');
    assert.equal(encerrado.excluidoEm, null);
    assert.equal(fixoAtivoNoMes(encerrado, '2026-10'), true);  // outubro continua com ele
    assert.equal(fixoAtivoNoMes(encerrado, MES), false);       // novembro em diante, não
  });

  it('fixo criado neste mês: é excluído (provável engano)', () => {
    const { estado, fixo } = comFixo(MENSAL);
    const { estado: depois, como } = encerrarFixo(estado, fixo.id, MES, { agora: AGORA });

    assert.equal(como, 'excluido');
    assert.equal(depois.fixos.find((f) => f.id === fixo.id).excluidoEm, '2026-11-05T12:00:00.000Z');
  });

  it('rejeita fixo inexistente ou já excluído', () => {
    const { estado, fixo } = comFixo(MENSAL);
    const { estado: depois } = encerrarFixo(estado, fixo.id, MES);
    assert.throws(() => encerrarFixo(depois, fixo.id, MES), { campo: 'fixo' });
  });
});

describe('definirValorNoMes', () => {
  it('ajusta só este mês e muda o saldo só deste mês', () => {
    const { estado, fixo } = comFixo(MENSAL);
    const antes = sobraDoMes(estado, MES);
    const depois = definirValorNoMes(estado, MES, fixo.id, 5000, { agora: AGORA });

    assert.equal(sobraDoMes(depois, MES), antes - (5000 - 3490));
    assert.equal(depois.fixos.find((f) => f.id === fixo.id).valorCentavos, 3490); // padrão intacto
  });

  it('com null, remove o ajuste e volta ao valor padrão', () => {
    const dados = exemplo();
    const consulta = dados.fixos.find((f) => f.nome === 'Consulta');
    const depois = definirValorNoMes(dados, MES, consulta.id, null);
    const item = fixosDoMes(depois, MES, HOJE).find((i) => i.fixo.id === consulta.id);

    assert.equal(item.ajustado, false);
    assert.equal(item.valorCentavos, 0);
  });

  it('rejeita fixo que não conta no mês e valor negativo', () => {
    const { estado, fixo } = comFixo({ ...PARCELADO, parcelaAtual: 1, totalParcelas: 1 }); // só novembro
    const dezembro = virarMes(estado, '2026-12').estado;

    assert.throws(() => definirValorNoMes(dezembro, '2026-12', fixo.id, 100), { campo: 'fixo' });
    assert.throws(() => definirValorNoMes(estado, MES, fixo.id, -1), { campo: 'valorCentavos' });
  });
});

describe('status das contas fixas: previsto, pago e dispensado', () => {
  const DENTISTA = { ...MENSAL, nome: 'Dentista', valorCentavos: 12000, diaVencimento: 1 };
  const AUTOMATICA = { ...MENSAL, nome: 'Assinatura', valorCentavos: 11851, diaVencimento: 3, pagamentoAutomatico: true };
  const item = (estado, id, hoje = HOJE) => fixosDoMes(estado, MES, hoje).find((i) => i.fixo.id === id);

  it('toda conta começa o mês como prevista', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    assert.equal(item(estado, fixo.id).status, 'previsto');
    assert.equal(item(estado, fixo.id).valorCentavos, 12000);
  });

  it('pago com o valor real: muda o valor só neste mês', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    const pago = definirStatusDoFixo(estado, MES, fixo.id, 'pago', { valorCentavos: 13500 });
    assert.equal(item(pago, fixo.id).status, 'pago');
    assert.equal(item(pago, fixo.id).valorCentavos, 13500);
    assert.equal(pago.fixos.find((f) => f.id === fixo.id).valorCentavos, 12000); // valor padrão intacto
  });

  it('pago com o valor de sempre não cria ajuste', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    const pago = definirStatusDoFixo(estado, MES, fixo.id, 'pago', { valorCentavos: 12000 });
    assert.equal(item(pago, fixo.id).ajustado, false);
  });

  it('dispensado: deixa de contar e não muda a sobra', () => {
    const base = exemplo();
    const { estado, fixo } = comFixo(DENTISTA, base);
    const dispensado = definirStatusDoFixo(estado, MES, fixo.id, 'dispensado');

    assert.equal(item(dispensado, fixo.id).valorCentavos, 0);
    assert.equal(item(dispensado, fixo.id).valorEstipuladoCentavos, 12000);
    assert.equal(sobraDoMes(dispensado, MES), sobraDoMes(base, MES));
  });

  it('o mês seguinte começa com tudo previsto de novo', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    const dezembro = virarMes(definirStatusDoFixo(estado, MES, fixo.id, 'dispensado'), '2026-12').estado;
    const emDezembro = fixosDoMes(dezembro, '2026-12', '2026-12-02').find((i) => i.fixo.id === fixo.id);
    assert.equal(emDezembro.status, 'previsto');
    assert.equal(emDezembro.valorCentavos, 12000);
  });

  it('pagamento automático vira pago sozinho no dia do vencimento', () => {
    const { estado, fixo } = comFixo(AUTOMATICA);
    assert.equal(item(estado, fixo.id, '2026-11-02').status, 'previsto');
    assert.deepEqual(
      [item(estado, fixo.id, '2026-11-03').status, item(estado, fixo.id, '2026-11-03').automatico],
      ['pago', true],
    );
  });

  it('o que a pessoa marcou vence o automático', () => {
    const { estado, fixo } = comFixo(AUTOMATICA);
    const voltou = definirStatusDoFixo(estado, MES, fixo.id, 'previsto');
    assert.equal(item(voltou, fixo.id, '2026-11-20').status, 'previsto');
    const dispensada = definirStatusDoFixo(estado, MES, fixo.id, 'dispensado');
    assert.equal(item(dispensada, fixo.id, '2026-11-20').status, 'dispensado');
  });

  it('statusDoFixoNoMes: vencimento no dia 31 cai no último dia do mês', () => {
    const { estado, fixo } = comFixo({ ...AUTOMATICA, diaVencimento: 31 });
    const novembro = estado.meses.find((m) => m.mes === MES);
    assert.equal(statusDoFixoNoMes(fixo, novembro, '2026-11-29').status, 'previsto');
    assert.equal(statusDoFixoNoMes(fixo, novembro, '2026-11-30').status, 'pago');
    assert.equal(statusDoFixoNoMes(fixo, novembro, '2026-11-30').diaEfetivo, 30);
  });

  it('mês gravado antes do campo existir: nada dispensado, tudo previsto', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    const semCampo = {
      ...estado,
      meses: estado.meses.map(({ statusFixos, ...resto }) => resto),
    };
    assert.equal(item(semCampo, fixo.id).status, 'previsto');
    assert.equal(item(semCampo, fixo.id).valorCentavos, 12000);
  });

  it('editar liga e desliga o pagamento automático e descarta o antigo "opcional"', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    const comOpcional = { ...estado, fixos: estado.fixos.map((f) => (f.id === fixo.id ? { ...f, opcional: true } : f)) };
    const ligado = editarFixo(comOpcional, fixo.id, { ...DENTISTA, pagamentoAutomatico: true }, MES);
    const editado = ligado.fixos.find((f) => f.id === fixo.id);
    assert.equal(editado.pagamentoAutomatico, true);
    assert.equal(Object.hasOwn(editado, 'opcional'), false);
  });

  it('rejeita status inválido, valor negativo e conta fora do mês', () => {
    const { estado, fixo } = comFixo(DENTISTA);
    assert.throws(() => definirStatusDoFixo(estado, MES, fixo.id, 'talvez'), { campo: 'status' });
    assert.throws(() => definirStatusDoFixo(estado, MES, fixo.id, 'pago', { valorCentavos: -1 }), { campo: 'valorCentavos' });
    assert.throws(() => definirStatusDoFixo(estado, MES, 'nao-existe', 'pago'), { campo: 'fixo' });
    assert.throws(() => comFixo({ ...DENTISTA, pagamentoAutomatico: 'sim' }), { campo: 'pagamentoAutomatico' });
  });
});
