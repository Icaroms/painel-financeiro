/**
 * Contas fixas na configuração: cadastrar, editar, encerrar e ajustar o
 * valor de um fixo num mês só.
 *
 * Parcelamento: a pessoa informa "esta é a parcela 3 de 12" e o app
 * calcula sozinho o mês inicial e o mês final. Depois da última parcela,
 * o fixo deixa de contar (regra de fixoAtivoNoMes, em src/modelo.js).
 *
 * Cada função recebe o estado e devolve um estado NOVO.
 * Funções puras: testadas no Node. A tela fica em src/ui/configurar.js.
 */

import { ErroValidacao } from './erros.js';
import { somarMeses, mesesEntre } from './datas.js';
import { criarFixo, fixoAtivoNoMes, valorDoFixoNoMes, excluirRegistro } from './modelo.js';
import { buscarMes } from './meses.js';

/** Limite de parcelas aceito no cadastro (10 anos). */
export const MAXIMO_PARCELAS = 120;

/* ------------------------------------------------------------------ */
/* Parcelas                                                           */
/* ------------------------------------------------------------------ */

/**
 * Calcula o primeiro e o último mês de um parcelamento a partir da
 * parcela que cai num mês de referência.
 *
 * Ex.: em novembro de 2026 cai a parcela 3 de 12
 *      → começou em setembro de 2026 e termina em agosto de 2027.
 *
 * @param {string} mesReferencia "AAAA-MM" (normalmente o mês atual).
 * @param {number} parcelaAtual  A parcela que cai no mês de referência (1, 2, 3...).
 * @param {number} totalParcelas Quantidade total de parcelas.
 * @returns {{ mesInicial: string, mesFinal: string }}
 */
export function mesesDoParcelamento(mesReferencia, parcelaAtual, totalParcelas) {
  if (!Number.isInteger(totalParcelas) || totalParcelas < 1 || totalParcelas > MAXIMO_PARCELAS) {
    throw new ErroValidacao('totalParcelas', `O total de parcelas deve ser de 1 a ${MAXIMO_PARCELAS}.`);
  }
  if (!Number.isInteger(parcelaAtual) || parcelaAtual < 1 || parcelaAtual > totalParcelas) {
    throw new ErroValidacao('parcelaAtual', `A parcela deste mês deve ser de 1 a ${totalParcelas}.`);
  }

  return {
    mesInicial: somarMeses(mesReferencia, -(parcelaAtual - 1)),
    mesFinal: somarMeses(mesReferencia, totalParcelas - parcelaAtual),
  };
}

/**
 * Qual parcela de um fixo cai num mês. Fixos sem mês final (mensais)
 * devolvem null.
 *
 * @param {object} fixo
 * @param {string} mes "AAAA-MM".
 * @returns {{ atual: number, total: number } | null}
 */
export function parcelaNoMes(fixo, mes) {
  if (fixo.mesFinal === null) return null;
  return {
    atual: mesesEntre(fixo.mesInicial, mes),
    total: mesesEntre(fixo.mesInicial, fixo.mesFinal),
  };
}

/* ------------------------------------------------------------------ */
/* Consulta                                                           */
/* ------------------------------------------------------------------ */

/**
 * Fixos que contam num mês, com o valor daquele mês e a parcela.
 * Ordenados pelo dia de vencimento.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {{ fixo: object, valorCentavos: number, ajustado: boolean, parcela: object|null }[]}
 */
export function fixosDoMes(estado, mes) {
  const registro = buscarMes(estado, mes);
  if (!registro) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }

  return estado.fixos
    .filter((f) => fixoAtivoNoMes(f, mes))
    .sort((a, b) => a.diaVencimento - b.diaVencimento)
    .map((fixo) => ({
      fixo,
      valorCentavos: valorDoFixoNoMes(fixo, registro),
      ajustado: Object.hasOwn(registro.ajustesFixos, fixo.id),
      parcela: parcelaNoMes(fixo, mes),
    }));
}

/* ------------------------------------------------------------------ */
/* Cadastro                                                           */
/* ------------------------------------------------------------------ */

/**
 * Valida os campos comuns e calcula os meses conforme o tipo.
 *
 * @param {object} estado
 * @param {object} dados
 * @param {string} mesReferencia
 * @returns {object} Campos prontos para criarFixo.
 */
function prepararCampos(estado, dados, mesReferencia) {
  const { nome, valorCentavos, diaVencimento, formaPagamento, tipo, parcelaAtual, totalParcelas } = dados;

  if (!estado.formasPagamento.includes(formaPagamento)) {
    throw new ErroValidacao('formaPagamento', 'Escolha uma das formas de pagamento da lista.');
  }

  let meses;
  if (tipo === 'mensal') {
    meses = { mesInicial: mesReferencia, mesFinal: null };
  } else if (tipo === 'parcelado') {
    meses = mesesDoParcelamento(mesReferencia, parcelaAtual, totalParcelas);
  } else {
    throw new ErroValidacao('tipo', 'Escolha se a conta é mensal ou parcelada.');
  }

  return { nome, valorCentavos, diaVencimento, formaPagamento, ...meses };
}

