/**
 * Testes da versão do app e do aviso de "cópia guardada".
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MOTIVOS_DA_COPIA, numeroDaVersao, textoDoAvisoDaCopia } from '../src/versao-app.js';

describe('numeroDaVersao', () => {
  it('"painel-financeiro-v14" vira "v14"', () => {
    assert.equal(numeroDaVersao('painel-financeiro-v14'), 'v14');
  });

  it('texto em outro formato volta como veio; nada vira texto vazio', () => {
    assert.equal(numeroDaVersao('teste'), 'teste');
    assert.equal(numeroDaVersao(undefined), '');
  });
});

describe('textoDoAvisoDaCopia', () => {
  it('servidor com erro: diz que o servidor está fora do ar, a versão e que os dados continuam', () => {
    const texto = textoDoAvisoDaCopia(MOTIVOS_DA_COPIA.servidorComErro, 'painel-financeiro-v14');
    assert.match(texto, /^O servidor do app está fora do ar agora\./);
    assert.match(texto, /cópia guardada neste aparelho \(v14\)/);
    assert.match(texto, /os seus dados continuam aqui/);
    assert.match(texto, /Novidades publicadas só chegam quando o servidor voltar\.$/);
  });

  it('sem internet: diz que a IA precisa de internet', () => {
    const texto = textoDoAvisoDaCopia(MOTIVOS_DA_COPIA.semInternet, 'painel-financeiro-v14');
    assert.match(texto, /^Sem internet \(ou internet lenta\): o app abriu com a cópia guardada neste aparelho \(v14\)\./);
    assert.match(texto, /menos o que precisa de internet, como a IA\.$/);
  });

  it('abriu pela internet (ou motivo desconhecido): nada a avisar', () => {
    assert.equal(textoDoAvisoDaCopia(null, 'painel-financeiro-v14'), null);
    assert.equal(textoDoAvisoDaCopia(undefined, 'painel-financeiro-v14'), null);
    assert.equal(textoDoAvisoDaCopia('outro', 'painel-financeiro-v14'), null);
  });

  it('os motivos são os mesmos textos que o sw.js usa', () => {
    assert.deepEqual(Object.values(MOTIVOS_DA_COPIA), ['servidor-com-erro', 'sem-internet']);
  });
});
