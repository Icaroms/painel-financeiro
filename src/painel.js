/**
 * Painel: transforma os dados e o que a pessoa digitou em TUDO o que a
 * tela de lançamento mostra (cor, frase, números e posição do ponteiro).
 *
 * A tela (src/ui/app.js) só copia estes valores para o HTML. Toda a
 * decisão fica aqui, numa função pura que pode ser testada no Node.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, diaDaData, diasNoMes } from './datas.js';
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
 * @param {object} entrada
 * @param {object} entrada.dados          { registroMes, categorias, fixos, lancamentos }
 * @param {string} entrada.valorTexto     O que está no campo de valor (ex.: "40,00").
 * @param {string} entrada.categoriaId    id da categoria escolhida.
 * @param {string} entrada.formaPagamento Forma de pagamento escolhida.
 * @param {string} entrada.hoje           "AAAA-MM-DD".
 * @returns {object} Tudo o que a tela mostra; `lancamento` é o gasto pronto
 *                   para gravar, ou null quando não há valor válido.
 */
export function calcularPainel({ dados, valorTexto, categoriaId, formaPagamento, hoje }) {
  const { registroMes, categorias, fixos, lancamentos } = dados;

  const categoria = categorias.find((c) => c.id === categoriaId);
  if (!categoria) {
    throw new ErroValidacao('categoriaId', 'Categoria não encontrada.');
  }

  const valor = valorDigitado(valorTexto);
  const temOrcamento = categoria.orcamentoCentavos > 0;

  let cor;
  let frase;
  let lancamento = null;
  let saldoProjetado;
  let margem = null;

  if (valor !== null) {
    // Há valor: o veredito completo, com as regras do app.
    lancamento = criarLancamento({ valorCentavos: valor, categoriaId, formaPagamento, data: hoje });
    const resultado = avaliarGasto({ lancamento, categoria, registroMes, fixos, lancamentos });
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
    frase = 'Digite um valor para ver o veredito.';
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
    linhaSaldo: valor !== null
      ? `Com este gasto, o mês fecha em ${formatarCentavos(saldoProjetado)}`
      : `O mês fecha em ${formatarCentavos(saldoProjetado)}`,
    numero: formatarCentavos(temOrcamento ? margem.margemCentavos : saldoProjetado),
    legenda,
    usadoTexto: temOrcamento ? `Usado: ${Math.round(fracaoUsada * 100)}%` : 'Sem orçamento',
    hojeTexto: `Hoje: ${Math.round((dia / dias) * 100)}% do mês`,
    mostrador: geometriaMostrador({ fracaoUsada, fracaoDoMes: dia / dias }),
  };
}
