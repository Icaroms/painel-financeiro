/**
 * Conversão das parcelas que já existem como contas fixas (Fase 02, parte 2.3).
 *
 * Antes da Fase 02, uma compra parcelada no cartão (o Remador, a Amazon, o
 * Anel) só podia ser cadastrada como conta fixa parcelada. Agora o app
 * entende o cartão: a conversão troca a conta fixa por uma COMPRA
 * PARCELADA no cartão, e as parcelas que faltam passam a entrar nas faturas.
 *
 * Exemplo (hoje é outubro de 2026):
 *   Conta fixa: Remador, R$ 117,53, parcela 3 de 12, no Cartão Careca
 *   → Compra no Careca: 12 x R$ 117,53, parcelas 1 e 2 já pagas
 *   → As parcelas 3 a 12 entram nas faturas de outubro/2026 a julho/2027
 *   → A conta fixa termina em setembro/2026 (os meses passados não mudam)
 *
 * Regras:
 * - Só contas fixas PARCELADAS (com mês final), com valor maior que zero e
 *   pagas numa forma de pagamento que é cartão cadastrado.
 * - A parcela deste mês já paga (marcada como Paga, ou paga sozinha pelo
 *   pagamento automático) ou dispensada fica como está: a conversão começa
 *   no mês seguinte. Se não sobra nenhuma parcela, não há o que converter.
 * - A compra convertida NÃO conta como consumo (orçamento, histórico,
 *   lista de gastos): ela aconteceu antes de o app existir. Ela só pesa no
 *   SALDO, pelas parcelas que faltam (veja contaComoConsumo, em src/modelo.js).
 * - A conversão pode ser desfeita: a conta fixa volta como era.
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/configurar.js.
 */

import { ErroValidacao } from './erros.js';
import { somarMeses, mesesEntre, hojeLocal, tituloDoMes } from './datas.js';
import { criarLancamento, fixoAtivoNoMes, excluirRegistro, MAXIMO_PARCELAS_COMPRA } from './modelo.js';
import { statusDoFixoNoMes } from './fixos.js';
import { buscarMes } from './meses.js';
import { cartaoDaForma } from './cartoes.js';
import { saidasDoLancamento } from './fluxo.js';

/**
 * Valor guardado no campo categoriaId das compras convertidas.
 * Não é uma categoria de verdade: a compra convertida não conta como
 * consumo, então ela não pertence a nenhuma categoria do mês.
 */
export const CATEGORIA_DA_CONVERSAO = 'conversao-de-conta-fixa';

/**
 * Primeiro mês que a conversão leva para a fatura:
 * - o mês de referência, se a parcela dele ainda está prevista;
 * - o mês seguinte, se a parcela dele já foi paga ou dispensada;
 * - o mês inicial da conta, se ela só começa no futuro.
 */
function primeiroMesDaConversao(estado, fixo, mesReferencia, hoje) {
  if (fixo.mesInicial > mesReferencia) return fixo.mesInicial;

  const registro = buscarMes(estado, mesReferencia);
  if (registro && fixoAtivoNoMes(fixo, mesReferencia)) {
    const { status } = statusDoFixoNoMes(fixo, registro, hoje);
    if (status !== 'previsto') return somarMeses(mesReferencia, 1);
  }
  return mesReferencia;
}

/**
 * Plano de conversão de uma conta fixa, ou null se ela não é uma conta
 * parcelada num cartão ou se não sobra parcela para converter.
 *
 * @returns {object|null} Veja contasParaConverter.
 */
function planoDaConversao(estado, fixo, mesReferencia, hoje) {
  if (fixo.excluidoEm !== null || fixo.mesFinal === null) return null;
  const cartao = cartaoDaForma(estado, fixo.formaPagamento);
  if (!cartao) return null;

  const mesPrimeira = primeiroMesDaConversao(estado, fixo, mesReferencia, hoje);
  if (mesPrimeira > fixo.mesFinal) return null; // nenhuma parcela sobrando

  const total = mesesEntre(fixo.mesInicial, fixo.mesFinal);
  const parcelasPagas = mesesEntre(fixo.mesInicial, mesPrimeira) - 1;
  const restantes = total - parcelasPagas;

  let motivo = null;
  if (fixo.valorCentavos === 0) {
    motivo = 'A conta está com valor zero. Defina o valor da parcela antes de converter.';
  } else if (total > MAXIMO_PARCELAS_COMPRA) {
    motivo = `Uma compra no cartão aceita até ${MAXIMO_PARCELAS_COMPRA} parcelas; esta tem ${total}.`;
  }

  return {
    fixo,
    cartao,
    total,
    parcelasPagas,
    restantes,
    primeiraParcela: parcelasPagas + 1,
    valorParcelaCentavos: fixo.valorCentavos,
    valorRestanteCentavos: fixo.valorCentavos * restantes,
    mesPrimeira,
    mesUltima: fixo.mesFinal,
    // A conta fixa termina no mês antes da conversão; se nenhuma parcela
    // foi paga como conta fixa, ela é excluída (não sobra mês nenhum dela).
    fixoTerminaEm: parcelasPagas > 0 ? somarMeses(mesPrimeira, -1) : null,
    motivo,
  };
}

