/**
 * Análise do mês com IA (Fase 03, parte 3.3).
 *
 * Três partes, todas puras (testadas no Node):
 * 1. mensagemDoMes: monta o pedido para o Gemini com os números que o app
 *    já calculou (o mesmo resumo da aba Mês, as faturas, o limite de cada
 *    cartão e a estimativa dos próximos meses).
 * 2. blocosDaResposta: lê a resposta da IA num formato simples e seguro
 *    (títulos com "## ", itens com "- ", **negrito**). A tela monta os
 *    elementos a partir desses blocos, sempre como TEXTO, nunca como HTML.
 * 3. textoParaCopiar: a resposta em texto limpo, para o botão Copiar
 *    (ex.: colar numa conversa ou numa nota).
 * 4. criarAnaliseGuardada / analiseDoMes / quandoFoiFeita: a última análise
 *    fica guardada no aparelho (fora do backup), para não gastar um pedido
 *    da cota do Gemini cada vez que a aba Mês é aberta.
 *
 * Por decisão de 10/10/2026, podem ir nomes de categorias, de contas e de
 * cartões, junto com os números. Nunca vão nome, e-mail ou senhas.
 */

import { formatarCentavos } from './dinheiro.js';
import { tituloDoMes, mesDaData, hojeLocal, somarDias } from './datas.js';
import { LIMITES_PADRAO } from './veredito.js';
import { resumoDoMes } from './resumo-mes.js';
import { dadosDoMes } from './meses.js';
import { limiteDoCartao, projetarMeses } from './fluxo.js';

/** Quantos meses depois do atual entram na estimativa enviada. */
export const MESES_ESTIMADOS = 2;

/** O papel da IA e o formato da resposta. */
export const INSTRUCOES_ANALISE = [
  'Você é o assistente do Painel Financeiro, um app pessoal de finanças usado no Brasil.',
  'O app já calculou tudo com regras fixas. A sua tarefa é ANALISAR o mês com esses números e explicar em português do Brasil.',
  'Regras:',
  '1. Use apenas os números fornecidos. Não invente valores e não refaça as contas do app.',
  '2. Não mude as cores que o app deu (verde, amarelo, vermelho): explique o que elas mostram.',
  '3. Sugestões são opções, nunca ordens ("uma opção é...", "dá para..."). No máximo 3.',
  '4. Não recomende investimentos, empréstimos nem produtos financeiros.',
  '5. Seja breve: no máximo 180 palavras, tom direto e gentil, sem emojis.',
  'Formato da resposta (use exatamente estes títulos, nesta ordem):',
  '## Resumo',
  '(2 ou 3 frases sobre como o mês está)',
  '## Pontos de atenção',
  '(até 3 itens começando com "- "; se não houver, um item dizendo que está tudo em dia)',
  '## Sugestões',
  '(até 3 itens começando com "- ")',
  'Pode usar **negrito** em poucas palavras. Não use tabelas, links nem outros títulos.',
].join('\n');

/** Centavos → "R$ 1.234,56" com espaço comum. */
const reais = (centavos) => formatarCentavos(centavos).replace(/ /g, ' ');

/** "2026-11" → "novembro de 2026". */
const mesPorExtenso = (mes) => tituloDoMes(mes).toLowerCase();

/** "2026-11-10" → "10/11". */
const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** Cor do app com o que ela quer dizer. */
const COR = {
  verde: 'verde (no ritmo)',
  amarelo: 'amarelo (acelerado)',
  vermelho: 'vermelho (passou do orçamento)',
  neutro: 'sem orçamento',
};

/**
 * Monta a mensagem da análise do mês atual.
 *
 * @param {object} estado Os dados do app.
 * @param {string} hoje   "AAAA-MM-DD".
 * @param {object} [limites] Padrão: LIMITES_PADRAO.
 * @returns {{ instrucoes: string, conteudo: string }}
 */
