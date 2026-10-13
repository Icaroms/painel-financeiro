/**
 * Indicadores da carteira e IA dos investimentos (Fase 04, parte 4.6).
 *
 * Regra da fase: as regras do app CALCULAM, a IA só explica e comenta.
 *
 * 1. indicadoresDaCarteira(): números objetivos, sempre visíveis na aba
 *    Investir (mesmo sem IA):
 *    - concentração: a maior posição e a porcentagem de cada grupo;
 *    - liquidez: quanto está em renda fixa e fundos (saque rápido);
 *    - reserva de emergência: quantos meses de custo ela cobre × a meta;
 *    - cada aplicação de renda fixa/fundo com 30 dias ou mais: quanto rendeu
 *      desde a aplicação comparado ao CDI e ao IPCA DO MESMO PERÍODO (histórico
 *      real do radar, parte 4.4b) — "% do CDI" e "ganho real";
 *    - pendências: renda fixa sem taxa contratada, ação/FII sem cotação,
 *      valor digitado há mais de 90 dias;
 *    - fatos de atenção (sem julgamento): reserva abaixo da meta, metade ou
 *      mais da carteira em um investimento, aplicação abaixo da inflação.
 * 2. mensagemDaCarteira(): manda esses números ao Gemini, que comenta em
 *    "Como está a carteira / Pontos de atenção / Para você decidir".
 *
 * Use com a visão "com estimativas" (src/renda-fixa.js, comEstimativas):
 * a renda fixa com taxa entra pelo valor estimado.
 *
 * Privacidade: vão à IA só números e nomes de investimentos e grupos, nunca
 * nome, e-mail ou senhas da pessoa. A IA não dá ordem de compra ou venda,
 * não indica ativo e não prevê preço.
 *
 * Funções puras: testadas no Node (tests/investimentos-ia.test.js).
 */

import { formatarCentavos } from './dinheiro.js';
import { mesDaData } from './datas.js';
import { resumoDaCarteira, tipoDoInvestimento } from './carteira.js';
import { ehPorOperacao } from './acoes.js';
import { situacaoDaReserva, dividirSobra } from './destino.js';
import { aceitaTaxa, textoDaTaxa, diasEntre, fimDoCdi, fatorDoCdi, fatorDoIpca } from './renda-fixa.js';

/** Dias mínimos para comparar uma aplicação com o CDI e o IPCA. */
export const DIAS_MINIMOS_PARA_COMPARAR = 30;

/** Valor digitado há mais que isto (sem estimativa) vira pendência. */
export const DIAS_PARA_VALOR_ANTIGO = 90;

/** A maior posição com esta fração ou mais vira fato de atenção. */
export const FRACAO_DE_CONCENTRACAO = 0.5;

/** "R$ 1.234,56" sem o espaço especial do Intl. */
const reais = (centavos) => formatarCentavos(centavos).replace(/ /g, ' ');

/** 12.345 → "12,3%". */
const umaCasa = (n) => `${(Math.round(n * 10) / 10).toFixed(1).replace('.', ',')}%`;

/** Com sinal: "+8,1%" / "−2,0%". */
const comSinal = (n) => {
  const arredondado = Math.round(n * 10) / 10;
  if (arredondado > 0) return `+${umaCasa(arredondado)}`;
  if (arredondado < 0) return `−${umaCasa(-arredondado)}`;
  return umaCasa(0);
};

/** "2026-10-09" → "09/10/2026". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/* ------------------------------------------------------------------ */
/* Indicadores                                                        */
/* ------------------------------------------------------------------ */

/**
 * Compara uma aplicação com o CDI e o IPCA do mesmo período.
 *
 * @param {object} item Item de resumoDaCarteira (aplicadoCentavos, atualCentavos, investimento).
 * @param {object|null} historico radar.taxas.historico
 * @returns {null | { dias: number, rendimento: number, cdiNoPeriodo: number, percentualDoCdi: number|null,
 *   ipcaNoPeriodo: number, ganhoReal: number }} Porcentagens (ex.: 12.3 = 12,3%).
 */
