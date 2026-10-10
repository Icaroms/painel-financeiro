/**
 * Veredito do Painel Financeiro: julga um gasto no momento do lançamento.
 *
 * As regras CALCULAM; nada aqui é estimado. São três medidas:
 *
 * 1. Margem da categoria: orçamento da categoria menos o que já foi
 *    gasto nela no mês, contando este gasto.
 * 2. Ritmo: a parte do orçamento já usada comparada à parte do mês que
 *    já passou. "70% usado no dia 10 (33% do mês)" = 37 pontos à frente.
 * 3. Saldo projetado: quanto deve sobrar no fim do mês. É o saldo
 *    inicial MAIS a renda prevista, menos todos os fixos do mês, menos
 *    todos os lançamentos do mês, menos este gasto. (É o mesmo que "saldo atual menos fixos
 *    a vencer menos este gasto", só que sem depender de quais fixos
 *    já venceram.)
 *
 * Cores, em ordem de prioridade (a primeira que se aplicar vence):
 * - vermelho: saldo projetado negativo (vale para qualquer categoria)
 * - vermelho: a categoria passa do orçamento
 * - amarelo:  ritmo mais de 15 pontos à frente do mês
 * - amarelo:  saldo projetado abaixo do colchão de R$ 200
 * - verde:    nenhuma das anteriores
 *
 * Categorias com orçamento zero não têm margem nem ritmo:
 * para elas, só valem as regras de saldo.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, diaDaData, diasNoMes, tituloDoMes } from './datas.js';
import { formatarCentavos } from './dinheiro.js';
import { fixoAtivoNoMes, valorDoFixoNoMes } from './modelo.js';
import { saidasDoLancamento, saidasNoMes, projetarMeses, mesesAteAUltimaSaida } from './fluxo.js';

/**
 * Limites escolhidos para o MVP. Ficam num objeto só para poderem
 * ser trocados depois (e nos testes) sem mexer nas regras.
 */
export const LIMITES_PADRAO = Object.freeze({
  toleranciaRitmoPontos: 15,  // amarelo com MAIS de 15 pontos à frente
  colchaoSaldoCentavos: 20000, // amarelo com saldo projetado ABAIXO de R$ 200,00
});

/* ------------------------------------------------------------------ */
/* As três regras (funções puras: mesma entrada, mesma saída)         */
/* ------------------------------------------------------------------ */

/**
 * Regra 1: margem da categoria, já contando o novo gasto.
 *
 * @param {object}   categoria
 * @param {object[]} lancamentosDoMes Lançamentos válidos do mês (sem o novo).
 * @param {number}   novoValorCentavos
 * @returns {{ gastoAntesCentavos: number, gastoDepoisCentavos: number, margemCentavos: number }}
 */
export function calcularMargemCategoria(categoria, lancamentosDoMes, novoValorCentavos) {
  const gastoAntesCentavos = lancamentosDoMes
    .filter((l) => l.categoriaId === categoria.id)
    .reduce((soma, l) => soma + l.valorCentavos, 0);

  const gastoDepoisCentavos = gastoAntesCentavos + novoValorCentavos;

  return {
    gastoAntesCentavos,
    gastoDepoisCentavos,
    margemCentavos: categoria.orcamentoCentavos - gastoDepoisCentavos,
  };
}

/**
 * Regra 2: ritmo de uso do orçamento.
 *
 * Mede em PONTOS PERCENTUAIS de diferença (e não em proporção) para
 * não disparar alarme falso no começo do mês.
 *
 * A decisão "acelerado ou não" é feita só com números inteiros, para
 * um caso exatamente no limite (15 pontos) nunca virar 15,0000001 por
 * erro de casa decimal. Os percentuais com decimais servem só para exibir.
 *
 * Conta usada: (gasto / orçamento) − (dia / diasDoMês) > tolerância / 100
 * Multiplicando tudo por 100 × orçamento × diasDoMês, fica só com inteiros:
 *   100 × gasto × diasDoMês − 100 × dia × orçamento > tolerância × orçamento × diasDoMês
 *
 * @param {number} orcamentoCentavos     Maior que zero.
 * @param {number} gastoDepoisCentavos   Gasto da categoria contando o novo.
 * @param {string} data                  "AAAA-MM-DD" do gasto.
 * @param {number} toleranciaPontos      Pontos à frente permitidos (inteiro).
 * @returns {{ percentualUsado: number, percentualDoMes: number, pontosAFrente: number, acelerado: boolean }}
 */
