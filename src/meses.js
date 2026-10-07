/**
 * Vários meses no Painel Financeiro.
 *
 * Os dados do app (o "estado") guardam uma lista de meses:
 *
 *   {
 *     meses:           [ { mes: "2026-10", ... }, { mes: "2026-11", ... } ],
 *     categorias:      [...],   ← valem para todos os meses
 *     fixos:           [...],   ← cada fixo sabe de que mês até que mês vale
 *     lancamentos:     [...],   ← cada lançamento sabe a própria data
 *     formasPagamento: [...]
 *   }
 *
 * Categorias, fixos e lançamentos não são copiados de mês em mês: o mês
 * só guarda o que é dele (saldo inicial, renda prevista e ajustes de fixo).
 *
 * Funções puras: testadas no Node.
 */

import { ErroValidacao } from './erros.js';
import { ehMesValido } from './datas.js';
import { criarMes } from './modelo.js';
import { calcularSaldoProjetado, lancamentosValidosDoMes } from './veredito.js';

/**
 * Procura o registro de um mês.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {object|undefined}
 */
export function buscarMes(estado, mes) {
  return estado.meses.find((m) => m.mes === mes);
}

/**
 * Monta a "visão" de um mês, no formato que a tela de lançamento usa:
 * { registroMes, categorias, fixos, lancamentos, formasPagamento }.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {object}
 * @throws {ErroValidacao} Se o mês não existir no estado.
 */
export function dadosDoMes(estado, mes) {
  const registroMes = buscarMes(estado, mes);
  if (!registroMes) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }

  return {
    registroMes,
    categorias: estado.categorias,
    fixos: estado.fixos,
    lancamentos: estado.lancamentos,
    formasPagamento: estado.formasPagamento,
  };
}

/**
 * Quanto sobra no fim de um mês, com o que já foi lançado:
 * saldo inicial + renda prevista − fixos − lançamentos.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {number} Centavos (pode ser negativo).
 */
export function sobraDoMes(estado, mes) {
  const registroMes = buscarMes(estado, mes);
  if (!registroMes) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }

  const doMes = lancamentosValidosDoMes(estado.lancamentos, mes);
  return calcularSaldoProjetado(registroMes, estado.fixos, doMes, 0).saldoProjetadoCentavos;
}

/**
 * Virada de mês: garante que o mês novo existe nos dados.
 *
 * - Se o mês já existe, devolve o estado sem mudanças.
 * - Se não existe, cria o mês a partir do mês ANTERIOR mais recente:
 *   - saldo inicial SUGERIDO = o que sobrou daquele mês;
 *   - renda prevista = a mesma daquele mês;
 *   - saldoConfirmado = false, para a tela pedir a confirmação.
 *   Os ajustes de fixo não passam para o mês novo: eles valem só no mês deles.
 *
 * Se o app ficou meses sem ser aberto, só o mês atual é criado, com a
 * sobra do último mês que existe.
 *
 * @param {object} estado
 * @param {string} mesNovo "AAAA-MM".
 * @param {object} [opcoes] { agora, gerarId }
 * @returns {{ estado: object, criado: object|null, mesBase: string|null }}
 *   criado: o mês criado (ou null, se ele já existia);
 *   mesBase: o mês usado como base da sugestão.
 */
export function virarMes(estado, mesNovo, opcoes = {}) {
  if (!ehMesValido(mesNovo)) {
    throw new ErroValidacao('mes', `Mês inválido: "${mesNovo}". Use o formato AAAA-MM.`);
  }
  if (buscarMes(estado, mesNovo)) {
    return { estado, criado: null, mesBase: null };
  }

  // "AAAA-MM" em texto: a ordem alfabética é a ordem do calendário.
  const anteriores = estado.meses
    .map((m) => m.mes)
    .filter((m) => m < mesNovo)
    .sort();

  if (anteriores.length === 0) {
    throw new ErroValidacao(
      'mes',
      `Não há mês anterior a ${mesNovo} para sugerir o saldo inicial.`,
    );
  }

  const mesBase = anteriores[anteriores.length - 1];
  const base = buscarMes(estado, mesBase);

  const criado = criarMes(
    {
      mes: mesNovo,
      saldoInicialCentavos: sobraDoMes(estado, mesBase),
      rendaPrevistaCentavos: base.rendaPrevistaCentavos,
      saldoConfirmado: false,
    },
    opcoes,
  );

  return {
    estado: { ...estado, meses: [...estado.meses, criado] },
    criado,
    mesBase,
  };
}