/**
 * Contas fixas parceladas em cartões cadastrados que ainda têm parcelas a pagar.
 *
 * @param {object} estado
 * @param {string} mesReferencia "AAAA-MM" (o mês atual).
 * @param {string} [hoje]        "AAAA-MM-DD" (para o pagamento automático).
 * @returns {{
 *   fixo: object, cartao: object,
 *   total: number,               // parcelas da compra inteira (12 no Remador)
 *   parcelasPagas: number,       // pagas como conta fixa (2 no Remador)
 *   restantes: number,           // vão para as faturas (10 no Remador)
 *   primeiraParcela: number,     // a primeira que vai para a fatura (3)
 *   valorParcelaCentavos: number,
 *   valorRestanteCentavos: number,
 *   mesPrimeira: string, mesUltima: string,
 *   fixoTerminaEm: string|null,  // null: a conta fixa é excluída
 *   motivo: string|null          // não null: não dá para converter (e o porquê)
 * }[]} Ordenadas pelo nome da conta.
 */
export function contasParaConverter(estado, mesReferencia, hoje = hojeLocal()) {
  return estado.fixos
    .map((fixo) => planoDaConversao(estado, fixo, mesReferencia, hoje))
    .filter((plano) => plano !== null)
    .sort((a, b) => a.fixo.nome.localeCompare(b.fixo.nome, 'pt-BR'));
}

/**
 * Converte uma conta fixa parcelada numa compra parcelada no cartão.
 *
 * A compra guarda o valor da compra inteira (parcela x total) e, no campo
 * "conversao", o necessário para as faturas e para desfazer:
 *   { fixoId, primeiraFatura, parcelasPagas, mesFinalAnterior }
 *
 * @param {object} estado
 * @param {string} fixoId
 * @param {string} mesReferencia "AAAA-MM" (o mês atual).
 * @param {object} [opcoes]      { hoje, agora, gerarId }
 * @returns {{ estado: object, lancamento: object, plano: object }}
 */
export function converterFixo(estado, fixoId, mesReferencia, opcoes = {}) {
  const { hoje = hojeLocal(opcoes.agora), agora = new Date() } = opcoes;
  const fixo = estado.fixos.find((f) => f.id === fixoId);
  const plano = fixo ? planoDaConversao(estado, fixo, mesReferencia, hoje) : null;
  if (!plano) {
    throw new ErroValidacao('fixo', 'Esta conta não é uma conta parcelada num cartão com parcelas a pagar.');
  }
  if (plano.motivo) {
    throw new ErroValidacao('fixo', plano.motivo);
  }

  const base = criarLancamento(
    {
      valorCentavos: fixo.valorCentavos * plano.total,
      categoriaId: CATEGORIA_DA_CONVERSAO,
      formaPagamento: fixo.formaPagamento,
      // Data do REGISTRO da conversão (a compra não conta como consumo,
      // então a data não pesa em mês nenhum; as faturas vêm de primeiraFatura).
      data: hoje,
      descricao: fixo.nome,
      parcelas: plano.total,
    },
    { ...opcoes, agora },
  );
  const lancamento = {
    ...base,
    conversao: {
      fixoId: fixo.id,
      primeiraFatura: fixo.mesInicial,
      parcelasPagas: plano.parcelasPagas,
      mesFinalAnterior: fixo.mesFinal,
    },
  };

  const momento = agora.toISOString();
  const fixoNovo = plano.fixoTerminaEm === null
    ? excluirRegistro(fixo, { agora })
    : { ...fixo, mesFinal: plano.fixoTerminaEm, atualizadoEm: momento };

  return {
    estado: {
      ...estado,
      fixos: estado.fixos.map((f) => (f.id === fixo.id ? fixoNovo : f)),
      lancamentos: [...estado.lancamentos, lancamento],
    },
    lancamento,
    plano,
  };
}

/**
 * Compras convertidas que ainda existem (para a lista "Já convertidas"
 * e o botão Desfazer).
 *
 * @param {object} estado
 * @returns {{ lancamento: object, valorParcelaCentavos: number, total: number,
 *   parcelasPagas: number, mesPrimeira: string, mesUltima: string }[]}
 */
