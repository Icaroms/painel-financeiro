/**
 * Entradas de dinheiro (11/2026): salário e outras entradas fixas, mais as
 * entradas avulsas de cada mês (um Pix recebido, um freela).
 *
 * Por que existe: antes, o app só tinha a "renda prevista" do mês. Ela
 * servia para o mês atual e TAMBÉM era usada como salário de todos os meses
 * seguintes na previsão. Quem cadastrava o mês depois de o salário cair
 * (com o salário já no saldo) deixava a renda em zero, e a previsão passava
 * a calcular os meses seguintes sem salário nenhum.
 *
 * Onde fica cada coisa:
 *
 *   dados.entradasFixas: [            ← viaja com a configuração (sincronização)
 *     { id, nome: "Salário", valorCentavos: 231200, dia: 5,
 *       mesInicial: "2026-11", mesFinal: null, criadoEm, atualizadoEm }
 *   ]
 *
 *   registro do mês:
 *     rendaPrevistaCentavos            ← "outras entradas previstas" (não se repetem)
 *     statusEntradas: { id: "recebida" | "no-saldo" | "nao-veio" }
 *     valoresEntradas: { id: 240000 }  ← valor real recebido, quando foi diferente
 *     entradasAvulsas: [{ id, valorCentavos, data, descricao, criadoEm }]
 *
 * Situação de uma entrada fixa no mês:
 * - prevista  (padrão): ainda vai cair; conta no dinheiro do mês;
 * - recebida: já caiu (depois do saldo inicial); conta, com o valor real;
 * - no-saldo: já caiu ANTES de a pessoa informar o saldo inicial, então já
 *   está dentro dele; não conta de novo;
 * - nao-veio: não vai cair este mês; não conta.
 *
 * Funções puras: testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { ehMesValido, ehDataValida, mesDaData, diasNoMes, somarMeses } from './datas.js';

/** Situações de uma entrada fixa num mês. */
export const STATUS_ENTRADA = Object.freeze(['prevista', 'recebida', 'no-saldo', 'nao-veio']);

/** Textos das situações, para as telas. */
export const ROTULO_STATUS_ENTRADA = Object.freeze({
  prevista: 'Prevista',
  recebida: 'Recebida',
  'no-saldo': 'Já estava no saldo',
  'nao-veio': 'Não veio',
});

/** No máximo quantas entradas fixas (salário, pensão, aluguel recebido...). */
export const MAXIMO_ENTRADAS_FIXAS = 10;

/** No máximo quantas entradas avulsas por mês. */
export const MAXIMO_ENTRADAS_AVULSAS = 60;

/** Tamanho máximo do nome de uma entrada. */
export const TAMANHO_NOME_ENTRADA = 40;

/** Tamanho máximo da descrição de uma entrada avulsa. */
export const TAMANHO_DESCRICAO_ENTRADA = 80;

/** Registro de um mês (cópia local: evita import circular com meses.js). */
function buscarMes(estado, mes) {
  return estado.meses.find((m) => m.mes === mes);
}

/** Id novo (navegador e Node 20+). */
function gerarIdPadrao() {
  return globalThis.crypto.randomUUID();
}

/** Lista das entradas fixas (dados antigos não têm o campo). */
export function entradasFixasDe(estado) {
  return Array.isArray(estado?.entradasFixas) ? estado.entradasFixas : [];
}

/* ------------------------------------------------------------------ */
/* Validação                                                          */
/* ------------------------------------------------------------------ */

function exigirNome(nome) {
  const limpo = typeof nome === 'string' ? nome.trim() : '';
  if (limpo === '') throw new ErroValidacao('nome', 'Dê um nome à entrada (ex.: Salário).');
  if (limpo.length > TAMANHO_NOME_ENTRADA) {
    throw new ErroValidacao('nome', `O nome pode ter até ${TAMANHO_NOME_ENTRADA} letras.`);
  }
  return limpo;
}

function exigirValor(valorCentavos, { permitirZero = false } = {}) {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 0 || (!permitirZero && valorCentavos === 0)) {
    throw new ErroValidacao('valorCentavos', permitirZero
      ? 'O valor deve ser zero ou positivo.'
      : 'O valor deve ser maior que zero.');
  }
  return valorCentavos;
}

function exigirDia(dia) {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new ErroValidacao('dia', 'O dia em que cai deve ser de 1 a 31.');
  }
  return dia;
}