export function comparacaoDaAplicacao(item, historico) {
  const { investimento } = item;
  const de = investimento.dataAplicacao;
  const ate = investimento.valorAtualEm;
  if (!historico || typeof ate !== 'string' || `${historico.inicio}-01` > de || item.aplicadoCentavos <= 0) return null;
  const dias = diasEntre(de, ate);
  if (dias < DIAS_MINIMOS_PARA_COMPARAR) return null;
  const fimCdi = fimDoCdi(historico) < ate ? fimDoCdi(historico) : ate;
  const rendimento = (item.atualCentavos / item.aplicadoCentavos - 1) * 100;
  const cdiNoPeriodo = (fatorDoCdi(historico, de, fimCdi) - 1) * 100;
  const ipcaNoPeriodo = (fatorDoIpca(historico, de, ate).fator - 1) * 100;
  return {
    dias,
    rendimento,
    cdiNoPeriodo,
    percentualDoCdi: cdiNoPeriodo > 0 ? (rendimento / cdiNoPeriodo) * 100 : null,
    ipcaNoPeriodo,
    ganhoReal: ((1 + rendimento / 100) / (1 + ipcaNoPeriodo / 100) - 1) * 100,
  };
}

/**
 * Indicadores objetivos da carteira.
 *
 * @param {object} estado Dados do app (de preferência a visão com estimativas).
 * @param {object|null} radar Radar guardado (taxas e histórico; opcional).
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {object|null} null quando não há investimento em aberto.
 */
export function indicadoresDaCarteira(estado, radar, hoje) {
  const r = resumoDaCarteira(estado);
  const abertos = r.itens.filter((i) => !i.encerrado);
  if (abertos.length === 0) return null;
  const total = r.atualCentavos;
  const fracao = (centavos) => (total > 0 ? centavos / total : 0);

  const maior = abertos[0]; // resumoDaCarteira já ordena do maior valor atual para o menor
  const rendaFixa = r.grupos.find((g) => g.id === 'renda-fixa');

  const mes = mesDaData(hoje);
  const reserva = situacaoDaReserva(estado, mes);
  const custoMensal = reserva.custo.totalCentavos;

  const historico = radar?.taxas?.historico ?? null;
  const aplicacoes = abertos
    .filter((i) => !ehPorOperacao(i.investimento.tipo) && tipoDoInvestimento(i.investimento.tipo)?.grupo === 'renda-fixa')
    .map((i) => ({
      nome: i.investimento.nome,
      tipo: tipoDoInvestimento(i.investimento.tipo)?.nome ?? i.investimento.tipo,
      taxa: i.investimento.taxa ? textoDaTaxa(i.investimento.taxa) : null,
      estimado: Boolean(i.investimento.estimativa),
      comparacao: comparacaoDaAplicacao(i, historico),
    }));

  const pendencias = [];
  for (const i of abertos) {
    const inv = i.investimento;
    if (aceitaTaxa(inv.tipo) && !inv.taxa) pendencias.push(`${inv.nome}: sem a taxa contratada (o valor não é estimado)`);
    if (i.semCotacao) pendencias.push(`${inv.nome}: sem cotação (conta pelo custo)`);
    if (!ehPorOperacao(inv.tipo) && !inv.estimativa && diasEntre(inv.valorAtualEm, hoje) > DIAS_PARA_VALOR_ANTIGO) {
      pendencias.push(`${inv.nome}: valor de ${dataLonga(inv.valorAtualEm)}, há mais de ${DIAS_PARA_VALOR_ANTIGO} dias`);
    }
  }

  const atencao = [];
  if (reserva.metaCentavos > 0 && reserva.fracao < 1) {
    atencao.push(`A reserva de emergência está em ${Math.floor(reserva.fracao * 100)}% da meta.`);
  }
  if (abertos.length > 1 && fracao(maior.atualCentavos) >= FRACAO_DE_CONCENTRACAO) {
    atencao.push(`${maior.investimento.nome} é ${Math.round(fracao(maior.atualCentavos) * 100)}% da carteira.`);
  }
  if (abertos.length === 1) atencao.push('A carteira inteira está em um investimento só.');
  for (const a of aplicacoes) {
    if (a.comparacao && a.comparacao.ganhoReal < 0) atencao.push(`${a.nome} rendeu menos que a inflação no período.`);
  }

  return {
    totalCentavos: total,
    aplicadoCentavos: r.aplicadoCentavos,
    rendimentoPercentual: r.percentual,
    quantidade: abertos.length,
    grupos: r.grupos.map((g) => ({ nome: g.nome, centavos: g.atualCentavos, fracao: fracao(g.atualCentavos) })),
    maiorPosicao: {
      nome: maior.investimento.nome,
      tipo: tipoDoInvestimento(maior.investimento.tipo)?.nome ?? maior.investimento.tipo,
      fracao: fracao(maior.atualCentavos),
    },
    liquidez: { centavos: rendaFixa?.atualCentavos ?? 0, fracao: fracao(rendaFixa?.atualCentavos ?? 0) },
    reserva: {
      atualCentavos: reserva.reservaAtualCentavos,
      metaCentavos: reserva.metaCentavos,
      metaMeses: reserva.metaMeses,
      mesesCobertos: custoMensal > 0 ? reserva.reservaAtualCentavos / custoMensal : null,
      fracao: reserva.fracao,
    },
    investirDoMesCentavos: dividirSobra(estado, mes, hoje).investirCentavos,
    taxas: radar?.taxas
      ? { cdi: radar.taxas.cdi, ipca: radar.taxas.ipca, selic: radar.taxas.selicMeta.valor, poupanca: radar.taxas.poupanca ?? null }
      : null,
    aplicacoes,
    pendencias,
    atencao,
  };
}

