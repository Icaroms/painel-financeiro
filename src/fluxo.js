/**
 * Fluxo de caixa: QUANDO o dinheiro de cada gasto sai da conta (Fase 02, parte 2.2).
 *
 * - Gasto à vista (Pix, dinheiro, débito, ou cartão sem cadastro): sai
 *   inteiro no mês da data do gasto.
 * - Compra num cartão cadastrado: sai na fatura. Com parcelas, o valor é
 *   dividido e cada parcela sai numa fatura seguida. Os centavos que
 *   sobram da divisão vão para a 1ª parcela (R$ 1.000,00 em 3x =
 *   333,34 + 333,33 + 333,33).
 *
 * Duas contas diferentes usam essas saídas:
 * - o SALDO do mês (quanto sobra) conta as saídas do mês;
 * - o ORÇAMENTO da categoria continua contando o gasto inteiro no mês da
 *   compra, porque o consumo aconteceu ali (src/veredito.js).
 *
 * Funções puras: testadas no Node.
 */

import { mesDaData, somarMeses, mesesEntre } from './datas.js';
import { fixoAtivoNoMes } from './modelo.js';
import { faturaDaCompra, vencimentoNoMes } from './cartoes.js';
import { calcularSaldoProjetado } from './veredito.js';

/**
 * Saídas de um lançamento: uma para gasto à vista, uma por parcela no cartão.
 *
 * @param {object}   lancamento
 * @param {object[]} [cartoes]
 * @returns {{ mes: string, vencimento: string|null, valorCentavos: number,
 *   numero: number, total: number, formaPagamento: string, cartao: boolean, lancamento: object }[]}
 */
export function saidasDoLancamento(lancamento, cartoes = []) {
  const cartao = cartoes.find((c) => c.formaPagamento === lancamento.formaPagamento);
  const base = { formaPagamento: lancamento.formaPagamento, lancamento };

  if (!cartao) {
    return [{
      ...base, mes: mesDaData(lancamento.data), vencimento: null,
      valorCentavos: lancamento.valorCentavos, numero: 1, total: 1, cartao: false,
    }];
  }

  const total = lancamento.parcelas ?? 1;
  const parcela = Math.floor(lancamento.valorCentavos / total);
  const resto = lancamento.valorCentavos - parcela * total;
  const primeira = faturaDaCompra(cartao, lancamento.data).mesFatura;

  return Array.from({ length: total }, (_, i) => {
    const mes = somarMeses(primeira, i);
    return {
      ...base, mes, vencimento: vencimentoNoMes(cartao, mes),
      valorCentavos: parcela + (i === 0 ? resto : 0), numero: i + 1, total, cartao: true,
    };
  });
}

/**
 * Todas as saídas que caem num mês (de lançamentos não excluídos).
 *
 * @param {object[]} lancamentos
 * @param {object[]} cartoes
 * @param {string}   mes "AAAA-MM".
 * @returns {object[]} Saídas no formato de saidasDoLancamento.
 */
export function saidasNoMes(lancamentos, cartoes, mes) {
  return lancamentos
    .filter((l) => l.excluidoEm === null)
    .flatMap((l) => saidasDoLancamento(l, cartoes))
    .filter((s) => s.mes === mes);
}

/**
 * Faturas que vencem num mês, uma por cartão, com as parcelas que entram nela.
 * Só aparecem cartões com alguma compra na fatura.
 *
 * @param {object[]} lancamentos
 * @param {object[]} cartoes
 * @param {object}   registroMes O mês (para a situação da fatura: prevista ou paga).
 * @returns {{ formaPagamento: string, vencimento: string, totalCentavos: number,
 *   itens: object[], status: 'previsto'|'pago' }[]}
 */
export function faturasDoMes(lancamentos, cartoes, registroMes) {
  const saidas = saidasNoMes(lancamentos, cartoes, registroMes.mes).filter((s) => s.cartao);
  return cartoes
    .map((cartao) => {
      const itens = saidas.filter((s) => s.formaPagamento === cartao.formaPagamento);
      return {
        formaPagamento: cartao.formaPagamento,
        vencimento: vencimentoNoMes(cartao, registroMes.mes),
        totalCentavos: itens.reduce((soma, s) => soma + s.valorCentavos, 0),
        itens,
        status: registroMes.statusFaturas?.[cartao.formaPagamento] === 'pago' ? 'pago' : 'previsto',
      };
    })
    .filter((f) => f.itens.length > 0)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/**
 * Marca a fatura de um cartão como paga (ou de volta a prevista) num mês.
 *
 * @param {object} estado
 * @param {string} mes            "AAAA-MM".
 * @param {string} formaPagamento O cartão.
 * @param {'previsto'|'pago'} status
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function definirStatusDaFatura(estado, mes, formaPagamento, status, { agora = new Date() } = {}) {
  if (status !== 'previsto' && status !== 'pago') {
    throw new Error('A fatura só pode estar prevista ou paga.');
  }
  return {
    ...estado,
    meses: estado.meses.map((m) => (m.mes !== mes ? m : {
      ...m,
      statusFaturas: { ...(m.statusFaturas ?? {}), [formaPagamento]: status },
      atualizadoEm: agora.toISOString(),
    })),
  };
}

/**
 * Projeção da sobra do mês atual e dos meses seguintes. É uma ESTIMATIVA:
 *
 * - mês atual: a sobra de verdade (saldo + renda − contas fixas − saídas do mês);
 * - mês seguinte: começa com a sobra do anterior, recebe a mesma renda e
 *   desconta as contas fixas ativas (valor padrão), as faturas já
 *   comprometidas e a soma dos orçamentos das categorias (o que se espera
 *   gastar no dia a dia).
 *
 * @param {object} visao  { registroMes, fixos, categorias, lancamentos, cartoes }
 * @param {number} mesesAFrente Quantos meses depois do atual (0 = só o atual).
 * @returns {{ mes: string, sobraCentavos: number }[]}
 */
export function projetarMeses({ registroMes, fixos, categorias, lancamentos, cartoes = [] }, mesesAFrente) {
  const atual = registroMes.mes;
  const saidasAtual = saidasNoMes(lancamentos, cartoes, atual);
  let sobra = calcularSaldoProjetado(registroMes, fixos, saidasAtual, 0).saldoProjetadoCentavos;
  const projecao = [{ mes: atual, sobraCentavos: sobra }];

  const orcamentos = categorias
    .filter((c) => c.excluidoEm === null)
    .reduce((soma, c) => soma + c.orcamentoCentavos, 0);

  for (let i = 1; i <= mesesAFrente; i += 1) {
    const mes = somarMeses(atual, i);
    const contas = fixos
      .filter((f) => fixoAtivoNoMes(f, mes))
      .reduce((soma, f) => soma + f.valorCentavos, 0);
    const faturas = saidasNoMes(lancamentos, cartoes, mes).reduce((soma, s) => soma + s.valorCentavos, 0);
    sobra = sobra + registroMes.rendaPrevistaCentavos - contas - faturas - orcamentos;
    projecao.push({ mes, sobraCentavos: sobra });
  }
  return projecao;
}

/**
 * Quantos meses depois do atual vai a última saída de um lançamento.
 *
 * @param {object[]} saidas Saídas de um lançamento.
 * @param {string}   mesAtual
 * @returns {number}
 */
export function mesesAteAUltimaSaida(saidas, mesAtual) {
  const ultima = saidas.reduce((maior, s) => (s.mes > maior ? s.mes : maior), mesAtual);
  return mesesEntre(mesAtual, ultima) - 1;
}
