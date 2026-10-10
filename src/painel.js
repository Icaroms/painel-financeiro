/**
 * Painel: transforma os dados e o que a pessoa digitou em TUDO o que a
 * tela de lançamento mostra (cor, frase, números e posição do ponteiro).
 *
 * A tela (src/ui/app.js) só copia estes valores para o HTML. Toda a
 * decisão fica aqui, numa função pura que pode ser testada no Node.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, diaDaData, diasNoMes, ehDataValida, tituloDoMes } from './datas.js';
import { reaisParaCentavos, formatarCentavos } from './dinheiro.js';
import { criarLancamento } from './modelo.js';
import {
  avaliarGasto, calcularMargemCategoria, calcularSaldoProjetado, lancamentosValidosDoMes,
} from './veredito.js';
import { geometriaMostrador } from './mostrador.js';
import { saidasNoMes } from './fluxo.js';

// O título do mês mora em datas.js (o veredito também usa); daqui ele é repassado.
export { tituloDoMes } from './datas.js';

/**
 * Converte o texto digitado em centavos, ou null se estiver vazio,
 * inválido ou zero. Na tela, digitar errado não é erro: só não há veredito.
 */
function valorDigitado(texto) {
  try {
    const centavos = reaisParaCentavos(texto);
    return centavos > 0 ? centavos : null;
  } catch {
    return null;
  }
}

/**
 * Confere a data escolhida para um gasto.
 *
 * Um gasto pode ser lançado com data ANTERIOR a hoje (para registrar um
 * gasto esquecido), mas sempre dentro do mês atual e nunca no futuro:
 * o app trabalha com o mês de hoje, e um gasto de outro mês mudaria as
 * contas de um mês que não está na tela.
 *
 * @param {string} data "AAAA-MM-DD".
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {string|null} A mensagem do problema, ou null se a data serve.
 */
export function problemaNaDataDoGasto(data, hoje) {
  if (!ehDataValida(data)) return 'Escolha uma data válida para o gasto.';
  if (data > hoje) return 'A data do gasto não pode ser depois de hoje.';
  if (mesDaData(data) !== mesDaData(hoje)) {
    return `Escolha uma data de ${tituloDoMes(mesDaData(hoje)).toLowerCase()}: o app trabalha com o mês atual.`;
  }
  return null;
}

/**
 * Texto curto de uma compra no cartão, a partir das saídas dela.
 * Ex.: "3x de R$ 40,00 · 1ª parcela paga em 10/11" ou "À vista no cartão · paga em 10/11".
 *
 * @param {object[]} saidas Saídas da compra (src/fluxo.js).
 * @returns {string}
 */
function textoDoCartao(saidas) {
  const primeira = saidas[0];
  const data = dataCurta(primeira.vencimento);
  if (saidas.length === 1) return `À vista no cartão · paga em ${data}`;
  // A 1ª parcela pode ter alguns centavos a mais (resto da divisão): mostra o valor das demais.
  return `${saidas.length}x de ${formatarCentavos(saidas[1].valorCentavos)} · 1ª parcela paga em ${data}`;
}

