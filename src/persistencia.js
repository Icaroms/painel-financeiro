/**
 * Formato de gravação dos dados do Painel Financeiro.
 *
 * Antes de ir para o banco do aparelho (IndexedDB) ou para um arquivo de
 * backup, os dados são "empacotados" num envelope com identificação e versão:
 *
 *   {
 *     formato: "painel-financeiro",   ← garante que o pacote é deste app
 *     versao: 3,                      ← muda quando a estrutura dos dados mudar
 *     salvoEm: "2026-11-03T13:00:00.000Z",
 *     dados: { meses, categorias, fixos, lancamentos, formasPagamento, cartoes }
 *   }
 *
 * Histórico das versões:
 * - Versão 1: um mês só, em "registroMes".
 * - Versão 2: vários meses, em "meses"; cada mês ganhou "rendaPrevistaCentavos"
 *   e "saldoConfirmado".
 * - Versão 3: cartões de crédito, em "cartoes" (Fase 02).
 *
 * Pacotes antigos são CONVERTIDOS para a versão atual ao serem lidos,
 * uma versão de cada vez (migrarDaVersao1, depois migrarDaVersao2). Assim, dados gravados e backups feitos antes
 * de uma mudança continuam funcionando.
 *
 * Funções puras: não tocam no banco nem na tela, então são testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { ehMesValido } from './datas.js';

export const FORMATO = 'painel-financeiro';
export const VERSAO_ATUAL = 3;

/** Listas que todo pacote precisa ter (na versão atual). */
const LISTAS_OBRIGATORIAS = ['meses', 'categorias', 'fixos', 'lancamentos', 'formasPagamento', 'cartoes'];

/**
 * Converte os dados da versão 1 (um mês só) para a versão 2 (vários meses).
 *
 * - "registroMes" vira o único item da lista "meses";
 * - o mês ganha renda prevista 0 (a versão 1 não tinha renda);
 * - o saldo inicial fica como confirmado: na versão 1 ele foi digitado, não sugerido.
 *
 * @param {object} dadosV1
 * @returns {object} Dados na versão 2.
 */
export function migrarDaVersao1(dadosV1) {
  if (!dadosV1.registroMes || !ehMesValido(dadosV1.registroMes.mes)) {
    throw new ErroValidacao('pacote', 'Os dados gravados não têm um mês válido.');
  }

  const { registroMes, ...resto } = dadosV1;
  return {
    ...resto,
    meses: [{ ...registroMes, rendaPrevistaCentavos: 0, saldoConfirmado: true }],
  };
}

/**
 * Converte os dados da versão 2 para a versão 3: acrescenta a lista de
 * cartões, vazia. Nenhuma forma de pagamento vira cartão sozinha: o
 * cadastro do cartão (limite, fechamento, vencimento) é feito em Configurar.
 *
 * @param {object} dadosV2
 * @returns {object} Dados na versão 3.
 */
export function migrarDaVersao2(dadosV2) {
  return { ...dadosV2, cartoes: [] };
}

/**
 * Coloca os dados no envelope de gravação.
 *
 * @param {object} dados   { meses, categorias, fixos, lancamentos, formasPagamento }
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
 * Confere um pacote lido do banco ou de um backup e devolve os dados
 * de dentro dele, já convertidos para a versão atual.
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

  let { dados } = pacote;
  if (dados === null || typeof dados !== 'object') {
    throw new ErroValidacao('pacote', 'O pacote não tem dados dentro.');
  }

  // Conversões de versões antigas, uma de cada vez, até a versão atual.
  if (pacote.versao === 1) {
    dados = migrarDaVersao1(dados);
  }
  if (pacote.versao <= 2) {
    dados = migrarDaVersao2(dados);
  }

  for (const lista of LISTAS_OBRIGATORIAS) {
    if (!Array.isArray(dados[lista])) {
      throw new ErroValidacao('pacote', `Os dados gravados estão incompletos: falta a lista "${lista}".`);
    }
  }

  if (dados.meses.length === 0) {
    throw new ErroValidacao('pacote', 'Os dados gravados não têm nenhum mês.');
  }
  if (!dados.meses.every((m) => m && ehMesValido(m.mes))) {
    throw new ErroValidacao('pacote', 'Os dados gravados têm um mês inválido.');
  }

  return dados;
}
