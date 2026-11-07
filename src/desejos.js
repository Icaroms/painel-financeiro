/**
 * Lista de desejos (11/2026): produtos que a pessoa quer comprar, com os
 * preços que ela encontrou (registrados à mão) e a avaliação do app no
 * MENOR preço: dá para comprar a esse preço? Agora ou mais tarde?
 *
 * Onde fica:
 *
 *   dados.desejos: [                 ← viaja com a configuração (extras no servidor)
 *     { id, nome: "Tab S10 FE+", formaPagamento: "Cartão Careca", parcelas: 5,
 *       precos: [{ id, valorCentavos, data: "2026-11-07", loja: "Amazon" }],
 *       criadoEm, atualizadoEm }
 *   ]
 *
 * A avaliação usa o simulador de compras (src/simulador.js) com o menor
 * preço registrado: no cartão, à vista e na quantidade de parcelas guardada
 * (sem juros, que é o caso mais comum; os juros de verdade a pessoa compara
 * no Avaliar compra). Fora do cartão, só à vista.
 *
 * Funções puras: testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida } from './datas.js';
import { simularCompra } from './simulador.js';
import { MAXIMO_PARCELAS_COMPRA } from './modelo.js';

/** No máximo quantos produtos na lista. */
export const MAXIMO_DESEJOS = 20;

/** No máximo quantos preços por produto (os mais antigos saem). */
export const MAXIMO_PRECOS = 30;

export const TAMANHO_NOME_DESEJO = 60;
export const TAMANHO_LOJA = 40;

function gerarIdPadrao() {
  return globalThis.crypto.randomUUID();
}

/** Lista de desejos (dados antigos não têm o campo). */
export function desejosDe(estado) {
  return Array.isArray(estado?.desejos) ? estado.desejos : [];
}

function exigirNome(nome) {
  const limpo = typeof nome === 'string' ? nome.trim() : '';
  if (limpo === '') throw new ErroValidacao('nome', 'Dê um nome ao produto (ex.: Tablet).');
  if (limpo.length > TAMANHO_NOME_DESEJO) throw new ErroValidacao('nome', `O nome pode ter até ${TAMANHO_NOME_DESEJO} letras.`);
  return limpo;
}

function exigirPagamento(estado, formaPagamento, parcelas) {
  if (!(estado.formasPagamento ?? []).includes(formaPagamento)) {
    throw new ErroValidacao('formaPagamento', 'Escolha como pretende pagar.');
  }
  const ehCartao = (estado.cartoes ?? []).some((c) => c.formaPagamento === formaPagamento);
  const n = ehCartao ? parcelas : 1;
  if (!Number.isInteger(n) || n < 1 || n > MAXIMO_PARCELAS_COMPRA) {
    throw new ErroValidacao('parcelas', `As parcelas devem ser de 1 a ${MAXIMO_PARCELAS_COMPRA}.`);
  }
  return n;
}

function criarPreco({ valorCentavos, data, loja = '' }, gerarId) {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    throw new ErroValidacao('valorCentavos', 'O preço deve ser maior que zero.');
  }
  if (!ehDataValida(data)) throw new ErroValidacao('data', 'Escolha uma data válida.');
  const lojaLimpa = typeof loja === 'string' ? loja.trim() : '';
  if (lojaLimpa.length > TAMANHO_LOJA) throw new ErroValidacao('loja', `A loja pode ter até ${TAMANHO_LOJA} letras.`);
  return { id: gerarId(), valorCentavos, data, loja: lojaLimpa };
}

function trocarDesejo(estado, id, mudar, agora) {
  const lista = desejosDe(estado);
  const atual = lista.find((d) => d.id === id);
  if (!atual) throw new ErroValidacao('desejo', 'Produto não encontrado na lista.');
  const novo = { ...mudar(atual), atualizadoEm: agora.toISOString() };
  return { ...estado, desejos: lista.map((d) => (d.id === id ? novo : d)) };
}

/**
 * Guarda um produto na lista, já com o primeiro preço.
 *
 * @param {object} estado
 * @param {{ nome: string, formaPagamento: string, parcelas?: number,
 *   preco: { valorCentavos: number, data: string, loja?: string } }} dados
 * @param {object} [opcoes] { agora, gerarId }
 */
