/**
 * Testes dos backups na nuvem (Fase 05, parte 5.4): tamanho, situação e descrição.
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAS_PARA_BACKUP_NUVEM,
  TAMANHO_MAXIMO_PADRAO,
  descreverBackup,
  precisaDeBackupAutomatico,
  prepararBackupNuvem,
  situacaoDoBackupNuvem,
  tamanhoEmBytes,
  textoDoTamanho,
  ultimoBackupDaLista,
} from '../src/backup-nuvem.js';
import { lerBackup } from '../src/backup.js';
import { criarDadosIniciais } from '../src/inicio.js';
import { ErroValidacao } from '../src/erros.js';

const AGORA = new Date('2026-10-14T15:00:00');

describe('tamanho', () => {
  it('conta bytes em UTF-8 (acento ocupa 2)', () => {
    assert.equal(tamanhoEmBytes('abc'), 3);
    assert.equal(tamanhoEmBytes('ç'), 2);
  });

  it('escreve o tamanho de um jeito legível', () => {
    assert.equal(textoDoTamanho(820), '820 bytes');
    assert.equal(textoDoTamanho(45 * 1024), '45 KB');
    assert.equal(textoDoTamanho(1.4 * 1024 * 1024), '1,4 MB');
    assert.equal(textoDoTamanho(TAMANHO_MAXIMO_PADRAO), '5,0 MB');
  });
});

describe('prepararBackupNuvem', () => {
  const dados = criarDadosIniciais('2026-10-14');

  it('monta o mesmo pacote do arquivo de backup (lerBackup lê de volta)', () => {
    const { texto, bytes } = prepararBackupNuvem(dados, { agora: AGORA });

    assert.equal(bytes, tamanhoEmBytes(texto));
    const lido = lerBackup(texto);
    assert.deepEqual(lido.dados.formasPagamento, dados.formasPagamento);
    assert.equal(lido.resumo.salvoEm, AGORA.toISOString());
  });

  it('recusa, com mensagem clara, um backup maior que o limite do servidor', () => {
    assert.throws(
      () => prepararBackupNuvem(dados, { agora: AGORA, tamanhoMaximo: 100 }),
      (erro) => erro instanceof ErroValidacao && /a nuvem aceita até 100 bytes/.test(erro.message),
    );
  });
});

describe('situação e backup automático', () => {
  it('sem nenhum backup: não é "atrasado", mas o app envia um sozinho', () => {
    const situacao = situacaoDoBackupNuvem(null, { agora: AGORA });
    assert.equal(situacao.atrasado, false);
    assert.equal(situacao.texto, 'Nenhum backup na nuvem ainda.');
    assert.equal(precisaDeBackupAutomatico(null, { agora: AGORA }), true);
  });

  it('hoje, ontem e há N dias; atrasado a partir de 7 dias', () => {
    assert.equal(situacaoDoBackupNuvem('2026-10-14T09:00:00', { agora: AGORA }).texto, 'Último backup na nuvem: hoje.');
    assert.equal(situacaoDoBackupNuvem('2026-10-13T09:00:00', { agora: AGORA }).texto, 'Último backup na nuvem: ontem.');

    const seis = situacaoDoBackupNuvem('2026-10-08T09:00:00', { agora: AGORA });
    assert.equal(seis.texto, 'Último backup na nuvem: há 6 dias.');
    assert.equal(seis.atrasado, false);
    assert.equal(precisaDeBackupAutomatico('2026-10-08T09:00:00', { agora: AGORA }), false);

    const sete = situacaoDoBackupNuvem('2026-10-07T09:00:00', { agora: AGORA });
    assert.equal(sete.dias, DIAS_PARA_BACKUP_NUVEM);
    assert.equal(sete.atrasado, true);
    assert.equal(precisaDeBackupAutomatico('2026-10-07T09:00:00', { agora: AGORA }), true);
  });

  it('o mais recente da lista é o de criadoEm maior', () => {
    assert.equal(ultimoBackupDaLista([]), null);
    assert.equal(ultimoBackupDaLista([
      { criadoEm: '2026-10-10T10:00:00Z' }, { criadoEm: '2026-10-12T10:00:00Z' }, { criadoEm: '2026-10-11T10:00:00Z' },
    ]), '2026-10-12T10:00:00Z');
  });
});

describe('descreverBackup', () => {
  it('data no fuso pedido, conteúdo no singular e no plural, e o tamanho', () => {
    const descricao = descreverBackup({
      criadoEm: '2026-10-14T23:10:00Z', tamanhoBytes: 46080,
      resumo: { meses: 1, lancamentos: 120, investimentos: 0 },
    }, { fuso: 'America/Manaus' });

    assert.equal(descricao.quando, '14/10/2026, 19:10');
    assert.equal(descricao.conteudo, '1 mês, 120 lançamentos');
    assert.equal(descricao.tamanho, '45 KB');
  });

  it('mostra os investimentos só quando houver', () => {
    const { conteudo } = descreverBackup({
      criadoEm: '2026-10-14T23:10:00Z', tamanhoBytes: 10, resumo: { meses: 3, lancamentos: 1, investimentos: 2 },
    });
    assert.equal(conteudo, '3 meses, 1 lançamento, 2 investimentos');
  });
});