export function mensagemDoMes(estado, hoje, limites = LIMITES_PADRAO) {
  const mes = mesDaData(hoje);
  const r = resumoDoMes(estado, mes, hoje, limites);
  const linhas = [];

  linhas.push(`Mês: ${mesPorExtenso(mes)}. Hoje é dia ${r.dia} de ${r.diasNoMes} (${Math.round(r.fracaoDoMes * 100)}% do mês).`);
  linhas.push('');
  linhas.push('Dinheiro do mês:');
  linhas.push(`- Dinheiro do mês (saldo inicial + renda prevista): ${reais(r.dinheiroDoMesCentavos)}` +
    `${r.saldoConfirmado ? '' : ' (o saldo inicial ainda não foi confirmado pela pessoa)'}.`);
  linhas.push(`- Já pago: ${reais(r.jaPago.totalCentavos)} (contas fixas ${reais(r.jaPago.fixosCentavos)}, ` +
    `gastos à vista ${reais(r.jaPago.gastosCentavos)}, faturas ${reais(r.jaPago.faturasCentavos)}).`);
  linhas.push(`- Ainda previsto para sair: ${reais(r.previstoCentavos)}.`);
  linhas.push(`- Deve sobrar no fim do mês: ${reais(r.deveSobrarCentavos)}. Folga mínima que o app usa: ${reais(limites.colchaoSaldoCentavos)}.`);

  linhas.push('');
  linhas.push('Categorias (gasto no mês / orçamento):');
  if (r.categorias.length === 0) linhas.push('- Nenhuma categoria.');
  for (const c of r.categorias) {
    if (c.orcamentoCentavos === 0) {
      linhas.push(`- ${c.categoria.nome}: ${reais(c.gastoCentavos)} gastos, sem orçamento.`);
    } else {
      linhas.push(`- ${c.categoria.nome}: ${reais(c.gastoCentavos)} de ${reais(c.orcamentoCentavos)} ` +
        `(${Math.round(c.fracaoUsada * 100)}% usado); ` +
        `${c.margemCentavos >= 0 ? `sobram ${reais(c.margemCentavos)}` : `passou ${reais(-c.margemCentavos)}`}; cor ${COR[c.cor]}.`);
    }
  }

  linhas.push('');
  const { previstas, atrasadas, pagas, dispensadas } = r.contagemFixos;
  linhas.push(`Contas fixas: ${pagas} paga(s), ${previstas} prevista(s) (${atrasadas} atrasada(s)), ${dispensadas} dispensada(s).`);
  for (const f of r.fixos.filter((item) => item.status === 'previsto')) {
    linhas.push(`- ${f.fixo.nome}: ${reais(f.valorCentavos)}, dia ${f.diaEfetivo}${f.atrasado ? ', ATRASADA' : ''}` +
      `${f.parcela ? `, parcela ${f.parcela.atual} de ${f.parcela.total}` : ''}.`);
  }

  // Faturas do mês e limite de cada cartão.
  if (r.faturas.length > 0) {
    linhas.push('');
    linhas.push('Faturas do cartão neste mês:');
    const visao = dadosDoMes(estado, mes);
    for (const f of r.faturas) {
      const cartao = (estado.cartoes ?? []).find((c) => c.formaPagamento === f.formaPagamento);
      const limite = limiteDoCartao({
        cartao, lancamentos: estado.lancamentos, registroMes: visao.registroMes, fixos: estado.fixos, meses: estado.meses, hoje,
      });
      const situacao = f.status === 'pago' ? 'paga' : (f.atrasada ? 'ATRASADA' : 'prevista');
      linhas.push(`- ${f.formaPagamento}: vence ${dataCurta(f.vencimento)}, ${situacao}; compras ${reais(f.totalCentavos)}` +
        `${f.contasFixasCentavos > 0 ? `, mais ${reais(f.contasFixasCentavos)} de contas fixas (total no banco ${reais(f.totalNoBancoCentavos)})` : ''}; ` +
        `limite disponível ${reais(limite.disponivelCentavos)} de ${reais(limite.limiteCentavos)}.`);
    }
  }

  // Gastos: total e os maiores.
  linhas.push('');
  const totalGastos = r.gastos.reduce((soma, g) => soma + g.lancamento.valorCentavos, 0);
  linhas.push(`Gastos lançados no mês: ${r.gastos.length}, somando ${reais(totalGastos)}.`);
  const maiores = [...r.gastos].sort((a, b) => b.lancamento.valorCentavos - a.lancamento.valorCentavos).slice(0, 3);
  for (const g of maiores) {
    const parcelas = (g.lancamento.parcelas ?? 1) > 1 ? ` em ${g.lancamento.parcelas}x` : '';
    linhas.push(`- ${g.nomeCategoria}: ${reais(g.lancamento.valorCentavos)} em ${dataCurta(g.lancamento.data)} ` +
      `(${g.lancamento.formaPagamento}${parcelas}).`);
  }

  // Próximos meses: a mesma estimativa do veredito e do simulador.
  const projecao = projetarMeses(dadosDoMes(estado, mes), MESES_ESTIMADOS).slice(1);
  linhas.push('');
  linhas.push('Próximos meses (estimativa do app com a renda e os orçamentos de agora):');
  for (const p of projecao) linhas.push(`- ${mesPorExtenso(p.mes)}: deve sobrar ${reais(p.sobraCentavos)}.`);

  linhas.push('');
  linhas.push('Analise este mês para a pessoa.');

  return { instrucoes: INSTRUCOES_ANALISE, conteudo: linhas.join('\n').replace(/ /g, ' ') };
}

/* ------------------------------------------------------------------ */
/* Leitura da resposta                                                */
/* ------------------------------------------------------------------ */

/** Tira o itálico de markdown ("*palavra*" → "palavra"), que a tela não usa. */
const semItalico = (texto) => texto.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2');

