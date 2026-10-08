/**
 * Painel: transforma os dados e o que a pessoa digitou em TUDO o que a
 * tela de lançamento mostra (cor, frase, números e posição do ponteiro).
 *
 * A tela (src/ui/app.js) só copia estes valores para o HTML. Toda a
 * decisão fica aqui, numa função pura que pode ser testada no Node.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, diaDaData, diasNoMes, ehDataValida } from './datas.js';
import { reaisParaCentavos, formatarCentavos } from './dinheiro.js';
import { criarLancamento } from './modelo.js';
import { avaliarGasto, calcularMargemCategoria, calcularSaldoProjetado } from './veredito.js';
import { geometriaMostrador } from './mostrador.js';

const nomeDoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-11" → "Novembro de 2026". */
export function tituloDoMes(mes) {
  const [ano, numero] = mes.split('-').map(Number);
  const texto = nomeDoMes.format(new Date(Date.UTC(ano, numero - 1, 1)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

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
export function calcularPainel({ dados, valorTexto, categoriaId, formaPagamento, hoje, data = hoje }) {
  const { registroMes, categorias, fixos, lancamentos } = dados;

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

  if (valor !== null && problemaData === null) {
    // Há valor: o veredito completo, com as regras do app.
    // O gasto é guardado com a data escolhida, mas o veredito julga o mês
    // como ele está HOJE: o ritmo compara o que já foi gasto com o dia de hoje.
    lancamento = criarLancamento({ valorCentavos: valor, categoriaId, formaPagamento, data });
    const resultado = avaliarGasto({
      lancamento: { ...lancamento, data: hoje },
      categoria,
      registroMes,
      fixos,
      lancamentos,
    });
    cor = resultado.cor;
    frase = resultado.frase;
    saldoProjetado = resultado.numeros.saldoProjetadoCentavos;
    margem = resultado.numeros.margem;
  } else {
    // Sem valor: mostra a situação atual, sem julgar nada.
    const doMes = lancamentos.filter(
      (l) => l.excluidoEm === null && mesDaData(l.data) === registroMes.mes,
    );
    cor = 'neutro';
    frase = problemaData ?? 'Digite um valor para ver o veredito.';
    saldoProjetado = calcularSaldoProjetado(registroMes, fixos, doMes, 0).saldoProjetadoCentavos;
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
    linhaSaldo: lancamento !== null
      ? `Com este gasto, o mês fecha em ${formatarCentavos(saldoProjetado)}`
      : `O mês fecha em ${formatarCentavos(saldoProjetado)}`,
    numero: formatarCentavos(temOrcamento ? margem.margemCentavos : saldoProjetado),
    legenda,
    usadoTexto: temOrcamento ? `Usado: ${Math.round(fracaoUsada * 100)}%` : 'Sem orçamento',
    hojeTexto: `Hoje: ${Math.round((dia / dias) * 100)}% do mês`,
    mostrador: geometriaMostrador({ fracaoUsada, fracaoDoMes: dia / dias }),
  };
}