/** Texto da comparação de uma aplicação: "112% do CDI e ganho real de +8,1% em 300 dias". */
export function textoDaComparacao(c) {
  const cdi = c.percentualDoCdi === null ? '' : `${Math.round(c.percentualDoCdi)}% do CDI e `;
  return `rendeu ${comSinal(c.rendimento)} em ${c.dias} dias: ${cdi}ganho real de ${comSinal(c.ganhoReal)} (CDI ${comSinal(c.cdiNoPeriodo)}, IPCA ${comSinal(c.ipcaNoPeriodo)} no período)`;
}

/**
 * Linhas do quadro "Indicadores da carteira" (tela).
 *
 * @param {object} ind Resultado de indicadoresDaCarteira.
 * @returns {{ titulo: string, texto: string }[]}
 */
export function linhasDosIndicadores(ind) {
  const linhas = [];
  linhas.push({
    titulo: 'Maior posição',
    texto: ind.quantidade === 1
      ? `${ind.maiorPosicao.nome} (a carteira inteira)`
      : `${ind.maiorPosicao.nome} (${Math.round(ind.maiorPosicao.fracao * 100)}% da carteira)`,
  });
  linhas.push({
    titulo: 'Liquidez',
    texto: `${Math.round(ind.liquidez.fracao * 100)}% em renda fixa e fundos (dinheiro que costuma dar para sacar rápido)`,
  });
  const { reserva } = ind;
  linhas.push({
    titulo: 'Reserva',
    texto: reserva.mesesCobertos === null
      ? 'meta ainda não calculada (cadastre as contas fixas e os orçamentos)'
      // Abaixo de 2, singular: "0,4 mês", "1,5 mês".
      : `cobre ${reserva.mesesCobertos.toFixed(1).replace('.', ',')} ${reserva.mesesCobertos < 2 ? 'mês' : 'meses'} de custo (meta: ${reserva.metaMeses})`,
  });
  for (const a of ind.aplicacoes) {
    if (a.comparacao) linhas.push({ titulo: a.nome, texto: textoDaComparacao(a.comparacao) });
  }
  if (ind.pendencias.length > 0) linhas.push({ titulo: 'Pendências', texto: ind.pendencias.join('; ') });
  return linhas;
}

/* ------------------------------------------------------------------ */
/* IA                                                                 */
/* ------------------------------------------------------------------ */