/**
 * Separa "**negrito**" em pedaços: "a **b** c" → [{a}, {b, negrito}, {c}].
 * O itálico ("*palavra*") vira texto comum; asteriscos sem par ficam como texto.
 *
 * @param {string} texto
 * @returns {{ texto: string, negrito: boolean }[]}
 */
export function trechosDaLinha(texto) {
  const trechos = [];
  const padrao = /\*\*(.+?)\*\*/g;
  let ultimo = 0;
  for (const achado of texto.matchAll(padrao)) {
    if (achado.index > ultimo) trechos.push({ texto: semItalico(texto.slice(ultimo, achado.index)), negrito: false });
    trechos.push({ texto: achado[1], negrito: true });
    ultimo = achado.index + achado[0].length;
  }
  if (ultimo < texto.length) trechos.push({ texto: semItalico(texto.slice(ultimo)), negrito: false });
  return trechos.filter((t) => t.texto !== '');
}

/**
 * Lê a resposta da IA em blocos para a tela:
 * - "## Título" (ou "# ") → { tipo: 'titulo' };
 * - linhas seguidas com "- " ou "* " → um { tipo: 'lista', itens };
 * - o resto → { tipo: 'paragrafo' } (linhas seguidas viram um parágrafo só).
 * Cada texto vem em trechos (negrito ou não).
 *
 * @param {string} resposta
 * @returns {({ tipo: 'titulo'|'paragrafo', trechos: object[] } | { tipo: 'lista', itens: object[][] })[]}
 */
export function blocosDaResposta(resposta) {
  const blocos = [];
  let paragrafo = [];
  let lista = null;

  const fecharParagrafo = () => {
    if (paragrafo.length > 0) blocos.push({ tipo: 'paragrafo', trechos: trechosDaLinha(paragrafo.join(' ')) });
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista) blocos.push({ tipo: 'lista', itens: lista });
    lista = null;
  };

  for (const bruta of resposta.split('\n')) {
    const linha = bruta.trim();
    const titulo = /^#{1,6}\s+(.*)$/.exec(linha);
    const item = /^[-*•]\s+(.*)$/.exec(linha);

    if (linha === '') {
      fecharParagrafo();
      fecharLista();
    } else if (titulo) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ tipo: 'titulo', trechos: trechosDaLinha(titulo[1].replace(/\*\*/g, '')) });
    } else if (item) {
      fecharParagrafo();
      lista ??= [];
      lista.push(trechosDaLinha(item[1]));
    } else {
      fecharLista();
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

/**
 * A resposta em texto limpo para copiar: títulos em linha própria, itens
 * com "• ", sem os asteriscos do negrito.
 *
 * @param {object[]} blocos Resultado de blocosDaResposta.
 * @returns {string}
 */
export function textoParaCopiar(blocos) {
  const juntar = (trechos) => trechos.map((t) => t.texto).join('');
  return blocos.map((b) => {
    if (b.tipo === 'lista') return b.itens.map((item) => `• ${juntar(item)}`).join('\n');
    return juntar(b.trechos);
  }).join('\n\n');
}

/* ------------------------------------------------------------------ */
/* Última análise guardada                                            */
/* ------------------------------------------------------------------ */

/**
 * Monta o registro da última análise (o que fica guardado no aparelho).
 *
 * @param {string} mes   "AAAA-MM" analisado.
 * @param {string} texto A resposta da IA, como veio.
 * @param {Date}   [agora]
 * @returns {{ mes: string, texto: string, geradaEm: string }}
 */
export function criarAnaliseGuardada(mes, texto, agora = new Date()) {
  return { mes, texto, geradaEm: agora.toISOString() };
}

/**
 * A análise guardada, se ela for do mês pedido (a de outro mês não vale mais).
 *
 * @param {object|null|undefined} guardada
 * @param {string} mes "AAAA-MM".
 * @returns {object|null}
 */
export function analiseDoMes(guardada, mes) {
  if (!guardada || guardada.mes !== mes || typeof guardada.texto !== 'string' || guardada.texto === '') return null;
  return guardada;
}

/**
 * Quando a análise foi feita, em palavras: "hoje às 14:52", "ontem às 09:10"
 * ou "em 08/10 às 14:52" (horário do aparelho).
 *
 * @param {string} geradaEm ISO 8601.
 * @param {Date}   [agora]
 * @returns {string}
 */
export function quandoFoiFeita(geradaEm, agora = new Date()) {
  const momento = new Date(geradaEm);
  const dia = hojeLocal(momento);
  const hoje = hojeLocal(agora);
  const hora = `${String(momento.getHours()).padStart(2, '0')}:${String(momento.getMinutes()).padStart(2, '0')}`;
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === somarDias(hoje, -1)) return `ontem às ${hora}`;
  return `em ${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${hora}`;
}
