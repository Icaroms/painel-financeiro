/**
 * Simulador de compras (Fase 02, parte 2.5).
 *
 * Responde "posso comprar, em quantas vezes e quando?" só com as regras
 * do app, SEM GRAVAR NADA: é uma consulta.
 *
 * Entrada: o cartão, o preço à vista e as opções de parcelamento que a
 * loja oferece (número de parcelas e total parcelado de cada uma).
 *
 * Para cada opção (a primeira é sempre "à vista no cartão", 1x):
 * - Juros: total parcelado − preço à vista, e a taxa ao mês equivalente.
 *   Ex.: R$ 1.000 à vista ou 10x de R$ 115 → R$ 150 de juros, cerca de 2,6% ao mês.
 * - Peso em cada mês: a sobra prevista de cada mês com parcela, sem e com a compra.
 * - Limite do cartão: quanto sobra do limite depois da compra.
 * - Melhor momento: o primeiro mês (a partir de hoje) em que comprar não
 *   deixa nenhum mês com parcela abaixo do colchão de R$ 200, contando os
 *   parcelamentos que terminam. Ex.: "a Amazon Ferramentas termina em
 *   novembro; comprando a partir de dezembro, cabe".
 *
 * Os meses futuros são ESTIMATIVAS (src/fluxo.js, projetarMeses): renda
 * do mês atual − contas fixas − faturas já comprometidas − orçamentos das
 * categorias. O simulador mostra números; não recomenda comprar.
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/simulador.js.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, somarMeses, diasNoMes, diaDaData } from './datas.js';
import { criarLancamento, MAXIMO_PARCELAS_COMPRA } from './modelo.js';
import { LIMITES_PADRAO } from './veredito.js';
import {
  saidasDoLancamento, projetarMeses, limiteDoCartao, mesesAteAUltimaSaida,
} from './fluxo.js';
import { limiteApertado } from './painel.js';

/** Quantos meses à frente o "melhor momento" procura. */
export const MESES_DE_ESPERA_MAXIMOS = 12;

/** Quantas opções de parcelamento a tela aceita (além do à vista). */
export const MAXIMO_OPCOES = 4;

/**
 * Valor no campo categoriaId da compra simulada. Não é uma categoria de
 * verdade: a compra simulada nunca é gravada e a projeção não usa a categoria.
 */
const CATEGORIA_DA_SIMULACAO = 'simulacao';

/**
 * Taxa de juros ao mês equivalente a um parcelamento: a taxa que faz as
 * parcelas, trazidas para hoje, valerem o preço à vista (a mesma conta
 * da "taxa efetiva" das lojas; a 1ª parcela é paga um mês depois).
 *
 *   à vista = parcela × (1 − (1 + i)^−n) / i
 *
 * Resolvida por bisseção (sem fórmula fechada). Taxa é uma proporção, não
 * dinheiro: aqui o número com vírgula é aceitável; os valores em reais
 * continuam em centavos inteiros.
 *
 * @param {number} aVistaCentavos
 * @param {number} parcelas
 * @param {number} totalCentavos  Total parcelado.
 * @returns {number} Taxa ao mês (0.026 = 2,6%). Zero se não há juros.
 */
export function taxaMensalEquivalente(aVistaCentavos, parcelas, totalCentavos) {
  if (parcelas <= 1 || totalCentavos <= aVistaCentavos) return 0;

  const parcela = totalCentavos / parcelas;
  const valorHoje = (taxa) => parcela * (1 - (1 + taxa) ** -parcelas) / taxa;

  // valorHoje cai quando a taxa sobe: procura a taxa em que ele vale o preço à vista.
  let baixa = 1e-9;
  let alta = 1;
  for (let i = 0; i < 100; i += 1) {
    const meio = (baixa + alta) / 2;
    if (valorHoje(meio) > aVistaCentavos) baixa = meio;
    else alta = meio;
  }
  return (baixa + alta) / 2;
}

/**
 * Data de uma compra feita daqui a alguns meses, no mesmo dia de hoje
 * (31 vira o último dia dos meses curtos).
 */
