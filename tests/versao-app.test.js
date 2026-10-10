/**
 * Testes da versão do app e do aviso de "cópia guardada".
 * Rodar com: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  VERSAO_APP, INTERVALO_VERIFICAR_VERSAO_MS, MOTIVOS_DA_COPIA,
  numeroDaVersao, textoDoAvisoDaCopia, haVersaoNova, textoDaVersaoNova, deveVerificarVersao,
  RESULTADOS_DA_PROCURA, textoDaProcura,
} from '../src/versao-app.js';

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

describe('VERSAO_APP', () => {
  it('no formato "painel-financeiro-vN" (a mesma do sw.js: ver tests/pwa.test.js)', () => {
    assert.match(VERSAO_APP, /^painel-financeiro-v\d+$/);
  });
});

describe('haVersaoNova', () => {
  it('service worker com versão maior: há versão nova', () => {
    assert.equal(haVersaoNova('painel-financeiro-v16', 'painel-financeiro-v15'), true);
    assert.equal(haVersaoNova('painel-financeiro-v100', 'painel-financeiro-v99'), true); // número, não texto
  });

  it('mesma versão ou menor (o service worker novo ainda vai chegar): nada a avisar', () => {
    assert.equal(haVersaoNova('painel-financeiro-v15', 'painel-financeiro-v15'), false);
    assert.equal(haVersaoNova('painel-financeiro-v14', 'painel-financeiro-v15'), false);
  });

  it('texto fora do formato: nada a avisar', () => {
    assert.equal(haVersaoNova('teste', 'painel-financeiro-v15'), false);
    assert.equal(haVersaoNova(undefined, 'painel-financeiro-v15'), false);
  });

  it('sem a versão da página, compara com a VERSAO_APP', () => {
    const seguinte = `painel-financeiro-v${Number(/v(\d+)$/.exec(VERSAO_APP)[1]) + 1}`;
    assert.equal(haVersaoNova(seguinte), true);
    assert.equal(haVersaoNova(VERSAO_APP), false);
  });
});

describe('textoDaVersaoNova', () => {
  it('diz a versão, o botão e que os dados continuam', () => {
    assert.equal(
      textoDaVersaoNova('painel-financeiro-v16'),
      'Há uma versão nova do app (v16). Toque em Atualizar quando terminar o que está fazendo: os seus dados continuam aqui.',
    );
  });
});

describe('deveVerificarVersao', () => {
  it('só depois de 30 minutos da última pergunta', () => {
    assert.equal(INTERVALO_VERIFICAR_VERSAO_MS, 30 * 60 * 1000);
    const ultima = 1_000_000;
    assert.equal(deveVerificarVersao(ultima + INTERVALO_VERIFICAR_VERSAO_MS - 1, ultima), false);
    assert.equal(deveVerificarVersao(ultima + INTERVALO_VERIFICAR_VERSAO_MS, ultima), true);
  });
});

describe('textoDaProcura (botão "Procurar atualização")', () => {
  it('um texto claro para cada resultado', () => {
    assert.equal(textoDaProcura(RESULTADOS_DA_PROCURA.ultima, 'painel-financeiro-v16'), 'Você já está na última versão (v16).');
    assert.equal(textoDaProcura(RESULTADOS_DA_PROCURA.nova), 'Há uma versão nova: toque em Atualizar, no topo da tela.');
    assert.match(textoDaProcura(RESULTADOS_DA_PROCURA.instalando), /^Versão nova encontrada\. Em instantes aparece o botão Atualizar/);
    assert.match(textoDaProcura(RESULTADOS_DA_PROCURA.erro), /sem internet ou servidor fora do ar/);
    assert.match(textoDaProcura(RESULTADOS_DA_PROCURA.semSuporte), /recarregue a página/);
  });

  it('sem a versão, usa a VERSAO_APP', () => {
    assert.equal(textoDaProcura(RESULTADOS_DA_PROCURA.ultima), `Você já está na última versão (${numeroDaVersao(VERSAO_APP)}).`);
  });
});