/**
 * Cadastra uma conta fixa.
 *
 * - Mensal: começa no mês de referência e não tem fim (assinatura, mensalidade).
 * - Parcelado: o mês inicial e o final saem da parcela informada.
 *
 * @param {object} estado
 * @param {object} dados
 * @param {string} dados.nome
 * @param {number} dados.valorCentavos
 * @param {number} dados.diaVencimento  1 a 31.
 * @param {string} dados.formaPagamento Precisa estar na lista de formas de pagamento.
 * @param {'mensal'|'parcelado'} dados.tipo
 * @param {number} [dados.parcelaAtual]  Só para parcelado.
 * @param {number} [dados.totalParcelas] Só para parcelado.
 * @param {string} mesReferencia "AAAA-MM" (o mês atual).
 * @param {object} [opcoes]      { agora, gerarId }
 * @returns {object} Estado novo.
 */
export function adicionarFixo(estado, dados, mesReferencia, opcoes = {}) {
  const fixo = criarFixo(prepararCampos(estado, dados, mesReferencia), opcoes);
  return { ...estado, fixos: [...estado.fixos, fixo] };
}

/**
 * Edita uma conta fixa. Os campos são os mesmos do cadastro; o valor
 * novo vale para todos os meses (para mudar só um mês, use
 * definirValorNoMes). O id continua o mesmo.
 *
 * Atenção: para um fixo mensal, o mês inicial é preservado (editar o
 * valor de uma assinatura antiga não a faz "começar" de novo).
 *
 * @param {object} estado
 * @param {string} id
 * @param {object} dados        Mesmos campos de adicionarFixo.
 * @param {string} mesReferencia "AAAA-MM".
 * @param {object} [opcoes]     { agora }
 * @returns {object} Estado novo.
 */
export function editarFixo(estado, id, dados, mesReferencia, { agora = new Date() } = {}) {
  const atual = estado.fixos.find((f) => f.id === id && f.excluidoEm === null);
  if (!atual) {
    throw new ErroValidacao('fixo', 'Conta fixa não encontrada.');
  }

  const campos = prepararCampos(estado, dados, mesReferencia);
  if (dados.tipo === 'mensal') {
    campos.mesInicial = atual.mesFinal === null ? atual.mesInicial : mesReferencia;
  }

  // Reaproveita as validações da criação (nome, valor, dia, meses).
  const validado = criarFixo(campos);

  const editado = {
    ...atual,
    nome: validado.nome,
    valorCentavos: validado.valorCentavos,
    diaVencimento: validado.diaVencimento,
    formaPagamento: validado.formaPagamento,
    mesInicial: validado.mesInicial,
    mesFinal: validado.mesFinal,
    atualizadoEm: agora.toISOString(),
  };

  return { ...estado, fixos: estado.fixos.map((f) => (f.id === id ? editado : f)) };
}

/**
 * Encerra uma conta fixa a partir do mês de referência.
 *
 * - Se ela já existia em meses anteriores, o mês final vira o mês
 *   anterior: ela some daqui para frente, mas os meses passados
 *   continuam com as contas certas.
 * - Se ela começou neste mês (provavelmente cadastrada por engano),
 *   é excluída de vez (exclusão suave).
 *
 * @param {object} estado
 * @param {string} id
 * @param {string} mesReferencia "AAAA-MM".
 * @param {object} [opcoes]      { agora }
 * @returns {{ estado: object, como: 'encerrado'|'excluido' }}
 */
export function encerrarFixo(estado, id, mesReferencia, { agora = new Date() } = {}) {
  const atual = estado.fixos.find((f) => f.id === id && f.excluidoEm === null);
  if (!atual) {
    throw new ErroValidacao('fixo', 'Conta fixa não encontrada.');
  }

  if (atual.mesInicial >= mesReferencia) {
    return {
      estado: { ...estado, fixos: estado.fixos.map((f) => (f.id === id ? excluirRegistro(f, { agora }) : f)) },
      como: 'excluido',
    };
  }

  const encerrado = {
    ...atual,
    mesFinal: somarMeses(mesReferencia, -1),
    atualizadoEm: agora.toISOString(),
  };
  return {
    estado: { ...estado, fixos: estado.fixos.map((f) => (f.id === id ? encerrado : f)) },
    como: 'encerrado',
  };
}

/**
 * Define o valor de um fixo APENAS num mês (ex.: a consulta que custou
 * mais neste mês). Com valor null, remove o ajuste e o fixo volta ao
 * valor padrão naquele mês.
 *
 * @param {object}      estado
 * @param {string}      mes           "AAAA-MM".
 * @param {string}      fixoId
 * @param {number|null} valorCentavos
 * @param {object}      [opcoes]      { agora }
 * @returns {object} Estado novo.
 */
export function definirValorNoMes(estado, mes, fixoId, valorCentavos, { agora = new Date() } = {}) {
  const registro = buscarMes(estado, mes);
  if (!registro) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }
  const fixo = estado.fixos.find((f) => f.id === fixoId);
  if (!fixo || !fixoAtivoNoMes(fixo, mes)) {
    throw new ErroValidacao('fixo', 'Esta conta fixa não conta neste mês.');
  }
  if (valorCentavos !== null && (!Number.isSafeInteger(valorCentavos) || valorCentavos < 0)) {
    throw new ErroValidacao('valorCentavos', 'O valor deve ser zero ou positivo.');
  }

  const ajustesFixos = { ...registro.ajustesFixos };
  if (valorCentavos === null) {
    delete ajustesFixos[fixoId];
  } else {
    ajustesFixos[fixoId] = valorCentavos;
  }

  const atualizado = { ...registro, ajustesFixos, atualizadoEm: agora.toISOString() };
  return { ...estado, meses: estado.meses.map((m) => (m.mes === mes ? atualizado : m)) };
}
