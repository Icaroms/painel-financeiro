/**
 * Mensagens para a IA explicar uma compra (Fase 03, parte 3.2).
 *
 * O app já calculou tudo com as regras. Aqui só se monta o TEXTO que vai
 * para o Gemini: as instruções (o papel da IA e as regras de resposta) e
 * o conteúdo (os números prontos, em frases simples, em português).
 *
 * Por decisão de 10/10/2026, podem ir nomes de categorias, de contas e de
 * cartões, junto com os números. Nunca vão nome, e-mail ou senhas.
 *
 * Funções puras: testadas no Node. A chamada fica em src/ia.js e os
 * botões em src/ui/explicar.js.
 */

import { formatarCentavos } from './dinheiro.js';
import { tituloDoMes, diaDaData, diasNoMes, mesDaData } from './datas.js';
import { LIMITES_PADRAO } from './veredito.js';

/** O papel da IA e as regras de resposta (iguais para a compra e o simulador). */
export const INSTRUCOES_EXPLICAR = [
  'Você é o assistente do Painel Financeiro, um app pessoal de finanças usado no Brasil.',
  'O app já calculou tudo com regras fixas. A sua tarefa é só EXPLICAR o resultado para a pessoa.',
  'Regras:',
  '1. Use apenas os números fornecidos. Não invente valores e não refaça as contas do app.',
  '2. Não mude o veredito do app (verde, amarelo ou vermelho): explique por que ele saiu assim.',
  '3. Responda em português do Brasil, em 2 a 4 frases curtas, num tom direto e gentil.',
  '4. Diga o que mais pesou no resultado. Se não for verde, mostre até duas alternativas tiradas dos dados',
  '   (por exemplo: menos parcelas, esperar o mês indicado, um valor menor), sempre como opções, nunca como ordem.',
  '5. Não recomende investimentos, empréstimos nem produtos financeiros.',
  '6. Escreva só texto corrido: sem títulos, listas, negrito, markdown ou emojis.',
].join('\n');

/** Centavos → "R$ 1.234,56" com espaço comum (o Intl usa um espaço especial). */
const reais = (centavos) => formatarCentavos(centavos).replace(/ /g, ' ');

/** Junta as linhas; troca o espaço especial do Intl (também presente na frase do veredito) por um comum. */
const texto = (linhas) => linhas.join('\n').replace(/\u00a0/g, ' ');

/** "2026-11" → "novembro de 2026". */
const mesPorExtenso = (mes) => tituloDoMes(mes).toLowerCase();

/** "2026-11-10" → "10/11/2026". */
const dataCompleta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

/** Nome do veredito com o que ele quer dizer. */
const VEREDITO = {
  verde: 'VERDE (cabe)',
  amarelo: 'AMARELO (atenção)',
  vermelho: 'VERMELHO (passou)',
};

/** Porcentagem inteira para o texto: 74.6 → "75%". */
const porcento = (valor) => `${Math.round(valor)}%`;

/**
 * Mensagem para explicar o veredito de uma compra na tela Lançar.
 *
 * @param {object} painel O resultado de calcularPainel (src/painel.js), com valor válido.
 * @param {object} contexto
 * @param {string} contexto.hoje "AAAA-MM-DD".
 * @param {object} [limites] Padrão: LIMITES_PADRAO (colchão e tolerância do ritmo).
 * @returns {{ instrucoes: string, conteudo: string }}
 */
export function mensagemDaCompra(painel, { hoje }, limites = LIMITES_PADRAO) {
  const { numeros, categoria, formaPagamento, limite, lancamento } = painel;
  const linhas = [];

  linhas.push(`Compra que a pessoa está avaliando (ainda NÃO foi lançada): ${reais(lancamento.valorCentavos)}.`);
  linhas.push(`Hoje é ${dataCompleta(hoje)}, dia ${diaDaData(hoje)} de ${diasNoMes(mesDaData(hoje))} do mês.`);

  // Categoria: orçamento, margem e ritmo.
  if (numeros.margem) {
    const { gastoAntesCentavos, gastoDepoisCentavos, margemCentavos } = numeros.margem;
    linhas.push(
      `Categoria: ${categoria.nome}. Orçamento do mês: ${reais(categoria.orcamentoCentavos)}. ` +
      `Já gasto antes desta compra: ${reais(gastoAntesCentavos)}. Com a compra: ${reais(gastoDepoisCentavos)}. ` +
      (margemCentavos >= 0
        ? `Sobram ${reais(margemCentavos)} na categoria.`
        : `Passa do orçamento da categoria em ${reais(-margemCentavos)}.`),
    );
    const { percentualUsado, percentualDoMes, acelerado } = numeros.ritmo;
    linhas.push(
      `Ritmo: ${porcento(percentualUsado)} do orçamento usado com ${porcento(percentualDoMes)} do mês passado ` +
      `(o app considera acelerado quando o uso passa o mês em mais de ${limites.toleranciaRitmoPontos} pontos): ` +
      `${acelerado ? 'acelerado' : 'dentro do ritmo'}.`,
    );
  } else {
    linhas.push(`Categoria: ${categoria.nome}, sem orçamento definido (vale só o saldo do mês).`);
  }

  // Pagamento: à vista ou no cartão (parcelas e quando a 1ª é paga).
  const saidas = numeros.saidas;
  if (saidas[0].cartao) {
    const parcelas = saidas.length;
    const comoPaga = parcelas === 1
      ? 'à vista no cartão'
      : `em ${parcelas}x de ${reais(saidas[parcelas - 1].valorCentavos)}`;
    linhas.push(`Pagamento: ${formaPagamento}, ${comoPaga}; a 1ª parcela é paga em ${dataCompleta(saidas[0].vencimento)}.`);
  } else {
    linhas.push(`Pagamento: ${formaPagamento}, o dinheiro sai da conta agora.`);
  }

  // Saldo: o mês atual ou o pior mês com parcela (estimativa).
  linhas.push(numeros.estimativa
    ? `Saldo: com esta compra, o mês mais apertado com parcela é ${mesPorExtenso(numeros.mesDoSaldo)}, que deve fechar em ` +
      `${reais(numeros.saldoProjetadoCentavos)} (estimativa do app com a renda e os orçamentos de agora).`
    : `Saldo: com esta compra, o mês deve fechar em ${reais(numeros.saldoProjetadoCentavos)}.`);
  linhas.push(`Folga mínima de saldo que o app usa: ${reais(limites.colchaoSaldoCentavos)}.`);

  // Limite do cartão.
  if (limite) {
    linhas.push(
      `Limite do ${formaPagamento}: ${reais(limite.disponivelCentavos)} disponíveis de ${reais(limite.limiteCentavos)} antes da compra; ` +
      `${reais(limite.disponivelCentavos - lancamento.valorCentavos)} depois.`,
    );
  }

  linhas.push(`Veredito do app: ${VEREDITO[painel.cor]}. Frase do app: "${painel.frase}"`);
  linhas.push('Explique esse veredito para a pessoa.');

  return { instrucoes: INSTRUCOES_EXPLICAR, conteudo: texto(linhas) };
}