function dataDaqui(hoje, meses) {
  const mes = somarMeses(mesDaData(hoje), meses);
  const dia = Math.min(diaDaData(hoje), diasNoMes(mes));
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

/** A compra simulada (nunca é gravada). */
function compraSimulada(cartao, totalCentavos, parcelas, data) {
  return criarLancamento({
    valorCentavos: totalCentavos,
    categoriaId: CATEGORIA_DA_SIMULACAO,
    formaPagamento: cartao.formaPagamento,
    data,
    parcelas,
  });
}

/**
 * Sobra prevista dos meses, sem e com a compra, até o mês da última parcela.
 *
 * @returns {{ meses: { mes: string, semCompraCentavos: number, comCompraCentavos: number,
 *   parcelaCentavos: number }[], piorMes: { mes: string, sobraCentavos: number } }}
 */
function pesoNosMeses(visao, compra) {
  const saidas = saidasDoLancamento(compra, visao.cartoes);
  const mesAtual = visao.registroMes.mes;
  const aFrente = mesesAteAUltimaSaida(saidas, mesAtual);

  const sem = projetarMeses(visao, aFrente);
  const com = projetarMeses({ ...visao, lancamentos: [...visao.lancamentos, compra] }, aFrente);
  const parcelaDoMes = (mes) => saidas.filter((s) => s.mes === mes).reduce((soma, s) => soma + s.valorCentavos, 0);

  const meses = sem
    .map((m, i) => ({
      mes: m.mes,
      semCompraCentavos: m.sobraCentavos,
      comCompraCentavos: com[i].sobraCentavos,
      parcelaCentavos: parcelaDoMes(m.mes),
    }))
    .filter((m) => m.parcelaCentavos > 0);

  // Pior mês entre os meses com parcela (a mesma regra do veredito).
  const pior = meses.reduce((menor, m) => (m.comCompraCentavos < menor.comCompraCentavos ? m : menor));
  return { meses, piorMes: { mes: pior.mes, sobraCentavos: pior.comCompraCentavos } };
}

/**
 * Parcelamentos que terminam entre dois meses (inclusive): contas fixas
 * parceladas (mês final) e compras parceladas no cartão (última parcela).
 * Serve para explicar o "melhor momento": são eles que abrem espaço.
 *
 * @returns {{ nome: string, mes: string }[]} Do que termina antes ao que termina depois.
 */
function parcelamentosQueTerminam(visao, de, ate) {
  const terminam = [];
  const dentro = (mes) => mes >= de && mes <= ate;
  for (const fixo of visao.fixos) {
    if (fixo.excluidoEm === null && fixo.mesFinal !== null && dentro(fixo.mesFinal)) {
      terminam.push({ nome: fixo.nome, mes: fixo.mesFinal });
    }
  }
  for (const l of visao.lancamentos) {
    if (l.excluidoEm !== null || (l.parcelas ?? 1) <= 1) continue;
    const saidas = saidasDoLancamento(l, visao.cartoes);
    const ultima = saidas[saidas.length - 1];
    if (ultima?.cartao && dentro(ultima.mes)) {
      terminam.push({ nome: l.descricao || 'Compra parcelada', mes: ultima.mes });
    }
  }
  return terminam.sort((a, b) => a.mes.localeCompare(b.mes) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Mês da 1ª parcela de uma compra feita numa data. */
function primeiraParcela(visao, cartao, totalCentavos, parcelas, data) {
  return saidasDoLancamento(compraSimulada(cartao, totalCentavos, parcelas, data), visao.cartoes)[0].mes;
}

/**
 * Melhor momento: o primeiro mês (0 = agora, até 12 meses depois) em que
 * comprar não deixa nenhum mês com parcela abaixo do colchão.
 *
 * "terminam" explica a espera: os parcelamentos que acabam entre a 1ª
 * parcela de uma compra feita AGORA e o mês antes da 1ª parcela da
 * compra no melhor momento. Ex.: comprando agora, a 1ª parcela seria em
 * novembro; no melhor momento, em janeiro → contam os que terminam em
 * novembro ou dezembro.
 *
 * @returns {{ esperaMeses: number|null, mesDaCompra: string|null, terminam: { nome: string, mes: string }[] }}
 *   esperaMeses null: não cabe nos próximos 12 meses.
 */
function melhorMomento(visao, cartao, totalCentavos, parcelas, hoje, colchaoCentavos) {
  for (let espera = 0; espera <= MESES_DE_ESPERA_MAXIMOS; espera += 1) {
    const data = dataDaqui(hoje, espera);
    const { piorMes } = pesoNosMeses(visao, compraSimulada(cartao, totalCentavos, parcelas, data));
    if (piorMes.sobraCentavos >= colchaoCentavos) {
      const terminam = espera === 0 ? [] : parcelamentosQueTerminam(
        visao,
        primeiraParcela(visao, cartao, totalCentavos, parcelas, hoje),
        somarMeses(primeiraParcela(visao, cartao, totalCentavos, parcelas, data), -1),
      );
      return { esperaMeses: espera, mesDaCompra: mesDaData(data), terminam };
    }
  }
  return { esperaMeses: null, mesDaCompra: null, terminam: [] };
}

/**
 * Simula uma opção de compra.
 *
 * @param {object} visao  Visão do mês atual (src/meses.js, dadosDoMes).
 * @param {object} entrada
 * @param {object} entrada.cartao
 * @param {number} entrada.aVistaCentavos
 * @param {number} entrada.parcelas
 * @param {number} entrada.totalCentavos
 * @param {string} entrada.hoje "AAAA-MM-DD".
 * @param {object} [limites] Padrão: LIMITES_PADRAO (colchão de R$ 200).
 * @returns {object} Veja simularCompra.
 */
export function simularOpcao(visao, { cartao, aVistaCentavos, parcelas, totalCentavos, hoje }, limites = LIMITES_PADRAO) {
  const compra = compraSimulada(cartao, totalCentavos, parcelas, hoje);
  const saidas = saidasDoLancamento(compra, visao.cartoes);
  const { meses, piorMes } = pesoNosMeses(visao, compra);

  const limite = limiteDoCartao({
    cartao, lancamentos: visao.lancamentos, registroMes: visao.registroMes,
    fixos: visao.fixos, meses: visao.meses ?? [], hoje,
  });
  const limiteDepoisCentavos = limite.disponivelCentavos - totalCentavos;

  const colchao = limites.colchaoSaldoCentavos;
  let cor = 'verde';
  if (limiteDepoisCentavos < 0 || piorMes.sobraCentavos < 0) cor = 'vermelho';
  else if (piorMes.sobraCentavos < colchao || limiteApertado(limite, totalCentavos)) cor = 'amarelo';

  return {
    parcelas,
    totalCentavos,
    // Valor das parcelas (a 1ª pode ter alguns centavos a mais: o resto da divisão).
    valorParcelaCentavos: saidas[saidas.length - 1].valorCentavos,
    primeiraParcelaCentavos: saidas[0].valorCentavos,
    primeiroVencimento: saidas[0].vencimento,
    jurosCentavos: totalCentavos - aVistaCentavos,
    taxaMensal: taxaMensalEquivalente(aVistaCentavos, parcelas, totalCentavos),
    limite: {
      limiteCentavos: limite.limiteCentavos,
      disponivelAntesCentavos: limite.disponivelCentavos,
      disponivelDepoisCentavos: limiteDepoisCentavos,
    },
    meses,
    piorMes,
    estimativa: piorMes.mes !== visao.registroMes.mes,
    cor,
    melhorMomento: melhorMomento(visao, cartao, totalCentavos, parcelas, hoje, colchao),
  };
}

/**
 * Simula a compra em todas as opções: à vista no cartão (1x, preço à
 * vista) e cada opção de parcelamento.
 *
 * @param {object} visao  Visão do mês atual (dadosDoMes), com os cartões.
 * @param {object} entrada
 * @param {string} entrada.formaPagamento O cartão.
 * @param {number} entrada.aVistaCentavos Maior que zero.
 * @param {{ parcelas: number, totalCentavos: number }[]} entrada.opcoes
 *   Parcelas de 2 a 24; total maior que zero (vazio na tela = igual ao à vista, sem juros).
 * @param {string} entrada.hoje "AAAA-MM-DD".
 * @param {object} [limites]
 * @returns {{ opcoes: object[] }} A primeira é sempre o à vista (parcelas 1).
 * @throws {ErroValidacao} Entrada inválida (mensagem para a tela).
 */
export function simularCompra(visao, { formaPagamento, aVistaCentavos, opcoes = [], hoje }, limites = LIMITES_PADRAO) {
  const cartao = (visao.cartoes ?? []).find((c) => c.formaPagamento === formaPagamento);
  if (!cartao) {
    throw new ErroValidacao('formaPagamento', 'Escolha um cartão cadastrado.');
  }
  if (!Number.isSafeInteger(aVistaCentavos) || aVistaCentavos <= 0) {
    throw new ErroValidacao('aVistaCentavos', 'Digite o preço à vista.');
  }
  if (opcoes.length > MAXIMO_OPCOES) {
    throw new ErroValidacao('opcoes', `Compare até ${MAXIMO_OPCOES} opções de parcelamento.`);
  }
  for (const opcao of opcoes) {
    if (!Number.isInteger(opcao.parcelas) || opcao.parcelas < 2 || opcao.parcelas > MAXIMO_PARCELAS_COMPRA) {
      throw new ErroValidacao('parcelas', `O parcelamento deve ser de 2 a ${MAXIMO_PARCELAS_COMPRA} vezes.`);
    }
    if (!Number.isSafeInteger(opcao.totalCentavos) || opcao.totalCentavos <= 0) {
      throw new ErroValidacao('totalCentavos', 'O total parcelado deve ser maior que zero.');
    }
  }

  const todas = [{ parcelas: 1, totalCentavos: aVistaCentavos }, ...opcoes];
  return {
    opcoes: todas.map((opcao) => simularOpcao(visao, { cartao, aVistaCentavos, hoje, ...opcao }, limites)),
  };
}