function exigirMesDoEstado(estado, mes) {
  if (!ehMesValido(mes)) throw new ErroValidacao('mes', `Mês inválido: "${mes}".`);
  const registro = buscarMes(estado, mes);
  if (!registro) throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  return registro;
}

/** Troca o registro de um mês no estado, com atualizadoEm renovado. */
function comMes(estado, registro, mudancas, agora) {
  const atualizado = { ...registro, ...mudancas, atualizadoEm: agora.toISOString() };
  return { ...estado, meses: estado.meses.map((m) => (m.mes === registro.mes ? atualizado : m)) };
}

/* ------------------------------------------------------------------ */
/* Entradas fixas: cadastro                                            */
/* ------------------------------------------------------------------ */

/** A entrada fixa vale neste mês? */
export function entradaAtivaNoMes(entrada, mes) {
  if (mes < entrada.mesInicial) return false;
  if (entrada.mesFinal !== null && entrada.mesFinal !== undefined && mes > entrada.mesFinal) return false;
  return true;
}

/** Entradas fixas que valem num mês. */
export function entradasAtivasNoMes(entradasFixas, mes) {
  return (entradasFixas ?? []).filter((e) => entradaAtivaNoMes(e, mes));
}

/** Dia em que a entrada cai naquele mês (dia 31 em novembro → 30). */
export function diaDaEntradaNoMes(entrada, mes) {
  return Math.min(entrada.dia, diasNoMes(mes));
}

/**
 * Cadastra uma entrada fixa, a partir do mês informado.
 *
 * @param {object} estado
 * @param {{ nome: string, valorCentavos: number, dia: number }} dados
 * @param {string} mes "AAAA-MM" (o mês atual).
 * @param {object} [opcoes]
 * @param {string} [opcoes.statusNoMes] Situação neste mês (padrão: prevista).
 *   Ex.: o salário já caiu e já está no saldo inicial → "no-saldo".
 * @param {Date} [opcoes.agora]
 * @param {() => string} [opcoes.gerarId]
 * @returns {object} Estado novo.
 */
export function adicionarEntradaFixa(estado, dados, mes, { statusNoMes = 'prevista', agora = new Date(), gerarId = gerarIdPadrao } = {}) {
  const registro = exigirMesDoEstado(estado, mes);
  const atuais = entradasAtivasNoMes(entradasFixasDe(estado), mes);
  if (atuais.length >= MAXIMO_ENTRADAS_FIXAS) {
    throw new ErroValidacao('entradas', `Cadastre até ${MAXIMO_ENTRADAS_FIXAS} entradas fixas.`);
  }
  if (!STATUS_ENTRADA.includes(statusNoMes)) {
    throw new ErroValidacao('status', 'Escolha a situação da entrada neste mês.');
  }
  const momento = agora.toISOString();
  const entrada = {
    id: gerarId(),
    nome: exigirNome(dados.nome),
    valorCentavos: exigirValor(dados.valorCentavos),
    dia: exigirDia(dados.dia),
    mesInicial: mes,
    mesFinal: null,
    criadoEm: momento,
    atualizadoEm: momento,
  };
  let novo = { ...estado, entradasFixas: [...entradasFixasDe(estado), entrada] };
  if (statusNoMes !== 'prevista') {
    novo = comMes(novo, registro, {
      statusEntradas: { ...(registro.statusEntradas ?? {}), [entrada.id]: statusNoMes },
    }, agora);
  }
  return novo;
}

/**
 * Edita nome, valor padrão e dia de uma entrada fixa (vale para todos os meses
 * em que o valor real não foi informado).
 */
export function editarEntradaFixa(estado, id, dados, { agora = new Date() } = {}) {
  const lista = entradasFixasDe(estado);
  const atual = lista.find((e) => e.id === id);
  if (!atual) throw new ErroValidacao('entrada', 'Entrada fixa não encontrada.');
  const editada = {
    ...atual,
    nome: exigirNome(dados.nome),
    valorCentavos: exigirValor(dados.valorCentavos),
    dia: exigirDia(dados.dia),
    atualizadoEm: agora.toISOString(),
  };
  return { ...estado, entradasFixas: lista.map((e) => (e.id === id ? editada : e)) };
}