export function comprasConvertidas(estado) {
  return estado.lancamentos
    .filter((l) => l.excluidoEm === null && l.conversao)
    .map((lancamento) => {
      const { primeiraFatura, parcelasPagas } = lancamento.conversao;
      return {
        lancamento,
        valorParcelaCentavos: lancamento.valorCentavos / lancamento.parcelas,
        total: lancamento.parcelas,
        parcelasPagas,
        mesPrimeira: somarMeses(primeiraFatura, parcelasPagas),
        mesUltima: somarMeses(primeiraFatura, lancamento.parcelas - 1),
      };
    })
    .sort((a, b) => a.lancamento.descricao.localeCompare(b.lancamento.descricao, 'pt-BR'));
}

/**
 * Meses em que a fatura do cartão já está marcada como Paga e tem uma
 * parcela desta compra convertida. Ao desfazer, a parcela desses meses
 * volta a ser conta fixa Prevista.
 *
 * Só olha os meses que existem nos dados (a situação da fatura fica
 * guardada no mês).
 *
 * @param {object} estado
 * @param {string} lancamentoId
 * @returns {{ mes: string, numero: number, total: number }[]} Do mais antigo ao mais novo.
 */
export function faturasPagasComAParcela(estado, lancamentoId) {
  const lancamento = estado.lancamentos.find((l) => l.id === lancamentoId && l.excluidoEm === null);
  if (!lancamento?.conversao) return [];

  return saidasDoLancamento(lancamento, estado.cartoes ?? [])
    .filter((saida) => buscarMes(estado, saida.mes)?.statusFaturas?.[lancamento.formaPagamento] === 'pago')
    .map((saida) => ({ mes: saida.mes, numero: saida.numero, total: saida.total }));
}

/**
 * Texto de aviso para a confirmação do Desfazer, ou null se nenhuma
 * fatura paga tem parcela desta compra.
 *
 * Ex.: "Atenção: a fatura de outubro de 2026 do Cartão Careca já está Paga.
 *      A parcela 3/12 desse mês volta a ser conta fixa Prevista: marque
 *      como Paga de novo na aba Mês."
 *
 * @param {object} estado
 * @param {string} lancamentoId
 * @returns {string|null}
 */
export function avisoAoDesfazer(estado, lancamentoId) {
  const pagas = faturasPagasComAParcela(estado, lancamentoId);
  if (pagas.length === 0) return null;

  const { formaPagamento } = estado.lancamentos.find((l) => l.id === lancamentoId);
  const mesExtenso = (mes) => tituloDoMes(mes).toLowerCase();
  const parcela = (p) => `${p.numero}/${p.total}`;

  if (pagas.length === 1) {
    const [p] = pagas;
    return `Atenção: a fatura de ${mesExtenso(p.mes)} do ${formaPagamento} já está Paga. ` +
      `A parcela ${parcela(p)} desse mês volta a ser conta fixa Prevista: marque como Paga de novo na aba Mês.`;
  }
  const juntar = (lista) => `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
  return `Atenção: as faturas de ${juntar(pagas.map((p) => mesExtenso(p.mes)))} do ${formaPagamento} já estão Pagas. ` +
    `As parcelas ${juntar(pagas.map(parcela))} desses meses voltam a ser conta fixa Prevista: ` +
    'marque como Pagas de novo na aba Mês.';
}

/**
 * Desfaz uma conversão: a compra é excluída e a conta fixa volta como
 * era (mesmo mês final; se tinha sido excluída, volta a existir).
 *
 * Atenção: uma fatura já marcada como Paga num mês continua paga; a
 * parcela daquele mês volta a ser conta fixa Prevista e precisa ser
 * marcada como Paga de novo. A tela avisa antes (veja avisoAoDesfazer).
 *
 * @param {object} estado
 * @param {string} lancamentoId
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function desfazerConversao(estado, lancamentoId, { agora = new Date() } = {}) {
  const lancamento = estado.lancamentos.find((l) => l.id === lancamentoId && l.excluidoEm === null);
  if (!lancamento?.conversao) {
    throw new ErroValidacao('lancamento', 'Esta compra não veio de uma conversão.');
  }
  const { fixoId, mesFinalAnterior } = lancamento.conversao;
  const fixo = estado.fixos.find((f) => f.id === fixoId);
  if (!fixo) {
    throw new ErroValidacao('fixo', 'A conta fixa original não foi encontrada.');
  }

  const momento = agora.toISOString();
  const fixoDeVolta = { ...fixo, mesFinal: mesFinalAnterior, excluidoEm: null, atualizadoEm: momento };
  return {
    ...estado,
    fixos: estado.fixos.map((f) => (f.id === fixoId ? fixoDeVolta : f)),
    lancamentos: estado.lancamentos.map((l) => (l.id === lancamentoId ? excluirRegistro(l, { agora }) : l)),
  };
}
