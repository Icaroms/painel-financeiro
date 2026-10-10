/**
 * Configuração do Painel Financeiro: as mudanças que a tela "Configurar"
 * faz nos dados.
 *
 * Cada função recebe o estado atual e devolve um estado NOVO (o original
 * não é alterado). Problemas viram ErroValidacao com uma mensagem pronta
 * para mostrar na tela.
 *
 * Funções puras: testadas no Node. A tela fica em src/ui/configurar.js.
 */

import { ErroValidacao } from './erros.js';
import { reaisParaCentavos } from './dinheiro.js';
import { criarCategoria, excluirRegistro } from './modelo.js';
import { buscarMes } from './meses.js';
import { temComprasConvertidas } from './cartoes.js';

/** Compara nomes sem diferenciar maiúsculas, minúsculas e espaços nas pontas. */
function mesmoNome(a, b) {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

/* ------------------------------------------------------------------ */
/* Valores digitados                                                  */
/* ------------------------------------------------------------------ */

const formatadorCampo = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Valor para preencher um campo de texto, sem o "R$": 150000 → "1.500,00".
 * O texto gerado é aceito de volta por lerValorComSinal e lerValorPositivo.
 *
 * @param {number} centavos Inteiro (pode ser negativo).
 * @returns {string}
 */
export function textoDoValor(centavos) {
  // O Intl usa o sinal de menos tipográfico em alguns ambientes; aqui fica o "-" comum.
  return formatadorCampo.format(centavos / 100).replace('\u2212', '-');
}

/**
 * Converte um valor digitado que PODE ser negativo (como o saldo de uma
 * conta no cheque especial): "-150,00" → -15000.
 *
 * @param {string} texto
 * @param {string} campo Nome do campo, para o erro apontar o lugar certo.
 * @returns {number} Centavos.
 */
export function lerValorComSinal(texto, campo) {
  const limpo = String(texto ?? '').trim();
  const negativo = limpo.startsWith('-');

  try {
    const centavos = reaisParaCentavos(negativo ? limpo.slice(1) : limpo);
    return negativo ? -centavos : centavos;
  } catch (erro) {
    if (erro instanceof ErroValidacao) {
      throw new ErroValidacao(campo, `Valor inválido: "${texto}". Use o formato 1.234,56.`);
    }
    throw erro;
  }
}

/**
 * Converte um valor digitado que não pode ser negativo (orçamento, renda).
 * Campo vazio vale zero.
 *
 * @param {string} texto
 * @param {string} campo
 * @returns {number} Centavos.
 */
export function lerValorPositivo(texto, campo) {
  const limpo = String(texto ?? '').trim();
  if (limpo === '') return 0;

  try {
    return reaisParaCentavos(limpo);
  } catch (erro) {
    if (erro instanceof ErroValidacao) {
      throw new ErroValidacao(campo, `Valor inválido: "${texto}". Use o formato 1.234,56.`);
    }
    throw erro;
  }
}

/* ------------------------------------------------------------------ */
/* Dinheiro do mês                                                    */
/* ------------------------------------------------------------------ */

/**
 * Salva o saldo inicial e a renda prevista de um mês e marca o saldo
 * como CONFIRMADO (a pessoa conferiu o valor).
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @param {object} valores { saldoInicialCentavos, rendaPrevistaCentavos }
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function salvarDinheiroDoMes(estado, mes, { saldoInicialCentavos, rendaPrevistaCentavos }, { agora = new Date() } = {}) {
  const registro = buscarMes(estado, mes);
  if (!registro) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }
  if (!Number.isSafeInteger(saldoInicialCentavos)) {
    throw new ErroValidacao('saldoInicialCentavos', 'O saldo inicial deve ser um número inteiro de centavos.');
  }
  if (!Number.isSafeInteger(rendaPrevistaCentavos) || rendaPrevistaCentavos < 0) {
    throw new ErroValidacao('rendaPrevistaCentavos', 'A renda prevista não pode ser negativa.');
  }

  const atualizado = {
    ...registro,
    saldoInicialCentavos,
    rendaPrevistaCentavos,
    saldoConfirmado: true,
    atualizadoEm: agora.toISOString(),
  };

  return {
    ...estado,
    meses: estado.meses.map((m) => (m.mes === mes ? atualizado : m)),
  };
}

/* ------------------------------------------------------------------ */
/* Categorias                                                         */
/* ------------------------------------------------------------------ */

/**
 * Categorias que aparecem no app (as excluídas ficam guardadas só para
 * o histórico dos lançamentos antigos).
 *
 * @param {object} estado
 * @returns {object[]}
 */
export function categoriasAtivas(estado) {
  return estado.categorias.filter((c) => c.excluidoEm === null);
}

/** Lança erro se já existir outra categoria ativa com o mesmo nome. */
function exigirNomeLivre(estado, nome, idIgnorado = null) {
  const repetida = categoriasAtivas(estado).some(
    (c) => c.id !== idIgnorado && mesmoNome(c.nome, nome),
  );
  if (repetida) {
    throw new ErroValidacao('nome', `Já existe uma categoria chamada "${nome.trim()}".`);
  }
}

/**
 * Adiciona uma categoria.
 *
 * @param {object} estado
 * @param {object} dados   { nome, orcamentoCentavos }
 * @param {object} [opcoes] { agora, gerarId }
 * @returns {object} Estado novo.
 */
export function adicionarCategoria(estado, { nome, orcamentoCentavos }, opcoes = {}) {
  const categoria = criarCategoria({ nome, orcamentoCentavos }, opcoes); // valida nome e orçamento
  exigirNomeLivre(estado, categoria.nome);
  return { ...estado, categorias: [...estado.categorias, categoria] };
}

/**
 * Muda o nome e o orçamento de uma categoria. O id continua o mesmo,
 * então os lançamentos antigos continuam ligados a ela.
 *
 * @param {object} estado
 * @param {string} id
 * @param {object} dados   { nome, orcamentoCentavos }
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function editarCategoria(estado, id, { nome, orcamentoCentavos }, { agora = new Date() } = {}) {
  const atual = categoriasAtivas(estado).find((c) => c.id === id);
  if (!atual) {
    throw new ErroValidacao('categoria', 'Categoria não encontrada.');
  }

  // Reaproveita as validações da criação (nome obrigatório, orçamento inteiro e não negativo).
  const validada = criarCategoria({ nome, orcamentoCentavos });
  exigirNomeLivre(estado, validada.nome, id);

  const editada = {
    ...atual,
    nome: validada.nome,
    orcamentoCentavos: validada.orcamentoCentavos,
    atualizadoEm: agora.toISOString(),
  };

  return {
    ...estado,
    categorias: estado.categorias.map((c) => (c.id === id ? editada : c)),
  };
}

/**
 * Remove uma categoria (exclusão suave: os lançamentos antigos continuam
 * apontando para ela). Precisa sobrar pelo menos uma categoria.
 *
 * @param {object} estado
 * @param {string} id
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function removerCategoria(estado, id, opcoes = {}) {
  const ativas = categoriasAtivas(estado);
  if (!ativas.some((c) => c.id === id)) {
    throw new ErroValidacao('categoria', 'Categoria não encontrada.');
  }
  if (ativas.length === 1) {
    throw new ErroValidacao('categoria', 'Mantenha pelo menos uma categoria.');
  }

  return {
    ...estado,
    categorias: estado.categorias.map((c) => (c.id === id ? excluirRegistro(c, opcoes) : c)),
  };
}

/* ------------------------------------------------------------------ */
/* Formas de pagamento                                                */
/* ------------------------------------------------------------------ */

/** Tamanho máximo do nome, para caber no botão da tela de lançamento. */
export const TAMANHO_MAXIMO_FORMA = 16;

/**
 * Adiciona uma forma de pagamento (ex.: "Cartão Nubank").
 *
 * @param {object} estado
 * @param {string} nome
 * @returns {object} Estado novo.
 */
export function adicionarFormaPagamento(estado, nome) {
  const limpo = typeof nome === 'string' ? nome.trim() : '';
  if (limpo === '') {
    throw new ErroValidacao('formaPagamento', 'O nome da forma de pagamento é obrigatório.');
  }
  if (limpo.length > TAMANHO_MAXIMO_FORMA) {
    throw new ErroValidacao('formaPagamento', `Use no máximo ${TAMANHO_MAXIMO_FORMA} letras, para caber no botão.`);
  }
  if (estado.formasPagamento.some((f) => mesmoNome(f, limpo))) {
    throw new ErroValidacao('formaPagamento', `"${limpo}" já está na lista.`);
  }
  return { ...estado, formasPagamento: [...estado.formasPagamento, limpo] };
}

/**
 * Remove uma forma de pagamento (e o cartão ligado a ela, se houver).
 * Os lançamentos antigos guardam o nome como texto, então não são
 * afetados. Precisa sobrar pelo menos uma.
 *
 * @param {object} estado
 * @param {string} nome
 * @returns {object} Estado novo.
 */
export function removerFormaPagamento(estado, nome) {
  if (!estado.formasPagamento.includes(nome)) {
    throw new ErroValidacao('formaPagamento', `"${nome}" não está na lista.`);
  }
  if (estado.formasPagamento.length === 1) {
    throw new ErroValidacao('formaPagamento', 'Mantenha pelo menos uma forma de pagamento.');
  }
  // Se a forma era um cartão, o cadastro do cartão sai junto, mas não se
  // ele tiver parcelas convertidas de contas fixas (elas sumiriam do saldo).
  if (temComprasConvertidas(estado, nome)) {
    throw new ErroValidacao(
      'formaPagamento',
      `"${nome}" tem parcelas convertidas de contas fixas. Desfaça a conversão antes de remover.`,
    );
  }
  return {
    ...estado,
    formasPagamento: estado.formasPagamento.filter((f) => f !== nome),
    cartoes: (estado.cartoes ?? []).filter((c) => c.formaPagamento !== nome),
  };
}
