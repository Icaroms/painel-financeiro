/**
 * IA comenta o Radar com a carteira (Fase 04, parte 4.3d).
 *
 * O botão "Comentar esta lista com IA" (aba Investir) envia ao Gemini:
 * - a lista de ações ou FIIs que a pessoa está vendo, com os filtros
 *   (até 10 itens, com os números do radar e a fonte/data);
 * - um resumo da carteira: total e porcentagem de cada grupo, as maiores
 *   posições, a reserva de emergência perto da meta e a parte "Investir"
 *   da sobra deste mês.
 *
 * Regras (decisão de 10/10/2026): a IA explica e relaciona com a carteira,
 * mas não dá ordem de compra ou venda e não prevê preço. Vão só números e
 * nomes (de investimentos, códigos da bolsa e grupos), nunca nome, e-mail ou
 * senhas da pessoa.
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/radar.js.
 */

import { formatarCentavos } from './dinheiro.js';
import { mesDaData } from './datas.js';
import { resumoDaCarteira, tipoDoInvestimento } from './carteira.js';
import { situacaoDaReserva, dividirSobra } from './destino.js';
import {
  LISTAS_DO_MERCADO, PERIODOS, textoDaVariacao, textoDoVolume, textoDosDividendos, textoDoPvp, textoDoMes,
} from './radar.js';

/** Quantos itens da lista vão para a IA. */
export const ITENS_PARA_IA = 10;

/** O papel da IA e o formato da resposta. */
export const INSTRUCOES_RADAR = [
  'Você é o assistente do Painel Financeiro, um app pessoal de finanças usado no Brasil.',
  'A pessoa está olhando uma lista de opções do mercado (ações ou fundos imobiliários) montada pelo app com dados públicos da B3 e da CVM.',
  'A sua tarefa é COMENTAR essa lista em português do Brasil, relacionando com a carteira da pessoa.',
  'Regras:',
  '1. Use apenas os números fornecidos. Não invente valores, notícias ou motivos para as altas e baixas.',
  '2. Não diga para comprar, vender ou investir em nenhum ativo. Não preveja preço nem dividendos futuros.',
  '3. Explique o que os números mostram e os riscos: alta forte pode ser volátil; queda forte pode ter motivo; dividendo alto pode não se repetir; P/VP abaixo de 1 pode ter motivo.',
  '4. Relacione com a carteira: concentração em um grupo ou ativo, reserva de emergência abaixo da meta (que vem antes de risco), e o valor da parte "Investir" do mês.',
  '5. Lembre que rendimento passado não garante rendimento futuro.',
  '6. Seja breve: no máximo 200 palavras, tom direto e gentil, sem emojis.',
  'Formato da resposta (use exatamente estes títulos, nesta ordem):',
  '## O que a lista mostra',
  '(2 ou 3 frases)',
  '## Com a sua carteira',
  '(2 ou 3 frases)',
  '## Antes de decidir',
  '(até 3 itens começando com "- ": o que conferir antes de qualquer decisão)',
  'Pode usar **negrito** em poucas palavras. Não use tabelas, links nem outros títulos.',
].join('\n');

/** "R$ 1.234,56" sem o espaço especial do Intl. */
const reais = (centavos) => formatarCentavos(centavos).replace(/ /g, ' ');

/** Junta as linhas e troca espaços especiais. */
const texto = (linhas) => linhas.join('\n').replace(/ /g, ' ');

/** "2026-10-09" → "09/10/2026". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/** Porcentagem inteira de uma parte. */
const parte = (valor, total) => (total > 0 ? `${Math.round((valor / total) * 100)}%` : '0%');

/**
 * Descreve a lista que a pessoa está vendo.
 *
 * @param {object} radar
 * @param {object} visao
 * @param {'acao'|'fii'} visao.tipo
 * @param {string} visao.lista 'altas' | 'baixas' | 'negociados' | 'dividendos'.
 * @param {string} visao.periodo 'semana' | 'mes' | 'ano'.
 * @param {number|null} visao.precoMaximoCentavos
 * @param {object[]} visao.itens Os itens da lista, na ordem da tela.
 * @returns {string[]} Linhas.
 */
