/**
 * Alertas da Receita Federal (Fase 04, parte 4.7).
 *
 * Regras conferidas em 12/10/2026 (pessoa física, operações comuns na bolsa):
 * - Ações: vendas de até R$ 20 mil no mês são isentas (o limite é sobre o
 *   VALOR VENDIDO, não sobre o lucro). Acima disso, 15% sobre o lucro.
 * - FIIs: 20% sobre o lucro das vendas, sem isenção.
 * - DARF código 6015, vencimento no último dia útil do mês seguinte.
 *   Imposto abaixo de R$ 10 não se paga no mês: acumula para o próximo.
 * - Prejuízo compensa lucros futuros da mesma modalidade (ações com ações,
 *   FIIs com FIIs), sem prazo. O app compensa também o prejuízo de meses isentos.
 * - Declaração anual obrigatória (entre outros motivos): vendas na bolsa acima
 *   de R$ 40 mil no ano, ou com lucro tributável; ou bens acima de R$ 800 mil
 *   em 31/12. Bens e Direitos vão pelo CUSTO DE AQUISIÇÃO, não pelo valor atual.
 *
 * Limites do app (avisados na tela):
 * - Day trade (compra e venda do mesmo ativo no mesmo dia) tem regra própria
 *   (20%, sem isenção): o app só avisa, não separa.
 * - Feriados não entram no vencimento (só sábados e domingos).
 * - O IRRF de 0,005% na venda ("dedo-duro") e dividendos não entram.
 * As vendas vêm de posicaoDoAtivo (src/acoes.js), com o preço médio da Receita.
 *
 * O app calcula e avisa; quem gera e paga o DARF é a pessoa (Receita: Sicalc).
 * Funções puras: testadas no Node (tests/receita.test.js).
 */

import { investimentosAtivos, tipoDoInvestimento } from './carteira.js';
import { ehPorOperacao, posicaoDoAtivo } from './acoes.js';

/** Regras em centavos e porcentagens (conferidas em 12/10/2026). */
export const REGRAS = Object.freeze({
  isencaoAcoesNoMesCentavos: 2_000_000,
  aliquotaAcoes: 15,
  aliquotaFii: 20,
  darfMinimoCentavos: 1_000,
  codigoDarf: '6015',
  vendasNoAnoParaDeclararCentavos: 4_000_000,
  bensParaDeclararCentavos: 80_000_000,
});

/** A partir de quanto das vendas do mês o app avisa que o limite de isenção está perto (75%). */
export const AVISO_PERTO_DA_ISENCAO = 0.75;

/** Último dia útil (sem contar feriados) do mês seguinte a "AAAA-MM". */
export function vencimentoDoDarf(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, m + 1, 0)); // último dia do mês seguinte
  while (data.getUTCDay() === 0 || data.getUTCDay() === 6) data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

/**
 * Todas as vendas de ações e FIIs, com o dia em que houve compra do mesmo
 * ativo (possível day trade).
 *
 * @param {object} estado
 * @returns {{ categoria: 'acoes'|'fii', nome: string, data: string, mes: string,
 *   valorVendaCentavos: number, lucroCentavos: number, mesmoDia: boolean }[]}
 */
