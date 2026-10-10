/**
 * Destino da sobra (Fase 04, parte 4.1).
 *
 * A sobra prevista do mês ACIMA da folga de R$ 200 é dividida entre três
 * destinos, com porcentagens que a pessoa escolhe em Configurar:
 * - Reserva de emergência;
 * - Investir;
 * - Alívio do mês seguinte (fica na conta e ajuda o próximo mês).
 *
 * Regra "reserva primeiro" (decisão de 10/10/2026): enquanto a reserva não
 * chega na meta, vale a divisão escolhida; o que passaria da meta vai para
 * Investir. Com a reserva completa, a parte dela inteira vai para Investir.
 *
 * Meta da reserva = custo do mês × meses da meta (padrão: 6).
 * Custo do mês = contas fixas do mês (valor de sempre) + orçamentos das categorias.
 *
 * Reserva atual (desde a parte 4.2c): a soma do valor atual dos investimentos
 * marcados como reserva na aba Investir (src/carteira.js). Antes, ela era
 * digitada em Configurar; esse valor antigo continua guardado nos dados
 * (destinoSobra.reservaAtualCentavos), mas só aparece como aviso para a
 * pessoa cadastrar esse dinheiro na carteira.
 *
 * É uma SUGESTÃO calculada: o app não move dinheiro nenhum. Contas com
 * números inteiros de centavos; os centavos que sobram da divisão vão
 * para o Alívio, para a soma bater exatamente.
 *
 * Funções puras: testadas no Node. As telas ficam em src/ui/destino.js.
 */

import { ErroValidacao } from './erros.js';
import { fixoAtivoNoMes } from './modelo.js';
import { categoriasAtivas } from './configuracao.js';
import { resumoDoMes } from './resumo-mes.js';
import { LIMITES_PADRAO } from './veredito.js';
import { reservaDaCarteira } from './carteira.js';

/** Configuração inicial (decisões de 10/10/2026). */
export const DESTINO_PADRAO = Object.freeze({
  porcentagens: Object.freeze({ reserva: 70, investir: 20, alivio: 10 }),
  metaMeses: 6,
});

/** Limites aceitos para a meta da reserva, em meses. */
export const META_MESES_MINIMO = 1;
export const META_MESES_MAXIMO = 24;

/**
 * Configuração do destino da sobra, com os valores padrão para o que
 * faltar (dados gravados antes da Fase 04 não têm o campo).
 *
 * @param {object} estado
 * @returns {{ porcentagens: { reserva: number, investir: number, alivio: number },
 *   metaMeses: number, reservaDigitadaCentavos: number }}
 *   reservaDigitadaCentavos: a reserva digitada em Configurar antes da 4.2c (0 se não houver).
 */
export function configuracaoDoDestino(estado) {
  const salvo = estado.destinoSobra ?? {};
  return {
    porcentagens: { ...DESTINO_PADRAO.porcentagens, ...(salvo.porcentagens ?? {}) },
    metaMeses: salvo.metaMeses ?? DESTINO_PADRAO.metaMeses,
    reservaDigitadaCentavos: salvo.reservaAtualCentavos ?? 0,
  };
}

/** Exige uma porcentagem inteira de 0 a 100. */
function exigirPorcentagem(valor, campo, rotulo) {
  if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
    throw new ErroValidacao(campo, `${rotulo}: use um número inteiro de 0 a 100.`);
  }
  return valor;
}

/**
 * Salva a configuração do destino da sobra. A reserva digitada antes da
 * 4.2c (se houver) continua guardada como estava.
 *
 * @param {object} estado
 * @param {object} dados
 * @param {{ reserva: number, investir: number, alivio: number }} dados.porcentagens Somam 100.
 * @param {number} dados.metaMeses 1 a 24.
 * @returns {object} Estado novo.
 */
export function salvarDestino(estado, { porcentagens, metaMeses }) {
  const reserva = exigirPorcentagem(porcentagens?.reserva, 'reserva', 'Reserva');
  const investir = exigirPorcentagem(porcentagens?.investir, 'investir', 'Investir');
  const alivio = exigirPorcentagem(porcentagens?.alivio, 'alivio', 'Alívio');
  if (reserva + investir + alivio !== 100) {
    throw new ErroValidacao('porcentagens', `As porcentagens precisam somar 100% (agora somam ${reserva + investir + alivio}%).`);
  }
  if (!Number.isInteger(metaMeses) || metaMeses < META_MESES_MINIMO || metaMeses > META_MESES_MAXIMO) {
    throw new ErroValidacao('metaMeses', `A meta da reserva deve ser de ${META_MESES_MINIMO} a ${META_MESES_MAXIMO} meses.`);
  }
  return {
    ...estado,
    destinoSobra: { ...(estado.destinoSobra ?? {}), porcentagens: { reserva, investir, alivio }, metaMeses },
  };
}