export function calcularRitmo(orcamentoCentavos, gastoDepoisCentavos, data, toleranciaPontos) {
  const dia = diaDaData(data);
  const dias = diasNoMes(mesDaData(data));

  const percentualUsado = (gastoDepoisCentavos / orcamentoCentavos) * 100;
  const percentualDoMes = (dia / dias) * 100;

  const acelerado =
    100 * gastoDepoisCentavos * dias - 100 * dia * orcamentoCentavos >
    toleranciaPontos * orcamentoCentavos * dias;

  return {
    percentualUsado,
    percentualDoMes,
    pontosAFrente: percentualUsado - percentualDoMes,
    acelerado,
  };
}

/**
 * Regra 3: saldo projetado para o fim do mês, já contando o novo gasto.
 *
 * saldo projetado = saldo inicial + renda prevista − fixos − lançamentos − novo gasto
 *
 * @param {object}   registroMes      Mês (saldo inicial, renda prevista e ajustes).
 * @param {object[]} fixos            Todos os fixos cadastrados.
 * @param {object[]} lancamentosDoMes Lançamentos válidos do mês (sem o novo).
 * @param {number}   novoValorCentavos
 * @returns {{ rendaPrevistaCentavos: number, totalFixosCentavos: number, totalLancamentosCentavos: number, saldoProjetadoCentavos: number }}
 */
export function calcularSaldoProjetado(registroMes, fixos, lancamentosDoMes, novoValorCentavos) {
  const rendaPrevistaCentavos = registroMes.rendaPrevistaCentavos;

  const totalFixosCentavos = fixos
    .filter((f) => fixoAtivoNoMes(f, registroMes.mes))
    .reduce((soma, f) => soma + valorDoFixoNoMes(f, registroMes), 0);

  const totalLancamentosCentavos = lancamentosDoMes
    .reduce((soma, l) => soma + l.valorCentavos, 0);

  return {
    rendaPrevistaCentavos,
    totalFixosCentavos,
    totalLancamentosCentavos,
    saldoProjetadoCentavos:
      registroMes.saldoInicialCentavos +
      rendaPrevistaCentavos -
      totalFixosCentavos -
      totalLancamentosCentavos -
      novoValorCentavos,
  };
}

/**
 * Lançamentos que contam num mês: não excluídos e com data naquele mês.
 *
 * @param {object[]} lancamentos
 * @param {string}   mes "AAAA-MM".
 * @returns {object[]}
 */
export function lancamentosValidosDoMes(lancamentos, mes) {
  return lancamentos.filter((l) => l.excluidoEm === null && mesDaData(l.data) === mes);
}

/* ------------------------------------------------------------------ */
/* Veredito                                                           */
/* ------------------------------------------------------------------ */

/**
 * Julga um gasto novo.
 *
 * - O ORÇAMENTO e o RITMO da categoria olham o mês da compra, com o valor inteiro.
 * - O SALDO olha o mês em que o dinheiro sai: à vista, o mês atual; no
 *   cartão, o mês de cada fatura com parcela da compra. Para uma compra no
 *   cartão, vale o pior desses meses (projeção em src/fluxo.js).
 *
 * @param {object}   contexto
 * @param {object}   contexto.lancamento  O gasto novo (criado por criarLancamento).
 * @param {object}   contexto.categoria   A categoria do gasto.
 * @param {object}   contexto.registroMes O mês do gasto (criado por criarMes).
 * @param {object[]} contexto.fixos       Todos os fixos.
 * @param {object[]} contexto.lancamentos Lançamentos já registrados. Os excluídos,
 *                                        os de outros meses e o próprio gasto novo
 *                                        (se estiver na lista) são ignorados.
 * @param {object[]} [contexto.cartoes]   Cartões cadastrados. Sem eles, tudo é à vista.
 * @param {object[]} [contexto.categorias] Todas as categorias (para estimar os meses seguintes).
 * @param {string}   [contexto.hoje]      "AAAA-MM-DD" usado no ritmo. Padrão: a data do gasto.
 * @param {object}   [limites]            Padrão: LIMITES_PADRAO.
 * @returns {{
 *   cor: 'verde' | 'amarelo' | 'vermelho',
 *   motivo: 'saldo-negativo' | 'categoria-estourada' | 'ritmo-acelerado' | 'saldo-apertado' | 'dentro-do-previsto',
 *   frase: string,
 *   numeros: object
 * }}
 */