export function vendasDaCarteira(estado) {
  const vendas = [];
  for (const ativo of investimentosAtivos(estado)) {
    if (!ehPorOperacao(ativo.tipo)) continue;
    const comprasNoDia = new Set((ativo.operacoes ?? []).filter((o) => o.tipo === 'compra').map((o) => o.data));
    for (const v of posicaoDoAtivo(ativo).vendas) {
      vendas.push({
        categoria: ativo.tipo === 'fii' ? 'fii' : 'acoes',
        nome: ativo.nome,
        data: v.data,
        mes: v.mes,
        valorVendaCentavos: v.valorVendaCentavos,
        lucroCentavos: v.lucroCentavos,
        mesmoDia: comprasNoDia.has(v.data),
      });
    }
  }
  return vendas.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Imposto de uma categoria no mês, com a compensação do prejuízo acumulado.
 * @returns {{ base: number, imposto: number, prejuizoDepois: number }}
 */
function apurar(lucro, prejuizoAntes, aliquota, isento) {
  if (lucro < 0) return { base: 0, imposto: 0, prejuizoDepois: prejuizoAntes - lucro };
  if (isento) return { base: 0, imposto: 0, prejuizoDepois: prejuizoAntes };
  const compensado = Math.min(lucro, prejuizoAntes);
  const base = lucro - compensado;
  return { base, imposto: Math.round((base * aliquota) / 100), prejuizoDepois: prejuizoAntes - compensado };
}

/**
 * Apuração mês a mês (só meses com venda), em ordem.
 *
 * @param {object} estado
 * @returns {{
 *   mes: string,
 *   acoes: { vendasCentavos: number, lucroCentavos: number, isento: boolean, impostoCentavos: number },
 *   fii: { vendasCentavos: number, lucroCentavos: number, impostoCentavos: number },
 *   prejuizoAcoesCentavos: number, prejuizoFiiCentavos: number,   // acumulados depois do mês
 *   impostoCentavos: number,        // do mês + o que veio acumulado (abaixo de R$ 10)
 *   darf: { valorCentavos: number, vencimento: string, codigo: string } | null,
 *   acumulaCentavos: number,        // abaixo de R$ 10: passa para o próximo mês
 *   mesmoDia: boolean,              // houve compra e venda do mesmo ativo no mesmo dia
 * }[]}
 */
export function apuracaoMensal(estado) {
  const porMes = new Map();
  for (const v of vendasDaCarteira(estado)) {
    const m = porMes.get(v.mes) ?? { acoes: { vendas: 0, lucro: 0 }, fii: { vendas: 0, lucro: 0 }, mesmoDia: false };
    m[v.categoria].vendas += v.valorVendaCentavos;
    m[v.categoria].lucro += v.lucroCentavos;
    m.mesmoDia ||= v.mesmoDia;
    porMes.set(v.mes, m);
  }

  let prejuizoAcoes = 0;
  let prejuizoFii = 0;
  let acumulado = 0;
  const meses = [];
  for (const mes of [...porMes.keys()].sort()) {
    const m = porMes.get(mes);
    const isento = m.acoes.vendas <= REGRAS.isencaoAcoesNoMesCentavos;
    const acoes = apurar(m.acoes.lucro, prejuizoAcoes, REGRAS.aliquotaAcoes, isento);
    const fii = apurar(m.fii.lucro, prejuizoFii, REGRAS.aliquotaFii, false);
    prejuizoAcoes = acoes.prejuizoDepois;
    prejuizoFii = fii.prejuizoDepois;
    const imposto = acoes.imposto + fii.imposto + acumulado;
    const paga = imposto >= REGRAS.darfMinimoCentavos;
    acumulado = paga ? 0 : imposto;
    meses.push({
      mes,
      acoes: { vendasCentavos: m.acoes.vendas, lucroCentavos: m.acoes.lucro, isento, impostoCentavos: acoes.imposto },
      fii: { vendasCentavos: m.fii.vendas, lucroCentavos: m.fii.lucro, impostoCentavos: fii.imposto },
      prejuizoAcoesCentavos: prejuizoAcoes,
      prejuizoFiiCentavos: prejuizoFii,
      impostoCentavos: imposto,
      darf: paga ? { valorCentavos: imposto, vencimento: vencimentoDoDarf(mes), codigo: REGRAS.codigoDarf } : null,
      acumulaCentavos: paga ? 0 : imposto,
      mesmoDia: m.mesmoDia,
    });
  }
  return meses;
}

/** "R$ 1.234,56" sem depender do Intl (o texto é montado aqui para ser testável). */
function reais(centavos) {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '−' : ''}R$ ${inteiro},${String(abs % 100).padStart(2, '0')}`;
}

/** "2026-11-30" → "30/11/2026". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/** "2026-10" → "10/2026". */
const mesCurto = (mes) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

/**
 * Alertas para mostrar agora.
 *
 * @param {object} estado
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ nivel: 'pagar'|'atencao'|'info', texto: string }[]}
 */
export function alertasDaReceita(estado, hoje) {
  const meses = apuracaoMensal(estado);
  const alertas = [];
  const mesAtual = hoje.slice(0, 7);

  // DARF de meses fechados que ainda não venceu (ou vence hoje).
  for (const m of meses) {
    if (m.darf && m.mes < mesAtual && m.darf.vencimento >= hoje) {
      alertas.push({
        nivel: 'pagar',
        texto: `DARF de ${reais(m.darf.valorCentavos)} (código ${m.darf.codigo}) das vendas de ${mesCurto(m.mes)}: vence em ${dataLonga(m.darf.vencimento)}.`,
      });
    }
  }

  const atual = meses.find((m) => m.mes === mesAtual);
  if (atual) {
    const vendido = atual.acoes.vendasCentavos;
    if (vendido > REGRAS.isencaoAcoesNoMesCentavos) {
      alertas.push({
        nivel: 'atencao',
        texto: `Vendas de ações neste mês: ${reais(vendido)}, acima de ${reais(REGRAS.isencaoAcoesNoMesCentavos)}. O lucro das ações deste mês paga 15%.`,
      });
    } else if (vendido >= REGRAS.isencaoAcoesNoMesCentavos * AVISO_PERTO_DA_ISENCAO) {
      alertas.push({
        nivel: 'atencao',
        texto: `Vendas de ações neste mês: ${reais(vendido)}. Faltam ${reais(REGRAS.isencaoAcoesNoMesCentavos - vendido)} para passar do limite de isenção de ${reais(REGRAS.isencaoAcoesNoMesCentavos)}.`,
      });
    }
    if (atual.impostoCentavos > 0) {
      alertas.push({
        nivel: 'info',
        texto: `Imposto das vendas deste mês até agora: ${reais(atual.impostoCentavos)}` +
          `${atual.darf ? ` (DARF até ${dataLonga(atual.darf.vencimento)})` : ' (abaixo de R$ 10: acumula para o próximo mês)'}.`,
      });
    }
  }
  if (meses.some((m) => m.mesmoDia && m.mes >= `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4, 7)}`)) {
    alertas.push({
      nivel: 'atencao',
      texto: 'Há compra e venda do mesmo ativo no mesmo dia (day trade): tem regra própria (20%, sem isenção), e o app calcula como operação comum. Confira.',
    });
  }
  return alertas;
}

/**
 * Custo de aquisição de cada investimento em 31/12 de um ano (Bens e Direitos).
 * Ações e FIIs: o custo da posição com as operações até 31/12. Os outros: o valor
 * aplicado, se a aplicação foi até 31/12. Investimentos removidos do app não entram.
 */
function bensEm31Dezembro(estado, ano) {
  const fim = `${ano}-12-31`;
  const bens = [];
  for (const i of investimentosAtivos(estado)) {
    const tipo = tipoDoInvestimento(i.tipo)?.nome ?? i.tipo;
    if (ehPorOperacao(i.tipo)) {
      const ate = { ...i, operacoes: (i.operacoes ?? []).filter((o) => o.data <= fim) };
      const { quantidade, custoCentavos } = posicaoDoAtivo(ate);
      if (quantidade > 0) bens.push({ nome: i.nome, tipo, quantidade, custoCentavos });
    } else if (i.dataAplicacao <= fim) {
      bens.push({ nome: i.nome, tipo, quantidade: null, custoCentavos: i.valorAplicadoCentavos });
    }
  }
  return bens;
}

/**
 * Resumo para a declaração anual de um ano-calendário.
 *
 * @param {object} estado
 * @param {number} ano Ano-calendário (a declaração é entregue no ano seguinte).
 * @returns {{ ano: number, vendasCentavos: number, impostoPagoCentavos: number,
 *   prejuizoAcoesCentavos: number, prejuizoFiiCentavos: number,
 *   bens: object[], bensCentavos: number, motivos: string[] }}
 *   motivos: por que a declaração é obrigatória pelos dados do app (vazio = nenhum motivo daqui).
 */
export function resumoDoAno(estado, ano) {
  const doAno = apuracaoMensal(estado).filter((m) => m.mes.startsWith(`${ano}-`));
  const vendasCentavos = doAno.reduce((s, m) => s + m.acoes.vendasCentavos + m.fii.vendasCentavos, 0);
  const tributavel = doAno.some((m) => m.acoes.impostoCentavos + m.fii.impostoCentavos > 0);
  const ultimo = apuracaoMensal(estado).filter((m) => m.mes <= `${ano}-12`).at(-1);
  const bens = bensEm31Dezembro(estado, ano);
  const bensCentavos = bens.reduce((s, b) => s + b.custoCentavos, 0);

  const motivos = [];
  if (vendasCentavos > REGRAS.vendasNoAnoParaDeclararCentavos) {
    motivos.push(`vendas na bolsa de ${reais(vendasCentavos)} no ano (acima de ${reais(REGRAS.vendasNoAnoParaDeclararCentavos)})`);
  }
  if (tributavel) motivos.push('vendas com lucro tributável');
  if (bensCentavos > REGRAS.bensParaDeclararCentavos) {
    motivos.push(`bens de ${reais(bensCentavos)} em 31/12 (acima de ${reais(REGRAS.bensParaDeclararCentavos)})`);
  }
  return {
    ano,
    vendasCentavos,
    impostoPagoCentavos: doAno.reduce((s, m) => s + (m.darf?.valorCentavos ?? 0), 0),
    prejuizoAcoesCentavos: ultimo?.prejuizoAcoesCentavos ?? 0,
    prejuizoFiiCentavos: ultimo?.prejuizoFiiCentavos ?? 0,
    bens,
    bensCentavos,
    motivos,
  };
}

/**
 * Textos do resumo anual para a tela.
 * @param {object} r Resultado de resumoDoAno.
 * @returns {string[]}
 */
export function linhasDoAno(r) {
  const linhas = [
    r.motivos.length > 0
      ? `Declaração de ${r.ano + 1} (ano de ${r.ano}): obrigatória pelos dados do app: ${r.motivos.join('; ')}.`
      : `Declaração de ${r.ano + 1} (ano de ${r.ano}): os investimentos do app não obrigam a declarar (salário e outros bens podem obrigar).`,
    `Vendas na bolsa no ano: ${reais(r.vendasCentavos)} · DARF no ano: ${reais(r.impostoPagoCentavos)}.`,
  ];
  if (r.prejuizoAcoesCentavos > 0 || r.prejuizoFiiCentavos > 0) {
    linhas.push(`Prejuízo para compensar (informe na declaração): ações ${reais(r.prejuizoAcoesCentavos)} · FIIs ${reais(r.prejuizoFiiCentavos)}.`);
  }
  if (r.bens.length > 0) {
    linhas.push(`Bens e Direitos em 31/12/${r.ano}, pelo custo de aquisição: ` +
      `${r.bens.map((b) => `${b.nome} ${reais(b.custoCentavos)}${b.quantidade ? ` (${b.quantidade} un.)` : ''}`).join('; ')}.`);
  }
  return linhas;
}