function linhasDaLista(radar, { tipo, lista, periodo, precoMaximoCentavos, itens }) {
  const nomeLista = LISTAS_DO_MERCADO.find((l) => l.id === lista)?.nome ?? lista;
  const tipoTexto = tipo === 'fii' ? 'fundos imobiliários (FIIs)' : 'ações';
  const periodoInfo = PERIODOS.find((p) => p.id === periodo);
  const unidade = tipo === 'fii' ? 'cota' : 'ação';
  const linhas = [];

  if (lista === 'dividendos') {
    const ate = radar.fiis?.mesReferencia ? ` até ${textoDoMes(radar.fiis.mesReferencia)}` : '';
    linhas.push(`Lista: FIIs com maiores dividendos em 12 meses (informados pelos fundos à CVM${ate}; preços da B3 de ${dataLonga(radar.fiis.dataBase)}).`);
  } else {
    const quando = lista === 'negociados' ? 'volume negociado no dia' : `variação de preço ${periodoInfo?.texto ?? ''}`.trim();
    linhas.push(`Lista: ${nomeLista} de ${tipoTexto} (${quando}; dados da B3 de ${dataLonga(radar.mercado.dataBase)}).`);
    linhas.push('A variação é só do preço: não inclui dividendos e não é ajustada por desdobramentos.');
  }
  if (precoMaximoCentavos !== null) linhas.push(`Filtro: só ${unidade === 'cota' ? 'cotas' : 'ações'} de até ${reais(precoMaximoCentavos)} por unidade.`);

  if (itens.length === 0) {
    linhas.push('A lista está vazia com esses filtros.');
    return linhas;
  }
  for (const item of itens.slice(0, ITENS_PARA_IA)) {
    if (lista === 'dividendos') {
      linhas.push(`- ${item.codigo} (${item.nome}): ${reais(item.precoCentavos)} por cota; dividendos em 12 meses ${textoDosDividendos(item.dividendos12m)}; ${textoDoPvp(item.pvp)}.`);
    } else {
      const v = item.variacoes;
      linhas.push(`- ${item.codigo} (${item.nome}): ${reais(item.precoCentavos)} por ${unidade}; ` +
        `semana ${textoDaVariacao(v.semana)}, mês ${textoDaVariacao(v.mes)}, 12 meses ${textoDaVariacao(v.ano)}; ` +
        `${textoDoVolume(item.volumeCentavos)} negociados no dia.`);
    }
  }
  return linhas;
}

/** Descreve a carteira da pessoa, a reserva e a parte Investir do mês. */
function linhasDaCarteira(estado, hoje) {
  const r = resumoDaCarteira(estado);
  const linhas = ['Carteira da pessoa:'];
  if (r.itens.length === 0) {
    linhas.push('- Nenhum investimento cadastrado no app.');
  } else {
    linhas.push(`- Total: ${reais(r.atualCentavos)} (aplicado ${reais(r.aplicadoCentavos)}).`);
    for (const g of r.grupos) linhas.push(`- ${g.nome}: ${reais(g.atualCentavos)} (${parte(g.atualCentavos, r.atualCentavos)} da carteira).`);
    const maiores = r.itens.filter((i) => !i.encerrado).slice(0, 5);
    linhas.push(`- Maiores posições: ${maiores.map((i) => `${i.investimento.nome} (${tipoDoInvestimento(i.investimento.tipo)?.nome ?? i.investimento.tipo}, ${parte(i.atualCentavos, r.atualCentavos)})`).join('; ')}.`);
  }

  const mes = mesDaData(hoje);
  const reserva = situacaoDaReserva(estado, mes);
  linhas.push(reserva.metaCentavos === 0
    ? '- Reserva de emergência: meta ainda não calculada.'
    : `- Reserva de emergência: ${reais(reserva.reservaAtualCentavos)} de ${reais(reserva.metaCentavos)} (${Math.floor(reserva.fracao * 100)}% da meta de ${reserva.metaMeses} meses de custo).`);
  linhas.push(`- Parte "Investir" da sobra deste mês: ${reais(dividirSobra(estado, mes, hoje).investirCentavos)}.`);
  return linhas;
}

/**
 * Monta a mensagem para a IA comentar a lista com a carteira.
 *
 * @param {object} radar
 * @param {object} visao Ver linhasDaLista.
 * @param {object} estado Dados do app.
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ instrucoes: string, conteudo: string }}
 */
export function mensagemDoRadar(radar, visao, estado, hoje) {
  return {
    instrucoes: INSTRUCOES_RADAR,
    conteudo: texto([
      ...linhasDaLista(radar, visao),
      '',
      ...linhasDaCarteira(estado, hoje),
      '',
      'Comente esta lista para a pessoa.',
    ]),
  };
}