/**
 * Mensagem para explicar uma opção do simulador de compras.
 *
 * @param {object} opcao Uma opção de simularCompra (src/simulador.js).
 * @param {object} contexto
 * @param {string} contexto.formaPagamento O cartão.
 * @param {number} contexto.aVistaCentavos Preço à vista.
 * @param {string} contexto.hoje "AAAA-MM-DD".
 * @param {object} [limites]
 * @returns {{ instrucoes: string, conteudo: string }}
 */
export function mensagemDaOpcaoSimulada(opcao, { formaPagamento, aVistaCentavos, hoje }, limites = LIMITES_PADRAO) {
  const linhas = [];
  const comoPaga = opcao.parcelas === 1
    ? `à vista no ${formaPagamento}, por ${reais(opcao.totalCentavos)}`
    : `em ${opcao.parcelas}x de ${reais(opcao.valorParcelaCentavos)} no ${formaPagamento} (total ${reais(opcao.totalCentavos)})`;

  linhas.push(`Simulação (nada foi comprado nem gravado): compra ${comoPaga}. Preço à vista: ${reais(aVistaCentavos)}.`);
  if (opcao.parcelas > 1) {
    linhas.push(opcao.jurosCentavos > 0
      ? `Juros: ${reais(opcao.jurosCentavos)}, cerca de ${(opcao.taxaMensal * 100).toFixed(1).replace('.', ',')}% ao mês.`
      : 'Sem juros.');
  }
  linhas.push(opcao.compraFutura
    ? `Compra simulada para ${dataCompleta(opcao.dataDaCompra)} (hoje é ${dataCompleta(hoje)}).`
    : `Compra feita hoje, ${dataCompleta(hoje)}.`);
  linhas.push(`1ª parcela paga em ${dataCompleta(opcao.primeiroVencimento)}.`);

  const { limiteCentavos, disponivelDepoisCentavos, estimativa } = opcao.limite;
  linhas.push(`Limite do cartão depois da compra: ${reais(disponivelDepoisCentavos)} de ${reais(limiteCentavos)}` +
    `${estimativa ? ' (estimativa)' : ''}.`);
  linhas.push(`Mês mais apertado com parcela: ${mesPorExtenso(opcao.piorMes.mes)}, com ${reais(opcao.piorMes.sobraCentavos)} de sobra` +
    `${opcao.estimativa ? ' (estimativa do app com a renda e os orçamentos de agora)' : ''}.`);
  linhas.push(`Folga mínima de saldo que o app usa: ${reais(limites.colchaoSaldoCentavos)}.`);

  // O "quando comprar" que o app calculou.
  const { esperaMeses, mesDaCompra, piorMes, piorMesAgora, terminam } = opcao.melhorMomento;
  if (esperaMeses === 0) {
    linhas.push('Quando comprar, segundo o app: agora (nenhum mês com parcela fica abaixo da folga).');
  } else if (esperaMeses === null) {
    linhas.push(`Quando comprar, segundo o app: não cabe acima da folga nos próximos 12 meses. ` +
      `Comprando agora, o mais apertado seria ${mesPorExtenso(piorMesAgora.mes)}, com ${reais(piorMesAgora.sobraCentavos)}.`);
  } else {
    const motivo = terminam.length > 0
      ? ` Parcelamentos que terminam antes: ${terminam.map((t) => `${t.nome} em ${mesPorExtenso(t.mes)}`).join('; ')}.`
      : '';
    linhas.push(`Quando comprar, segundo o app: a partir de ${mesPorExtenso(mesDaCompra)}. ` +
      `Comprando agora, o mais apertado ficaria com ${reais(piorMesAgora.sobraCentavos)}; ` +
      `comprando em ${mesPorExtenso(mesDaCompra)}, com ${reais(piorMes.sobraCentavos)}.${motivo}`);
  }

  linhas.push(`Veredito do app para esta opção: ${VEREDITO[opcao.cor]}.`);
  linhas.push('Explique esta opção para a pessoa: o custo dos juros (se houver), o peso nos meses e o momento de comprar.');

  return { instrucoes: INSTRUCOES_EXPLICAR, conteudo: texto(linhas) };
}