/**
 * Remove uma entrada fixa a partir do mês informado.
 *
 * - Criada neste mês: sai da lista (nunca valeu em outro mês).
 * - Mais antiga: termina no mês anterior, para os meses passados não mudarem.
 */
export function removerEntradaFixa(estado, id, mes, { agora = new Date() } = {}) {
  const lista = entradasFixasDe(estado);
  const atual = lista.find((e) => e.id === id);
  if (!atual) throw new ErroValidacao('entrada', 'Entrada fixa não encontrada.');
  if (atual.mesInicial >= mes) {
    return { ...estado, entradasFixas: lista.filter((e) => e.id !== id) };
  }
  const encerrada = { ...atual, mesFinal: somarMeses(mes, -1), atualizadoEm: agora.toISOString() };
  return { ...estado, entradasFixas: lista.map((e) => (e.id === id ? encerrada : e)) };
}

/* ------------------------------------------------------------------ */
/* Entradas fixas: situação no mês                                     */
/* ------------------------------------------------------------------ */

/**
 * Situação e valor de uma entrada fixa num mês.
 *
 * @returns {{ status: string, valorCentavos: number, contaCentavos: number, dia: number }}
 *   valorCentavos: o valor real (recebida) ou o padrão;
 *   contaCentavos: quanto entra no dinheiro do mês (0 em "no-saldo" e "nao-veio").
 */
export function situacaoDaEntradaNoMes(entrada, registroMes) {
  const status = registroMes.statusEntradas?.[entrada.id] ?? 'prevista';
  const real = registroMes.valoresEntradas?.[entrada.id];
  const valorCentavos = status === 'recebida' && Number.isSafeInteger(real) ? real : entrada.valorCentavos;
  const conta = status === 'prevista' || status === 'recebida';
  return {
    status,
    valorCentavos,
    contaCentavos: conta ? valorCentavos : 0,
    dia: diaDaEntradaNoMes(entrada, registroMes.mes),
  };
}

/**
 * Muda a situação de uma entrada fixa num mês.
 *
 * @param {object} estado
 * @param {string} mes
 * @param {string} id
 * @param {'prevista'|'recebida'|'no-saldo'|'nao-veio'} status
 * @param {object} [opcoes] { valorCentavos (só em "recebida": o valor real), agora }
 */
export function definirStatusDaEntrada(estado, mes, id, status, { valorCentavos, agora = new Date() } = {}) {
  const registro = exigirMesDoEstado(estado, mes);
  const entrada = entradasFixasDe(estado).find((e) => e.id === id);
  if (!entrada || !entradaAtivaNoMes(entrada, mes)) {
    throw new ErroValidacao('entrada', 'Esta entrada fixa não vale neste mês.');
  }
  if (!STATUS_ENTRADA.includes(status)) {
    throw new ErroValidacao('status', 'Escolha Prevista, Recebida, Já estava no saldo ou Não veio.');
  }

  const statusEntradas = { ...(registro.statusEntradas ?? {}) };
  if (status === 'prevista') delete statusEntradas[id];
  else statusEntradas[id] = status;

  const valoresEntradas = { ...(registro.valoresEntradas ?? {}) };
  if (status === 'recebida' && valorCentavos !== undefined) {
    exigirValor(valorCentavos, { permitirZero: true });
    if (valorCentavos === entrada.valorCentavos) delete valoresEntradas[id];
    else valoresEntradas[id] = valorCentavos;
  } else if (status !== 'recebida') {
    delete valoresEntradas[id];
  }

  return comMes(estado, registro, { statusEntradas, valoresEntradas }, agora);
}

/* ------------------------------------------------------------------ */
/* Entradas avulsas                                                    */
/* ------------------------------------------------------------------ */

/** Entradas avulsas de um mês (dados antigos não têm o campo). */
export function entradasAvulsasDe(registroMes) {
  return Array.isArray(registroMes?.entradasAvulsas) ? registroMes.entradasAvulsas : [];
}

/**
 * Registra uma entrada avulsa (dinheiro que entrou e não se repete).
 *
 * @param {object} estado
 * @param {{ valorCentavos: number, data: string, descricao?: string }} dados
 * @param {object} [opcoes] { agora, gerarId }
 */