/**
 * Custo do mês: as contas fixas que contam no mês (pelo valor de sempre,
 * mesmo as dispensadas neste mês) + os orçamentos das categorias ativas.
 * É a base da meta da reserva: quanto um mês "normal" custa.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {{ contasFixasCentavos: number, orcamentosCentavos: number, totalCentavos: number }}
 */
export function custoDoMes(estado, mes) {
  const contasFixasCentavos = estado.fixos
    .filter((f) => fixoAtivoNoMes(f, mes))
    .reduce((soma, f) => soma + f.valorCentavos, 0);
  const orcamentosCentavos = categoriasAtivas(estado).reduce((soma, c) => soma + c.orcamentoCentavos, 0);
  return { contasFixasCentavos, orcamentosCentavos, totalCentavos: contasFixasCentavos + orcamentosCentavos };
}

/**
 * Situação da reserva de emergência em relação à meta.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM".
 * @returns {{ custo: object, metaMeses: number, metaCentavos: number, reservaAtualCentavos: number,
 *   investimentosNaReserva: number, reservaDigitadaCentavos: number,
 *   faltaCentavos: number, fracao: number, completa: boolean }}
 *   reservaAtualCentavos: soma dos investimentos marcados como reserva na carteira.
 *   investimentosNaReserva: quantos investimentos estão marcados.
 *   reservaDigitadaCentavos: valor digitado antes da 4.2c (só para o aviso de transição).
 *   fracao: de 0 a 1 (1 = meta atingida; acima da meta também é 1).
 */
export function situacaoDaReserva(estado, mes) {
  const { metaMeses, reservaDigitadaCentavos } = configuracaoDoDestino(estado);
  const naCarteira = reservaDaCarteira(estado);
  const reservaAtualCentavos = naCarteira.totalCentavos;
  const custo = custoDoMes(estado, mes);
  const metaCentavos = custo.totalCentavos * metaMeses;
  const faltaCentavos = Math.max(0, metaCentavos - reservaAtualCentavos);
  return {
    custo,
    metaMeses,
    metaCentavos,
    reservaAtualCentavos,
    investimentosNaReserva: naCarteira.itens.length,
    reservaDigitadaCentavos,
    faltaCentavos,
    fracao: metaCentavos === 0 ? 1 : Math.min(1, reservaAtualCentavos / metaCentavos),
    completa: faltaCentavos === 0,
  };
}

/**
 * Divide a sobra prevista do mês (acima da folga) entre os três destinos.
 *
 * @param {object} estado
 * @param {string} mes  "AAAA-MM".
 * @param {string} hoje "AAAA-MM-DD".
 * @param {object} [limites] Padrão: LIMITES_PADRAO (folga de R$ 200).
 * @returns {{
 *   sobraCentavos: number,      // o "deve sobrar" da aba Mês
 *   folgaCentavos: number,      // R$ 200, que não é dividido
 *   aDividirCentavos: number,   // sobra acima da folga (zero se não houver)
 *   reservaCentavos: number, investirCentavos: number, alivioCentavos: number,
 *   paraInvestirDaReservaCentavos: number, // o que passou da meta e foi para Investir
 *   porcentagens: object,
 *   reserva: object             // situacaoDaReserva
 * }}
 */
export function dividirSobra(estado, mes, hoje, limites = LIMITES_PADRAO) {
  const { porcentagens } = configuracaoDoDestino(estado);
  const reserva = situacaoDaReserva(estado, mes);
  const sobraCentavos = resumoDoMes(estado, mes, hoje, limites).deveSobrarCentavos;
  const folgaCentavos = limites.colchaoSaldoCentavos;
  const aDividirCentavos = Math.max(0, sobraCentavos - folgaCentavos);

  // Divisão pelas porcentagens (arredondando para baixo).
  const pelaReserva = Math.floor((aDividirCentavos * porcentagens.reserva) / 100);
  const pelaInvestir = Math.floor((aDividirCentavos * porcentagens.investir) / 100);

  // Reserva primeiro: ela recebe só o que falta para a meta; o resto vai para Investir.
  const reservaCentavos = Math.min(pelaReserva, reserva.faltaCentavos);
  const paraInvestirDaReservaCentavos = pelaReserva - reservaCentavos;
  const investirCentavos = pelaInvestir + paraInvestirDaReservaCentavos;
  // O Alívio fica com a sua parte e com os centavos do arredondamento: a soma bate exatamente.
  const alivioCentavos = aDividirCentavos - reservaCentavos - investirCentavos;

  return {
    sobraCentavos,
    folgaCentavos,
    aDividirCentavos,
    reservaCentavos,
    investirCentavos,
    alivioCentavos,
    paraInvestirDaReservaCentavos,
    porcentagens,
    reserva,
  };
}