/** O papel da IA e o formato da resposta. */
export const INSTRUCOES_CARTEIRA = [
  'Você é o assistente do Painel Financeiro, um app pessoal de finanças usado no Brasil.',
  'O app calculou indicadores objetivos da carteira de investimentos da pessoa.',
  'A sua tarefa é EXPLICAR esses números em português do Brasil, de forma simples.',
  'Regras:',
  '1. Use apenas os números fornecidos. Não invente valores, taxas ou notícias.',
  '2. Não diga para comprar, vender ou resgatar nenhum investimento, e não indique produtos, bancos ou ativos. Não preveja taxas nem preços.',
  '3. Prioridades de uma carteira saudável: primeiro a reserva de emergência (em renda fixa de saque rápido), depois diversificar (não depender de um investimento só), depois render acima da inflação.',
  '4. "% do CDI" e "ganho real" comparam cada aplicação com o CDI e o IPCA do MESMO período, em valores brutos (antes do IR). Valores estimados pela taxa contratada são estimativas.',
  '5. Se houver pendências (taxa contratada faltando, cotação faltando, valor antigo), diga que completar os dados deixa a análise mais certa.',
  '6. Lembre que rendimento passado não garante rendimento futuro.',
  '7. Seja breve: no máximo 220 palavras, tom direto e gentil, sem emojis.',
  'Formato da resposta (use exatamente estes títulos, nesta ordem):',
  '## Como está a carteira',
  '(2 ou 3 frases)',
  '## Pontos de atenção',
  '(até 3 itens começando com "- "; se não houver, diga que não há)',
  '## Para você decidir',
  '(até 3 itens começando com "- ": perguntas ou conferências para a pessoa fazer, sem ordem de compra)',
  'Pode usar **negrito** em poucas palavras. Não use tabelas, links nem outros títulos.',
].join('\n');

/**
 * Monta a mensagem para a IA comentar a carteira.
 *
 * @param {object} ind Resultado de indicadoresDaCarteira.
 * @returns {{ instrucoes: string, conteudo: string }}
 */
export function mensagemDaCarteira(ind) {
  const linhas = ['Carteira da pessoa (valores de hoje; renda fixa com taxa contratada pelo valor estimado):'];
  linhas.push(`- Total: ${reais(ind.totalCentavos)} (aplicado ${reais(ind.aplicadoCentavos)}), ${ind.quantidade} ${ind.quantidade === 1 ? 'investimento' : 'investimentos'}.`);
  for (const g of ind.grupos) linhas.push(`- ${g.nome}: ${reais(g.centavos)} (${Math.round(g.fracao * 100)}%).`);
  linhas.push(`- Maior posição: ${ind.maiorPosicao.nome} (${ind.maiorPosicao.tipo}), ${Math.round(ind.maiorPosicao.fracao * 100)}% da carteira.`);
  linhas.push(`- Liquidez: ${Math.round(ind.liquidez.fracao * 100)}% em renda fixa e fundos.`);
  const { reserva } = ind;
  linhas.push(reserva.mesesCobertos === null
    ? '- Reserva de emergência: meta ainda não calculada.'
    : `- Reserva de emergência: ${reais(reserva.atualCentavos)}, cobre ${reserva.mesesCobertos.toFixed(1)} meses de custo; meta de ${reserva.metaMeses} meses (${reais(reserva.metaCentavos)}), ${Math.floor(reserva.fracao * 100)}% atingida.`);
  linhas.push(`- Parte "Investir" da sobra deste mês: ${reais(ind.investirDoMesCentavos)}.`);

  linhas.push('', 'Aplicações de renda fixa e fundos:');
  if (ind.aplicacoes.length === 0) linhas.push('- Nenhuma.');
  for (const a of ind.aplicacoes) {
    const taxa = a.taxa ? `taxa contratada ${a.taxa}${a.estimado ? ', valor estimado' : ''}` : 'sem taxa contratada informada';
    const comparacao = a.comparacao ? `; ${textoDaComparacao(a.comparacao)}` : '; menos de 30 dias ou sem histórico para comparar';
    linhas.push(`- ${a.nome} (${a.tipo}): ${taxa}${comparacao}.`);
  }

  if (ind.taxas) {
    const { cdi, ipca, selic, poupanca } = ind.taxas;
    linhas.push('', `Taxas de hoje (Banco Central): Selic ${selic}% ao ano; CDI ${cdi.anual}% ao ano; IPCA ${ipca.acumulado12m}% em 12 meses` +
      `${poupanca ? `; poupança ${poupanca.mensal}% ao mês` : ''}.`);
  }
  if (ind.atencao.length > 0) linhas.push('', 'Fatos que o app destacou:', ...ind.atencao.map((t) => `- ${t}`));
  if (ind.pendencias.length > 0) linhas.push('', 'Pendências de dados:', ...ind.pendencias.map((t) => `- ${t}`));
  linhas.push('', 'Explique estes números para a pessoa.');
  return { instrucoes: INSTRUCOES_CARTEIRA, conteudo: linhas.join('\n').replace(/ /g, ' ') };
}