export function adicionarEntradaAvulsa(estado, dados, { agora = new Date(), gerarId = gerarIdPadrao } = {}) {
  if (!ehDataValida(dados.data)) throw new ErroValidacao('data', 'Escolha uma data válida.');
  const registro = exigirMesDoEstado(estado, mesDaData(dados.data));
  const atuais = entradasAvulsasDe(registro);
  if (atuais.length >= MAXIMO_ENTRADAS_AVULSAS) {
    throw new ErroValidacao('entradas', `Até ${MAXIMO_ENTRADAS_AVULSAS} entradas avulsas por mês.`);
  }
  const descricao = typeof dados.descricao === 'string' ? dados.descricao.trim() : '';
  if (descricao.length > TAMANHO_DESCRICAO_ENTRADA) {
    throw new ErroValidacao('descricao', `A descrição pode ter até ${TAMANHO_DESCRICAO_ENTRADA} letras.`);
  }
  const entrada = {
    id: gerarId(),
    valorCentavos: exigirValor(dados.valorCentavos),
    data: dados.data,
    descricao,
    criadoEm: agora.toISOString(),
  };
  return comMes(estado, registro, { entradasAvulsas: [...atuais, entrada] }, agora);
}

/** Apaga uma entrada avulsa de um mês. */
export function removerEntradaAvulsa(estado, mes, id, { agora = new Date() } = {}) {
  const registro = exigirMesDoEstado(estado, mes);
  const atuais = entradasAvulsasDe(registro);
  if (!atuais.some((e) => e.id === id)) throw new ErroValidacao('entrada', 'Entrada não encontrada.');
  return comMes(estado, registro, { entradasAvulsas: atuais.filter((e) => e.id !== id) }, agora);
}

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

/**
 * O que entra no mês, em partes.
 *
 * jaEntrouCentavos: o que JÁ caiu na conta depois do saldo do início do mês
 * (entradas fixas "recebida" e avulsas). As "previstas" ainda não entraram.
 * Dados antigos, sem entradas fixas: a renda prevista conta como já entrada
 * (era assim antes, e é como a pessoa conferia com o banco).
 *
 * @param {object} registroMes
 * @param {object[]} [entradasFixas]
 * @returns {{ outrasCentavos: number, fixasCentavos: number, avulsasCentavos: number, totalCentavos: number,
 *   jaEntrouCentavos: number }}
 */
export function detalheDaRendaDoMes(registroMes, entradasFixas = []) {
  const outrasCentavos = registroMes.rendaPrevistaCentavos ?? 0;
  const situacoes = entradasAtivasNoMes(entradasFixas, registroMes.mes).map((e) => situacaoDaEntradaNoMes(e, registroMes));
  const fixasCentavos = situacoes.reduce((soma, s) => soma + s.contaCentavos, 0);
  const recebidasCentavos = situacoes.filter((s) => s.status === 'recebida').reduce((soma, s) => soma + s.contaCentavos, 0);
  const avulsasCentavos = entradasAvulsasDe(registroMes).reduce((soma, e) => soma + e.valorCentavos, 0);
  const semFixas = (entradasFixas ?? []).length === 0;
  return {
    outrasCentavos,
    fixasCentavos,
    avulsasCentavos,
    totalCentavos: outrasCentavos + fixasCentavos + avulsasCentavos,
    jaEntrouCentavos: (semFixas ? outrasCentavos : 0) + recebidasCentavos + avulsasCentavos,
  };
}

/** Diferença até a qual dois valores são considerados iguais na conferência (R$ 1,00). */
export const TOLERANCIA_CONFERENCIA = 100;

/**
 * Confere o saldo que o app calcula com o saldo do banco e aponta suspeitos.
 *
 * - App com MAIS que o banco: falta lançar um gasto, ou uma entrada foi
 *   contada duas vezes (o caso clássico: o salário já estava no saldo do
 *   início do mês e também foi marcado como recebido). Suspeitos: entradas
 *   do mês com o valor da diferença.
 * - App com MENOS que o banco: falta registrar uma entrada, ou um gasto foi
 *   lançado duas vezes. Suspeitos: gastos do mês com o valor da diferença.
 *
 * @param {object} entrada
 * @param {number} entrada.appCentavos    O que o app diz que a conta deve ter agora.
 * @param {number} entrada.bancoCentavos  O saldo do banco, digitado pela pessoa.
 * @param {object} entrada.registroMes
 * @param {object[]} [entrada.entradasFixas]
 * @param {object[]} [entrada.gastosDoMes] Lançamentos do mês (para o caso "app com menos").
 * @returns {{ diferencaCentavos: number, situacao: 'bate'|'app-maior'|'app-menor',
 *   suspeitas: { tipo: 'entrada-fixa'|'entrada-avulsa'|'gasto', nome: string, valorCentavos: number }[] }}
 */
