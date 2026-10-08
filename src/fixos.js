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
import { somarMeses, mesesEntre, mesDaData, diaDaData, diasNoMes } from './datas.js';
import { criarFixo, fixoAtivoNoMes, valorDoFixoNoMes, excluirRegistro, STATUS_FIXO } from './modelo.js';
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
 * Dia que serve de "hoje" para um mês:
 * - mês atual: o dia de hoje;
 * - mês que já passou: o último dia (tudo já venceu);
 * - mês futuro: 0 (nada venceu ainda).
 *
 * @param {string} mes  "AAAA-MM".
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {number}
 */
export function diaDeReferencia(mes, hoje) {
  const mesHoje = mesDaData(hoje);
  if (mes === mesHoje) return diaDaData(hoje);
  return mes < mesHoje ? diasNoMes(mes) : 0;
}

/**
 * Situação de uma conta fixa num mês.
 *
 * 1. O que a pessoa marcou no mês vale sempre (previsto, pago ou dispensado).
 * 2. Sem marcação: conta de pagamento automático que já venceu está "pago";
 *    todas as outras estão "previsto".
 *
 * @param {object} fixo
 * @param {object} registroMes
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{ status: 'previsto'|'pago'|'dispensado', automatico: boolean, diaEfetivo: number }}
 *   automatico: true quando o "pago" veio da regra do pagamento automático.
 *   diaEfetivo: o dia de vencimento no mês (dia 31 cai no último dia dos meses curtos).
 */
export function statusDoFixoNoMes(fixo, registroMes, hoje) {
  const diaEfetivo = Math.min(fixo.diaVencimento, diasNoMes(registroMes.mes));
  const marcado = registroMes.statusFixos?.[fixo.id];
  if (STATUS_FIXO.includes(marcado)) {
    return { status: marcado, automatico: false, diaEfetivo };
  }
  if (fixo.pagamentoAutomatico === true && diaEfetivo <= diaDeReferencia(registroMes.mes, hoje)) {
    return { status: 'pago', automatico: true, diaEfetivo };
  }
  return { status: 'previsto', automatico: false, diaEfetivo };
}

/**
 * Fixos que contam num mês, com o valor, a situação e a parcela daquele mês.
 * Ordenados pelo dia de vencimento.
 *
 * @param {object} estado
 * @param {string} mes  "AAAA-MM".
 * @param {string} hoje "AAAA-MM-DD" (para o pagamento automático).
 * @returns {{
 *   fixo: object,
 *   valorCentavos: number,          // o que conta no mês (zero se dispensado)
 *   valorEstipuladoCentavos: number, // o valor esperado, mesmo se dispensado
 *   ajustado: boolean,
 *   status: 'previsto'|'pago'|'dispensado',
 *   automatico: boolean,
 *   diaEfetivo: number,
 *   parcela: object|null
 * }[]}
 */
export function fixosDoMes(estado, mes, hoje) {
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
      valorEstipuladoCentavos: registro.ajustesFixos[fixo.id] ?? fixo.valorCentavos,
      ajustado: Object.hasOwn(registro.ajustesFixos, fixo.id),
      ...statusDoFixoNoMes(fixo, registro, hoje),
      parcela: parcelaNoMes(fixo, mes),
    }));
}

/**
 * Muda a situação de uma conta fixa num mês.
 *
 * - "pago": com valorCentavos, guarda o valor REAL pago neste mês (ex.: a
 *   consulta estipulada em R$ 120 custou R$ 135). Sem valorCentavos, vale
 *   o valor estipulado.
 * - "dispensado": a conta não vai sair neste mês e deixa de contar.
 * - "previsto": volta a ser esperada (também desfaz o "pago" automático).
 *
 * Só vale para o mês indicado: na virada, o mês novo começa sem marcações.
 *
 * @param {object} estado
 * @param {string} mes     "AAAA-MM".
 * @param {string} fixoId
 * @param {'previsto'|'pago'|'dispensado'} status
 * @param {object} [opcoes] { valorCentavos, agora }
 * @returns {object} Estado novo.
 */
export function definirStatusDoFixo(estado, mes, fixoId, status, { valorCentavos, agora = new Date() } = {}) {
  const registro = buscarMes(estado, mes);
  if (!registro) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }
  const fixo = estado.fixos.find((f) => f.id === fixoId);
  if (!fixo || !fixoAtivoNoMes(fixo, mes)) {
    throw new ErroValidacao('fixo', 'Esta conta fixa não conta neste mês.');
  }
  if (!STATUS_FIXO.includes(status)) {
    throw new ErroValidacao('status', 'Escolha Previsto, Pago ou Dispensado.');
  }

  const ajustesFixos = { ...registro.ajustesFixos };
  if (status === 'pago' && valorCentavos !== undefined) {
    if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 0) {
      throw new ErroValidacao('valorCentavos', 'O valor pago deve ser zero ou positivo.');
    }
    // Pagou o valor de sempre: não precisa de ajuste do mês.
    if (valorCentavos === fixo.valorCentavos) delete ajustesFixos[fixoId];
    else ajustesFixos[fixoId] = valorCentavos;
  }

  const atualizado = {
    ...registro,
    ajustesFixos,
    statusFixos: { ...(registro.statusFixos ?? {}), [fixoId]: status },
    atualizadoEm: agora.toISOString(),
  };
  return { ...estado, meses: estado.meses.map((m) => (m.mes === mes ? atualizado : m)) };
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
  const {
    nome, valorCentavos, diaVencimento, formaPagamento, tipo, parcelaAtual, totalParcelas, pagamentoAutomatico = false,
  } = dados;

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

  return { nome, valorCentavos, diaVencimento, formaPagamento, pagamentoAutomatico, ...meses };
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
 * @param {boolean} [dados.pagamentoAutomatico] Vira "Pago" sozinha no dia do vencimento.
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
    pagamentoAutomatico: validado.pagamentoAutomatico,
    atualizadoEm: agora.toISOString(),
  };
  // O campo "opcional" de uma versão anterior do app foi substituído pelo
  // status "Dispensado" de cada mês: ao editar, ele deixa de ser guardado.
  delete editado.opcional;

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