export function avaliarGasto(
  { lancamento, categoria, registroMes, fixos, lancamentos, cartoes = [], categorias = [], hoje = lancamento.data },
  limites = LIMITES_PADRAO,
) {
  if (lancamento.categoriaId !== categoria.id) {
    throw new ErroValidacao('categoriaId', 'O lançamento não pertence à categoria informada.');
  }
  if (mesDaData(lancamento.data) !== registroMes.mes) {
    throw new ErroValidacao('data', `O lançamento é de outro mês (esperado ${registroMes.mes}).`);
  }

  // Lançamentos já registrados, sem o próprio gasto novo (evita contar duas vezes).
  const outros = lancamentos.filter((l) => l.id !== lancamento.id);
  // Orçamento: o que foi CONSUMIDO no mês (data do gasto), à vista ou no cartão.
  const consumidosNoMes = lancamentosValidosDoMes(outros, registroMes.mes);

  const valor = lancamento.valorCentavos;
  const temOrcamento = categoria.orcamentoCentavos > 0;

  // Saldo: o que SAI da conta. O gasto novo pode sair agora ou em faturas futuras.
  const saidasNovas = saidasDoLancamento(lancamento, cartoes);
  const noCartao = saidasNovas[0].cartao;
  const saidaNoMesAtual = saidasNovas
    .filter((s) => s.mes === registroMes.mes)
    .reduce((soma, s) => soma + s.valorCentavos, 0);
  const saldo = calcularSaldoProjetado(
    registroMes, fixos, saidasNoMes(outros, cartoes, registroMes.mes), saidaNoMesAtual,
  );

  // No cartão: o pior mês entre os meses das parcelas, já contando a compra.
  let mesDoSaldo = registroMes.mes;
  let saldoJulgado = saldo.saldoProjetadoCentavos;
  if (noCartao) {
    const visao = { registroMes, fixos, categorias, cartoes };
    const aFrente = mesesAteAUltimaSaida(saidasNovas, registroMes.mes);
    const comCompra = projetarMeses({ ...visao, lancamentos: [...outros, lancamento] }, aFrente);
    const mesesDaCompra = new Set(saidasNovas.map((s) => s.mes));
    const pior = comCompra
      .filter((m) => mesesDaCompra.has(m.mes))
      .reduce((menor, m) => (m.sobraCentavos < menor.sobraCentavos ? m : menor));
    mesDoSaldo = pior.mes;
    saldoJulgado = pior.sobraCentavos;
  }

  const margem = temOrcamento ? calcularMargemCategoria(categoria, consumidosNoMes, valor) : null;
  const ritmo = temOrcamento
    ? calcularRitmo(
        categoria.orcamentoCentavos,
        margem.gastoDepoisCentavos,
        hoje,
        limites.toleranciaRitmoPontos,
      )
    : null;

  const numeros = {
    ...saldo,
    saldoProjetadoCentavos: saldoJulgado,
    mesDoSaldo,
    estimativa: mesDoSaldo !== registroMes.mes,
    saidas: saidasNovas,
    margem,
    ritmo,
  };
  const saldoTexto = formatarCentavos(saldoJulgado);
  // "o saldo fecha o mês" (à vista) ou "dezembro deve fechar" (fatura futura).
  const ondeFecha = numeros.estimativa
    ? `${tituloDoMes(mesDoSaldo).replace(/ de \d{4}$/, '').toLowerCase()} deve fechar`
    : 'o saldo fecha o mês';

  if (saldoJulgado < 0) {
    return {
      cor: 'vermelho',
      motivo: 'saldo-negativo',
      frase: `Passou: ${ondeFecha} em ${saldoTexto}.`,
      numeros,
    };
  }
  if (temOrcamento && margem.margemCentavos < 0) {
    return {
      cor: 'vermelho',
      motivo: 'categoria-estourada',
      frase: `Passou: ${categoria.nome} estourou em ${formatarCentavos(-margem.margemCentavos)}.`,
      numeros,
    };
  }

  if (temOrcamento && ritmo.acelerado) {
    return {
      cor: 'amarelo',
      motivo: 'ritmo-acelerado',
      frase: `Atenção: ${categoria.nome} está acelerado. Sobram ${formatarCentavos(margem.margemCentavos)}.`,
      numeros,
    };
  }

  if (saldoJulgado < limites.colchaoSaldoCentavos) {
    return {
      cor: 'amarelo',
      motivo: 'saldo-apertado',
      frase: `Atenção: ${ondeFecha} em ${saldoTexto}.`,
      numeros,
    };
  }

  return {
    cor: 'verde',
    motivo: 'dentro-do-previsto',
    frase: temOrcamento
      ? `Ainda cabe: sobram ${formatarCentavos(margem.margemCentavos)} em ${categoria.nome}.`
      : `Ainda cabe: ${ondeFecha} em ${saldoTexto}.`,
    numeros,
  };
}
