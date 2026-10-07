/**
 * Testes do backup (exportar e importar).
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { nomeDoArquivoBackup, gerarBackup, lerBackup } from '../src/backup.js';
import { criarDadosDeExemplo } from '../src/dados-exemplo.js';
import { excluirRegistro } from '../src/modelo.js';

const HOJE = '2026-11-03';
const AGORA = new Date('2026-11-03T13:00:00.000Z');
const ERRO_BACKUP = { name: 'ErroValidacao', campo: 'backup' };

describe('nomeDoArquivoBackup', () => {
  it('usa a data local e começa com "backup-" (ignorado pelo .gitignore)', () => {
    const nome = nomeDoArquivoBackup(new Date(2026, 10, 3, 23, 30)); // 3 de novembro, 23:30 local
    assert.equal(nome, 'backup-painel-financeiro-2026-11-03.json');
  });
});

describe('gerarBackup', () => {
  it('gera JSON legível com o envelope completo', () => {
    const texto = gerarBackup(criarDadosDeExemplo(HOJE), { agora: AGORA });
    const pacote = JSON.parse(texto);

    assert.equal(pacote.formato, 'painel-financeiro');
    assert.equal(pacote.versao, 2);
    assert.equal(pacote.salvoEm, '2026-11-03T13:00:00.000Z');
    assert.match(texto, /\n  "formato"/); // recuo de 2 espaços
  });
});

describe('lerBackup', () => {
  it('devolve os mesmos dados que foram exportados', () => {
    const dados = criarDadosDeExemplo(HOJE);
    const { dados: lidos } = lerBackup(gerarBackup(dados));
    assert.deepEqual(lidos, dados);
  });

  it('monta um resumo para a confirmação', () => {
    const dados = criarDadosDeExemplo(HOJE);
    const { resumo } = lerBackup(gerarBackup(dados, { agora: AGORA }));

    assert.equal(resumo.salvoEm, '2026-11-03T13:00:00.000Z');
    assert.equal(resumo.meses, 1);
    assert.equal(resumo.mesMaisRecente, '2026-11');
    assert.equal(resumo.lancamentos, 4);
  });

  it('não conta lançamentos excluídos no resumo', () => {
    const exemplo = criarDadosDeExemplo(HOJE);
    const dados = {
      ...exemplo,
      lancamentos: [excluirRegistro(exemplo.lancamentos[0]), ...exemplo.lancamentos.slice(1)],
    };
    assert.equal(lerBackup(gerarBackup(dados)).resumo.lancamentos, 3);
  });

  it('rejeita arquivo vazio', () => {
    assert.throws(() => lerBackup(''), ERRO_BACKUP);
    assert.throws(() => lerBackup('   '), ERRO_BACKUP);
  });

  it('rejeita arquivo que não é JSON', () => {
    assert.throws(() => lerBackup('isto não é json'), ERRO_BACKUP);
  });

  it('rejeita JSON de outro app, com a mensagem do envelope', () => {
    const texto = JSON.stringify({ formato: 'outro-app', versao: 1, dados: {} });
    assert.throws(() => lerBackup(texto), {
      ...ERRO_BACKUP,
      message: 'Estes dados não são do Painel Financeiro.',
    });
  });

  it('aceita backup de outro mês (agora o app guarda vários meses)', () => {
    const dados = criarDadosDeExemplo('2026-10-15');
    const { resumo } = lerBackup(gerarBackup(dados));
    assert.equal(resumo.mesMaisRecente, '2026-10');
  });

  it('converte backup antigo, da versão 1', () => {
    const { meses, ...resto } = criarDadosDeExemplo('2026-10-15');
    const texto = JSON.stringify({
      formato: 'painel-financeiro',
      versao: 1,
      salvoEm: '2026-10-15T12:00:00.000Z',
      dados: { ...resto, registroMes: meses[0] },
    });
    const { dados, resumo } = lerBackup(texto);
    assert.equal(dados.meses.length, 1);
    assert.equal(resumo.mesMaisRecente, '2026-10');
  });
});
