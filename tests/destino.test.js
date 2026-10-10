/**
 * Testes do destino da sobra (Fase 04, parte 4.1).
 * Rodar com: npm test
 *
 * Usa os dados de exemplo (fictícios) num dia fixo: 10 de novembro de 2026.
 * No exemplo: deve sobrar R$ 760,20; contas fixas de novembro R$ 139,80
 * (Academia 99,90 + Streaming 39,90; a Consulta tem valor 0 e só um ajuste
 * de R$ 250 neste mês); orçamentos R$ 1.100 (200 + 300 + 600).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DESTINO_PADRAO,
  configuracaoDoDestino,
  salvarDestino,
  custoDoMes,
  situacaoDaReserva,
  dividirSobra,
} from '../src/destino.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { definirStatusDoFixo } from '../src/fixos.js';
import { empacotar, desempacotar } from '../src/persistencia.js';

const HOJE = '2026-11-10';
const MES = '2026-11';
const exemplo = () => criarDadosDeExemplo(HOJE);
const comDestino = (estado, dados) => salvarDestino(estado, { ...configuracaoDoDestino(estado), ...dados });

describe('configuração', () => {
  it('sem nada salvo: 70 · 20 · 10, meta de 6 meses, reserva zero', () => {
    assert.deepEqual(configuracaoDoDestino(exemplo()), {
      porcentagens: { reserva: 70, investir: 20, alivio: 10 }, metaMeses: 6, reservaAtualCentavos: 0,
    });
    assert.equal(DESTINO_PADRAO.metaMeses, 6);
  });

  it('salvar guarda no estado (e o backup leva junto)', () => {
    const estado = comDestino(exemplo(), {
      porcentagens: { reserva: 50, investir: 40, alivio: 10 }, metaMeses: 3, reservaAtualCentavos: 100000,
    });
    assert.deepEqual(configuracaoDoDestino(estado).porcentagens, { reserva: 50, investir: 40, alivio: 10 });
    const lido = desempacotar(JSON.parse(JSON.stringify(empacotar(estado))));
    assert.equal(configuracaoDoDestino(lido).reservaAtualCentavos, 100000);
  });

  it('erros claros: soma diferente de 100, porcentagem inválida, meta fora do limite, reserva negativa', () => {
    const base = configuracaoDoDestino(exemplo());
    assert.throws(() => salvarDestino(exemplo(), { ...base, porcentagens: { reserva: 70, investir: 20, alivio: 20 } }), /somar 100% \(agora somam 110%\)/);
    assert.throws(() => salvarDestino(exemplo(), { ...base, porcentagens: { reserva: NaN, investir: 20, alivio: 10 } }), /Reserva: use um número inteiro/);
    assert.throws(() => salvarDestino(exemplo(), { ...base, metaMeses: 0 }), /de 1 a 24 meses/);
    assert.throws(() => salvarDestino(exemplo(), { ...base, metaMeses: 25 }), /de 1 a 24 meses/);
    assert.throws(() => salvarDestino(exemplo(), { ...base, reservaAtualCentavos: -1 }), /zero ou mais/);
  });
});

describe('custo do mês e meta da reserva', () => {
  it('contas fixas pelo valor de sempre + orçamentos', () => {
    assert.deepEqual(custoDoMes(exemplo(), MES), {
      contasFixasCentavos: 13980, orcamentosCentavos: 110000, totalCentavos: 123980,
    });
  });

  it('conta dispensada no mês continua no custo (a reserva é para um mês normal)', () => {
    let estado = exemplo();
    const academia = estado.fixos.find((f) => f.nome === 'Academia');
    estado = definirStatusDoFixo(estado, MES, academia.id, 'dispensado');
    assert.equal(custoDoMes(estado, MES).contasFixasCentavos, 13980);
  });

  it('meta = custo × meses; quanto falta e a fração', () => {
    const estado = comDestino(exemplo(), { reservaAtualCentavos: 371940 }); // metade de 6 × 1.239,80
    const r = situacaoDaReserva(estado, MES);
    assert.equal(r.metaCentavos, 743880);
    assert.equal(r.faltaCentavos, 371940);
    assert.equal(r.fracao, 0.5);
    assert.equal(r.completa, false);
  });
});

describe('dividirSobra', () => {
  it('a sobra acima da folga é dividida por 70 · 20 · 10, e a soma bate exatamente', () => {
    const d = dividirSobra(exemplo(), MES, HOJE);
    assert.equal(d.sobraCentavos, 76020);
    assert.equal(d.folgaCentavos, 20000);
    assert.equal(d.aDividirCentavos, 56020);
    assert.equal(d.reservaCentavos, 39214); // 70% arredondado para baixo
    assert.equal(d.investirCentavos, 11204); // 20%
    assert.equal(d.alivioCentavos, 5602); // 10% + os centavos do arredondamento
    assert.equal(d.reservaCentavos + d.investirCentavos + d.alivioCentavos, d.aDividirCentavos);
    assert.equal(d.paraInvestirDaReservaCentavos, 0);
  });

  it('reserva quase na meta: recebe só o que falta e o resto vai para Investir', () => {
    const estado = comDestino(exemplo(), { reservaAtualCentavos: 743880 - 10000 }); // faltam R$ 100
    const d = dividirSobra(estado, MES, HOJE);
    assert.equal(d.reservaCentavos, 10000);
    assert.equal(d.paraInvestirDaReservaCentavos, 39214 - 10000);
    assert.equal(d.investirCentavos, 11204 + 29214);
    assert.equal(d.reservaCentavos + d.investirCentavos + d.alivioCentavos, d.aDividirCentavos);
  });

  it('reserva completa: a parte dela vai inteira para Investir', () => {
    const estado = comDestino(exemplo(), { reservaAtualCentavos: 800000 });
    const d = dividirSobra(estado, MES, HOJE);
    assert.equal(d.reserva.completa, true);
    assert.equal(d.reservaCentavos, 0);
    assert.equal(d.investirCentavos, 39214 + 11204);
    assert.equal(d.alivioCentavos, 5602);
  });

  it('sobra abaixo da folga: nada a dividir', () => {
    const estado = exemplo();
    estado.meses = estado.meses.map((m) => ({ ...m, rendaPrevistaCentavos: m.rendaPrevistaCentavos - 60000 }));
    const d = dividirSobra(estado, MES, HOJE);
    assert.equal(d.sobraCentavos, 16020);
    assert.equal(d.aDividirCentavos, 0);
    assert.deepEqual([d.reservaCentavos, d.investirCentavos, d.alivioCentavos], [0, 0, 0]);
  });

  it('porcentagens escolhidas pela pessoa', () => {
    const estado = comDestino(exemplo(), { porcentagens: { reserva: 0, investir: 0, alivio: 100 } });
    const d = dividirSobra(estado, MES, HOJE);
    assert.deepEqual([d.reservaCentavos, d.investirCentavos, d.alivioCentavos], [0, 0, 56020]);
  });
});
