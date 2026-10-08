/**
 * Testes do lembrete de backup.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { registrarBackup, situacaoDoBackup, DIAS_PARA_LEMBRAR } from '../src/lembrete-backup.js';
import { criarDadosIniciais } from '../src/inicio.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { empacotar, desempacotar } from '../src/persistencia.js';

// Datas locais (new Date(ano, mês, dia)), para os testes valerem em qualquer fuso.
const DIA = (dia, hora = 12) => new Date(2026, 10, dia, hora); // novembro de 2026

/** Dados de verdade criados no dia 1º de novembro. */
const dadosReais = () => criarDadosIniciais('2026-11-01', { agora: DIA(1) });

describe('registrarBackup', () => {
  it('guarda o momento do backup sem mudar o resto', () => {
    const antes = dadosReais();
    const depois = registrarBackup(antes, { agora: DIA(3) });
    assert.equal(depois.ultimoBackupEm, DIA(3).toISOString());
    assert.equal(depois.meses, antes.meses);
    assert.equal(antes.ultimoBackupEm, undefined); // o original não muda
  });

  it('o campo sobrevive à gravação, sem mudar a versão do formato', () => {
    const lidos = desempacotar(empacotar(registrarBackup(dadosReais(), { agora: DIA(3) })));
    assert.equal(lidos.ultimoBackupEm, DIA(3).toISOString());
  });
});

describe('situacaoDoBackup', () => {
  it('o prazo padrão é de 7 dias', () => {
    assert.equal(DIAS_PARA_LEMBRAR, 7);
  });

  it('textos de hoje, ontem e há N dias', () => {
    const comBackup = registrarBackup(dadosReais(), { agora: DIA(3, 9) });
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(3, 22) }).texto, 'Último backup: hoje.');
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(4, 8) }).texto, 'Último backup: ontem.');
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(8) }).texto, 'Último backup: há 5 dias.');
  });

  it('conta dias de calendário: 23h de um dia e 1h do seguinte já é "ontem"', () => {
    const comBackup = registrarBackup(dadosReais(), { agora: DIA(3, 23) });
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(4, 1) }).dias, 1);
  });

  it('fica atrasado a partir de 7 dias', () => {
    const comBackup = registrarBackup(dadosReais(), { agora: DIA(3) });
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(9) }).atrasado, false); // 6 dias
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(10) }).atrasado, true); // 7 dias
  });

  it('sem nenhum backup: o prazo conta desde que os dados foram criados', () => {
    const dados = dadosReais();
    assert.equal(situacaoDoBackup(dados, { agora: DIA(1) }).texto, 'Nenhum backup ainda.');
    assert.equal(situacaoDoBackup(dados, { agora: DIA(1) }).atrasado, false); // acabou de começar
    assert.equal(situacaoDoBackup(dados, { agora: DIA(8) }).atrasado, true);  // 7 dias sem nenhum backup
  });

  it('dados de exemplo nunca pedem backup', () => {
    const exemplo = criarDadosDeExemplo('2026-11-01');
    assert.equal(situacaoDoBackup(exemplo, { agora: DIA(30) }).atrasado, false);
  });

  it('data inválida conta como nenhum backup', () => {
    const dados = { ...dadosReais(), ultimoBackupEm: 'não é data' };
    assert.equal(situacaoDoBackup(dados, { agora: DIA(2) }).texto, 'Nenhum backup ainda.');
  });

  it('aceita outro prazo', () => {
    const comBackup = registrarBackup(dadosReais(), { agora: DIA(3) });
    assert.equal(situacaoDoBackup(comBackup, { agora: DIA(6), limiteDias: 3 }).atrasado, true);
  });
});
