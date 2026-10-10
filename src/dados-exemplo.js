/**
 * Dados de EXEMPLO para a tela de lançamento.
 *
 * São fictícios e servem só para ver a tela funcionando antes de existir
 * a configuração do mês e a gravação no aparelho (tarefas futuras).
 * Dados financeiros reais nunca entram no repositório.
 *
 * O exemplo é montado sempre no mês de "hoje", para o veredito
 * funcionar em qualquer data em que a página for aberta.
 */

import { criarCartao } from './cartoes.js';
import { criarCategoria, criarFixo, criarLancamento, criarMes, ajustarFixoNoMes } from './modelo.js';
import { mesDaData } from './datas.js';

/**
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{
 *   meses: object[],
 *   categorias: object[],
 *   fixos: object[],
 *   lancamentos: object[],
 *   formasPagamento: string[],
 *   cartoes: object[]
 * }}
 */
export function criarDadosDeExemplo(hoje) {
  const mes = mesDaData(hoje);
  const primeiroDia = `${mes}-01`;

  const lanches = criarCategoria({ nome: 'Lanches', orcamentoCentavos: 20000 });
  const transporte = criarCategoria({ nome: 'Transporte', orcamentoCentavos: 30000 });
  const mercado = criarCategoria({ nome: 'Mercado', orcamentoCentavos: 60000 });
  const diversos = criarCategoria({ nome: 'Diversos', orcamentoCentavos: 0 });

  const academia = criarFixo({ nome: 'Academia', valorCentavos: 9990, diaVencimento: 5, formaPagamento: 'Pix', mesInicial: mes });
  const streaming = criarFixo({ nome: 'Streaming', valorCentavos: 3990, diaVencimento: 12, formaPagamento: 'Crédito', mesInicial: mes });
  const consulta = criarFixo({ nome: 'Consulta', valorCentavos: 0, diaVencimento: 1, formaPagamento: 'Pix', mesInicial: mes });

  // R$ 300,00 na conta + R$ 1.200,00 de renda = R$ 1.500,00 no mês; a consulta custa R$ 250,00 só neste mês.
  // A renda faz a projeção dos meses seguintes (compras parceladas no cartão) ter dinheiro entrando.
  const registroMes = ajustarFixoNoMes(
    criarMes({ mes, saldoInicialCentavos: 30000, rendaPrevistaCentavos: 120000 }),
    consulta,
    25000,
  );

  const lancamentos = [
    criarLancamento({ valorCentavos: 10000, categoriaId: lanches.id, formaPagamento: 'Pix', data: primeiroDia }),
    criarLancamento({ valorCentavos: 6000, categoriaId: transporte.id, formaPagamento: 'Débito', data: primeiroDia }),
    criarLancamento({ valorCentavos: 15000, categoriaId: mercado.id, formaPagamento: 'Crédito', data: primeiroDia }),
    criarLancamento({ valorCentavos: 4000, categoriaId: diversos.id, formaPagamento: 'Dinheiro', data: primeiroDia }),
  ];

  return {
    origem: 'exemplo', // a tela mostra a faixa "dados de exemplo" (veja src/inicio.js)
    meses: [registroMes],
    categorias: [lanches, transporte, mercado, diversos],
    fixos: [academia, streaming, consulta],
    lancamentos,
    formasPagamento: ['Pix', 'Crédito', 'Débito', 'Dinheiro'],
    // "Crédito" é um cartão: limite de R$ 2.000, fecha dia 3 e vence dia 10.
    cartoes: [criarCartao({ formaPagamento: 'Crédito', limiteCentavos: 200000, diaFechamento: 3, diaVencimento: 10 })],
  };
}