/** "2026-10-03" → "03/10". */
function dataCurta(data) {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * @param {object} entrada
 * @param {object} entrada.dados          { registroMes, categorias, fixos, lancamentos }
 * @param {string} entrada.valorTexto     O que está no campo de valor (ex.: "40,00").
 * @param {string} entrada.categoriaId    id da categoria escolhida.
 * @param {string} entrada.formaPagamento Forma de pagamento escolhida.
 * @param {string} entrada.hoje           "AAAA-MM-DD".
 * @returns {object} Tudo o que a tela mostra; `lancamento` é o gasto pronto
 *                   para gravar, ou null quando não há valor válido.
 */
export function calcularPainel({ dados, valorTexto, categoriaId, formaPagamento, hoje, data = hoje, parcelas = 1 }) {
  const { registroMes, categorias, fixos, lancamentos } = dados;
  const cartoes = dados.cartoes ?? [];
  const ehCartao = cartoes.some((c) => c.formaPagamento === formaPagamento);

  const categoria = categorias.find((c) => c.id === categoriaId);
  if (!categoria) {
    throw new ErroValidacao('categoriaId', 'Categoria não encontrada.');
  }

  const valor = valorDigitado(valorTexto);
  const temOrcamento = categoria.orcamentoCentavos > 0;
  const problemaData = problemaNaDataDoGasto(data, hoje);
  const dataAnterior = problemaData === null && data !== hoje;

  let cor;
  let frase;
  let lancamento = null;
  let saldoProjetado;
  let margem = null;
  let numerosVeredito = null;

  if (valor !== null && problemaData === null) {
    // Há valor: o veredito completo, com as regras do app.
    // O gasto é guardado com a data escolhida, mas o veredito julga o mês
    // como ele está HOJE: o ritmo compara o que já foi gasto com o dia de hoje.
    lancamento = criarLancamento({
      valorCentavos: valor, categoriaId, formaPagamento, data, parcelas: ehCartao ? parcelas : 1,
    });
    const resultado = avaliarGasto({
      lancamento, categoria, registroMes, fixos, lancamentos, cartoes, categorias, hoje,
    });
    numerosVeredito = resultado.numeros;
    cor = resultado.cor;
    frase = resultado.frase;
    saldoProjetado = resultado.numeros.saldoProjetadoCentavos;
    margem = resultado.numeros.margem;
  } else {
    // Sem valor: mostra a situação atual, sem julgar nada.
    // Consumo do mês (sem as parcelas convertidas de contas fixas, que só pesam no saldo).
    const doMes = lancamentosValidosDoMes(lancamentos, registroMes.mes);
    cor = 'neutro';
    frase = problemaData ?? 'Digite um valor para ver o veredito.';
    // Saldo: o que sai da conta no mês (à vista e faturas). Orçamento: o que foi consumido.
    const saidas = saidasNoMes(lancamentos, cartoes, registroMes.mes);
    saldoProjetado = calcularSaldoProjetado(registroMes, fixos, saidas, 0).saldoProjetadoCentavos;
    margem = temOrcamento ? calcularMargemCategoria(categoria, doMes, 0) : null;
  }

  const dia = diaDaData(hoje);
  const dias = diasNoMes(registroMes.mes);
  const fracaoUsada = temOrcamento ? margem.gastoDepoisCentavos / categoria.orcamentoCentavos : 0;

  let legenda;
  if (!temOrcamento) {
    legenda = `saldo no fim do mês (${categoria.nome} não tem orçamento)`;
  } else if (margem.margemCentavos < 0) {
    legenda = `acima do orçamento de ${categoria.nome}`;
  } else {
    legenda = `sobram em ${categoria.nome} de ${formatarCentavos(categoria.orcamentoCentavos)}`;
  }

  return {
    cor,
    frase,
    lancamento,
    tituloMes: tituloDoMes(registroMes.mes),
    diaTexto: `Dia ${dia} de ${dias}`,
    dataAnterior,
    dataTexto: dataAnterior ? `Gasto do dia ${dataCurta(data)}` : 'Hoje',
    ehCartao,
    // Compra no cartão: "3x de R$ 40,00 · 1ª parcela paga em 10/11".
    cartaoTexto: ehCartao && numerosVeredito
      ? textoDoCartao(numerosVeredito.saidas)
      : (ehCartao ? 'No cartão: entra na fatura, não sai da conta hoje.' : ''),
    linhaSaldo: numerosVeredito?.estimativa
      ? `Com esta compra, ${tituloDoMes(numerosVeredito.mesDoSaldo).toLowerCase()} deve fechar em ${formatarCentavos(saldoProjetado)} (estimativa)`
      : lancamento !== null
      ? `Com este gasto, o mês fecha em ${formatarCentavos(saldoProjetado)}`
      : `O mês fecha em ${formatarCentavos(saldoProjetado)}`,
    numero: formatarCentavos(temOrcamento ? margem.margemCentavos : saldoProjetado),
    legenda,
    usadoTexto: temOrcamento ? `Usado: ${Math.round(fracaoUsada * 100)}%` : 'Sem orçamento',
    hojeTexto: `Hoje: ${Math.round((dia / dias) * 100)}% do mês`,
    mostrador: geometriaMostrador({ fracaoUsada, fracaoDoMes: dia / dias }),
  };
}
