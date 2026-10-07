/**
 * Backup do Painel Financeiro: exportar os dados para um arquivo e
 * importar de volta.
 *
 * Os dados só existem no aparelho. Se o navegador for limpo, o app
 * apagado ou o aparelho trocado, o backup é a única cópia.
 *
 * O arquivo é o mesmo envelope usado na gravação (src/persistencia.js),
 * em texto JSON legível. Assim, um backup sempre diz de qual app ele é
 * e em que versão foi feito.
 *
 * O nome começa com "backup-" de propósito: o .gitignore do projeto
 * ignora arquivos com esse começo, então um backup salvo sem querer
 * dentro da pasta do projeto nunca vai parar no GitHub.
 *
 * Funções puras: a parte de baixar e escolher arquivos fica em src/ui/arquivos.js.
 */

import { ErroValidacao } from './erros.js';
import { hojeLocal, mesDaData } from './datas.js';
import { empacotar, desempacotar } from './persistencia.js';
import { tituloDoMes } from './painel.js';

/**
 * Nome do arquivo de backup: "backup-painel-financeiro-2026-11-03.json".
 *
 * @param {Date} [agora]
 * @returns {string}
 */
export function nomeDoArquivoBackup(agora = new Date()) {
  return `backup-painel-financeiro-${hojeLocal(agora)}.json`;
}

/**
 * Gera o conteúdo do arquivo de backup.
 *
 * @param {object} dados
 * @param {object} [opcoes] { agora }
 * @returns {string} Texto JSON, com recuo de 2 espaços para ficar legível.
 */
export function gerarBackup(dados, { agora = new Date() } = {}) {
  return JSON.stringify(empacotar(dados, { agora }), null, 2);
}

/**
 * Lê e confere o conteúdo de um arquivo de backup.
 *
 * Qualquer problema lança ErroValidacao com o campo "backup" e uma
 * mensagem pronta para mostrar na tela.
 *
 * @param {string} texto  Conteúdo do arquivo.
 * @param {object} opcoes
 * @param {string} opcoes.hoje "AAAA-MM-DD" (para conferir o mês do backup).
 * @returns {{ dados: object, resumo: { mes: string, salvoEm: string, lancamentos: number } }}
 */
export function lerBackup(texto, { hoje }) {
  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new ErroValidacao('backup', 'O arquivo está vazio.');
  }

  let pacote;
  try {
    pacote = JSON.parse(texto);
  } catch {
    throw new ErroValidacao('backup', 'Este arquivo não é um backup do Painel Financeiro.');
  }

  let dados;
  try {
    dados = desempacotar(pacote);
  } catch (erro) {
    if (erro instanceof ErroValidacao) {
      throw new ErroValidacao('backup', erro.message);
    }
    throw erro;
  }

  // Provisório: enquanto o app trabalha com um mês só, um backup de outro
  // mês não pode ser usado. A virada de mês entra na configuração do mês.
  const mesAtual = mesDaData(hoje);
  if (dados.registroMes.mes !== mesAtual) {
    throw new ErroValidacao(
      'backup',
      `Este backup é de ${tituloDoMes(dados.registroMes.mes)}. ` +
        `Por enquanto, o app só trabalha com o mês atual (${tituloDoMes(mesAtual)}).`,
    );
  }

  return {
    dados,
    resumo: {
      mes: dados.registroMes.mes,
      salvoEm: pacote.salvoEm,
      lancamentos: dados.lancamentos.filter((l) => l.excluidoEm === null).length,
    },
  };
}
