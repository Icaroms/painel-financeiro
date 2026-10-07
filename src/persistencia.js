/**
 * Formato de gravação dos dados do Painel Financeiro.
 *
 * Antes de ir para o banco do aparelho (IndexedDB), os dados são
 * "empacotados" num envelope com identificação e versão:
 *
 *   {
 *     formato: "painel-financeiro",   ← garante que o pacote é deste app
 *     versao: 1,                      ← muda quando a estrutura dos dados mudar
 *     salvoEm: "2026-11-03T13:00:00.000Z",
 *     dados: { registroMes, categorias, fixos, lancamentos, formasPagamento }
 *   }
 *
 * O mesmo envelope vai ser usado no backup (exportar e importar), então
 * um backup antigo sempre diz em qual versão foi feito. Se a estrutura
 * mudar no futuro, a conversão de uma versão para a outra entra aqui.
 *
 * Funções puras: não tocam no banco nem na tela, então são testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { ehMesValido } from './datas.js';

export const FORMATO = 'painel-financeiro';
export const VERSAO_ATUAL = 1;

/** Listas que todo pacote precisa ter. */
const LISTAS_OBRIGATORIAS = ['categorias', 'fixos', 'lancamentos', 'formasPagamento'];

/**
 * Coloca os dados no envelope de gravação.
 *
 * @param {object} dados   { registroMes, categorias, fixos, lancamentos, formasPagamento }
 * @param {object} [opcoes] { agora }
 * @returns {object} O pacote, pronto para gravar.
 */
export function empacotar(dados, { agora = new Date() } = {}) {
  return {
    formato: FORMATO,
    versao: VERSAO_ATUAL,
    salvoEm: agora.toISOString(),
    dados,
  };
}

/**
 * Confere um pacote lido do banco (ou, no futuro, de um backup) e
 * devolve os dados de dentro dele.
 *
 * Qualquer problema lança ErroValidacao com o campo "pacote" e uma
 * mensagem que diz o que está errado.
 *
 * @param {unknown} pacote
 * @returns {object} Os dados.
 */
export function desempacotar(pacote) {
  if (pacote === null || typeof pacote !== 'object') {
    throw new ErroValidacao('pacote', 'Os dados gravados estão vazios ou corrompidos.');
  }
  if (pacote.formato !== FORMATO) {
    throw new ErroValidacao('pacote', 'Estes dados não são do Painel Financeiro.');
  }
  if (!Number.isInteger(pacote.versao)) {
    throw new ErroValidacao('pacote', 'Os dados gravados não informam a versão.');
  }
  if (pacote.versao > VERSAO_ATUAL) {
    throw new ErroValidacao(
      'pacote',
      `Estes dados são de uma versão mais nova do app (versão ${pacote.versao}). Atualize a página.`,
    );
  }

  const { dados } = pacote;
  if (dados === null || typeof dados !== 'object') {
    throw new ErroValidacao('pacote', 'O pacote não tem dados dentro.');
  }

  for (const lista of LISTAS_OBRIGATORIAS) {
    if (!Array.isArray(dados[lista])) {
      throw new ErroValidacao('pacote', `Os dados gravados estão incompletos: falta a lista "${lista}".`);
    }
  }

  if (!dados.registroMes || !ehMesValido(dados.registroMes.mes)) {
    throw new ErroValidacao('pacote', 'Os dados gravados não têm um mês válido.');
  }

  // Versão 1 é a única por enquanto. Quando existir a versão 2, a conversão
  // dos pacotes de versão 1 entra aqui, antes do return.
  return dados;
}