export function conferirComBanco({ appCentavos, bancoCentavos, registroMes, entradasFixas = [], gastosDoMes = [] }) {
  const diferencaCentavos = appCentavos - bancoCentavos;
  if (Math.abs(diferencaCentavos) <= TOLERANCIA_CONFERENCIA) return { diferencaCentavos, situacao: 'bate', suspeitas: [] };
  const perto = (valor) => Math.abs(valor - Math.abs(diferencaCentavos)) <= TOLERANCIA_CONFERENCIA;

  if (diferencaCentavos > 0) {
    const suspeitas = [];
    for (const e of entradasAtivasNoMes(entradasFixas, registroMes.mes)) {
      const s = situacaoDaEntradaNoMes(e, registroMes);
      if (s.contaCentavos > 0 && perto(s.contaCentavos)) suspeitas.push({ tipo: 'entrada-fixa', nome: e.nome, valorCentavos: s.contaCentavos });
    }
    for (const e of entradasAvulsasDe(registroMes)) {
      if (perto(e.valorCentavos)) suspeitas.push({ tipo: 'entrada-avulsa', nome: e.descricao || 'Entrada avulsa', valorCentavos: e.valorCentavos });
    }
    return { diferencaCentavos, situacao: 'app-maior', suspeitas };
  }

  const suspeitas = gastosDoMes
    .filter((l) => l.excluidoEm === null && perto(l.valorCentavos))
    .map((l) => ({ tipo: 'gasto', nome: l.descricao || 'Gasto', valorCentavos: l.valorCentavos }));
  return { diferencaCentavos, situacao: 'app-menor', suspeitas };
}

/** Total que entra no mês: outras entradas previstas + entradas fixas que contam + avulsas. */
export function rendaDoMes(registroMes, entradasFixas = []) {
  return detalheDaRendaDoMes(registroMes, entradasFixas).totalCentavos;
}

/**
 * Quanto se espera receber num mês FUTURO (previsão).
 *
 * - Com entradas fixas cadastradas: a soma delas (valor padrão) naquele mês.
 * - Sem nenhuma (dados antigos): a renda prevista do mês atual, como antes.
 *
 * @param {object} registroMes O mês atual.
 * @param {object[]} entradasFixas
 * @param {string} mes O mês futuro.
 * @returns {{ centavos: number, fonte: 'entradas-fixas'|'renda-do-mes' }}
 */
export function entradaPrevistaNoMes(registroMes, entradasFixas, mes) {
  if ((entradasFixas ?? []).length > 0) {
    const centavos = entradasAtivasNoMes(entradasFixas, mes).reduce((soma, e) => soma + e.valorCentavos, 0);
    return { centavos, fonte: 'entradas-fixas' };
  }
  return { centavos: registroMes.rendaPrevistaCentavos ?? 0, fonte: 'renda-do-mes' };
}

/**
 * Atalho para quem já usava a "renda prevista" como salário: vira uma entrada
 * fixa com o mesmo valor, e a renda prevista do mês volta a zero (o dinheiro
 * do mês não muda, se a situação for "prevista" ou "recebida").
 *
 * @param {object} estado
 * @param {string} mes
 * @param {{ nome?: string, dia: number, statusNoMes?: string }} dados
 */
export function transformarRendaEmEntradaFixa(estado, mes, { nome = 'Salário', dia, statusNoMes = 'prevista' }, opcoes = {}) {
  const registro = exigirMesDoEstado(estado, mes);
  if (!(registro.rendaPrevistaCentavos > 0)) {
    throw new ErroValidacao('renda', 'Não há renda prevista neste mês para transformar.');
  }
  const agora = opcoes.agora ?? new Date();
  const comEntrada = adicionarEntradaFixa(estado, { nome, valorCentavos: registro.rendaPrevistaCentavos, dia }, mes, {
    ...opcoes, agora, statusNoMes,
  });
  return comMes(comEntrada, buscarMes(comEntrada, mes), { rendaPrevistaCentavos: 0 }, agora);
}