export function adicionarDesejo(estado, dados, { agora = new Date(), gerarId = gerarIdPadrao } = {}) {
  const lista = desejosDe(estado);
  if (lista.length >= MAXIMO_DESEJOS) throw new ErroValidacao('desejos', `A lista aceita até ${MAXIMO_DESEJOS} produtos.`);
  const nome = exigirNome(dados.nome);
  if (lista.some((d) => d.nome.toLowerCase() === nome.toLowerCase())) {
    throw new ErroValidacao('nome', `"${nome}" já está na lista: registre o preço novo nele.`);
  }
  const momento = agora.toISOString();
  const desejo = {
    id: gerarId(),
    nome,
    formaPagamento: dados.formaPagamento,
    parcelas: exigirPagamento(estado, dados.formaPagamento, dados.parcelas ?? 1),
    precos: [criarPreco(dados.preco, gerarId)],
    criadoEm: momento,
    atualizadoEm: momento,
  };
  return { ...estado, desejos: [...lista, desejo] };
}

/** Muda nome, forma de pagamento e parcelas de um produto. */
export function editarDesejo(estado, id, { nome, formaPagamento, parcelas }, { agora = new Date() } = {}) {
  const nomeLimpo = exigirNome(nome);
  const n = exigirPagamento(estado, formaPagamento, parcelas);
  return trocarDesejo(estado, id, (d) => ({ ...d, nome: nomeLimpo, formaPagamento, parcelas: n }), agora);
}

/** Tira um produto da lista (comprou ou desistiu). */
export function removerDesejo(estado, id) {
  const lista = desejosDe(estado);
  if (!lista.some((d) => d.id === id)) throw new ErroValidacao('desejo', 'Produto não encontrado na lista.');
  return { ...estado, desejos: lista.filter((d) => d.id !== id) };
}

/** Registra um preço encontrado (os mais antigos saem depois de 30). */
export function registrarPreco(estado, id, preco, { agora = new Date(), gerarId = gerarIdPadrao } = {}) {
  const novo = criarPreco(preco, gerarId);
  return trocarDesejo(estado, id, (d) => ({
    ...d,
    precos: [...d.precos, novo].sort((a, b) => a.data.localeCompare(b.data)).slice(-MAXIMO_PRECOS),
  }), agora);
}

/** Apaga um preço registrado por engano (o produto precisa ficar com pelo menos um). */
export function removerPreco(estado, id, precoId, { agora = new Date() } = {}) {
  return trocarDesejo(estado, id, (d) => {
    if (d.precos.length <= 1) throw new ErroValidacao('preco', 'O produto precisa de pelo menos um preço: remova o produto.');
    if (!d.precos.some((p) => p.id === precoId)) throw new ErroValidacao('preco', 'Preço não encontrado.');
    return { ...d, precos: d.precos.filter((p) => p.id !== precoId) };
  }, agora);
}

/**
 * Resumo dos preços de um produto.
 *
 * @returns {{ menor: object, ultimo: object, primeiro: object, quantos: number,
 *   variacaoCentavos: number }} variacaoCentavos: último − primeiro (negativo = baixou).
 */
export function resumoDosPrecos(desejo) {
  const ordenados = [...desejo.precos].sort((a, b) => a.data.localeCompare(b.data));
  // Menor preço; empate: o mais recente.
  const menor = ordenados.reduce((m, p) => (p.valorCentavos <= m.valorCentavos ? p : m));
  const primeiro = ordenados[0];
  const ultimo = ordenados[ordenados.length - 1];
  return { menor, ultimo, primeiro, quantos: ordenados.length, variacaoCentavos: ultimo.valorCentavos - primeiro.valorCentavos };
}

/**
 * Avalia o produto no menor preço com o simulador de compras.
 *
 * @param {object} visao Visão do mês atual (dadosDoMes).
 * @param {object} desejo
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ precos: object, opcao: object, ehCartao: boolean } | { erro: string }}
 *   opcao: a opção simulada na forma e nas parcelas guardadas (cor, pior mês, melhor momento...).
 */
export function avaliarDesejo(visao, desejo, hoje) {
  const precos = resumoDosPrecos(desejo);
  const ehCartao = (visao.cartoes ?? []).some((c) => c.formaPagamento === desejo.formaPagamento);
  const parcelas = ehCartao ? desejo.parcelas : 1;
  try {
    const resultado = simularCompra(visao, {
      formaPagamento: desejo.formaPagamento,
      aVistaCentavos: precos.menor.valorCentavos,
      opcoes: parcelas > 1 ? [{ parcelas, totalCentavos: precos.menor.valorCentavos }] : [],
      hoje,
    });
    return { precos, ehCartao, opcao: resultado.opcoes[resultado.opcoes.length - 1] };
  } catch (falha) {
    if (!(falha instanceof ErroValidacao)) throw falha;
    // Ex.: o cartão guardado foi removido de Configurar.
    return { precos, erro: falha.message };
  }
}
