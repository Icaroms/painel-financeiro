/**
 * Calendário dos próximos 90 dias (11/2026): o que sai e o que entra em
 * cada dia, no mês atual e nos 2 seguintes.
 *
 * Saídas: contas fixas e faturas dos cartões. Entradas: entradas fixas
 * (salário...) e, no mês atual, as avulsas já registradas. Gastos do dia a
 * dia não entram: o calendário mostra o que tem data marcada.
 *
 * - Mês atual: cada item com a situação de verdade (pago, previsto,
 *   dispensado; recebida, prevista...). Dispensados e "não veio" não aparecem.
 * - Meses seguintes: previsão com os valores de sempre (contas e entradas
 *   fixas) e as parcelas já compradas no cartão.
 *
 * Função pura: testada no Node.
 */

import { mesDaData, somarMeses, diasNoMes, ehMesValido } from './datas.js';
import { ErroValidacao } from './erros.js';
import { buscarMes } from './meses.js';
import { fixoAtivoNoMes } from './modelo.js';
import { fixosDoMes } from './fixos.js';
import { saidasNoMes, faturasDoMes } from './fluxo.js';
import {
  entradasAtivasNoMes, entradasFixasDe, situacaoDaEntradaNoMes, entradasAvulsasDe, diaDaEntradaNoMes,
} from './entradas.js';

/** Quantos meses o calendário mostra (o atual e mais 2: cerca de 90 dias). */
export const MESES_DO_CALENDARIO = 3;

/** "AAAA-MM" + dia → "AAAA-MM-DD". */
const dataDoDia = (mes, dia) => `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, '0')}`;

/** Os meses que o calendário mostra, a partir de hoje. */
export function mesesDoCalendario(hoje) {
  const atual = mesDaData(hoje);
  return Array.from({ length: MESES_DO_CALENDARIO }, (_, i) => somarMeses(atual, i));
}

/**
 * Itens com data de um mês do calendário.
 *
 * @param {object} estado
 * @param {string} mes "AAAA-MM" (o atual ou um dos 2 seguintes).
 * @param {string} hoje "AAAA-MM-DD".
 * @returns {{
 *   mes: string, previsao: boolean,
 *   itens: { data: string, tipo: 'saida'|'entrada', nome: string, valorCentavos: number,
 *     origem: 'conta'|'fatura'|'entrada-fixa'|'entrada-avulsa', situacao: string }[],
 *   totalSaidasCentavos: number, totalEntradasCentavos: number
 * }} situacao: "pago", "previsto", "atrasado", "recebida", "prevista" ou "previsao" (meses seguintes).
 */
export function itensDoCalendario(estado, mes, hoje) {
  if (!ehMesValido(mes) || !mesesDoCalendario(hoje).includes(mes)) {
    throw new ErroValidacao('mes', 'O calendário mostra o mês atual e os 2 seguintes.');
  }
  const atual = mesDaData(hoje);
  const previsao = mes !== atual;
  const itens = [];

  if (!previsao) {
    const registro = buscarMes(estado, mes);
    for (const f of fixosDoMes(estado, mes, hoje)) {
      if (f.status === 'dispensado' || f.valorCentavos === 0) continue;
      itens.push({
        data: dataDoDia(mes, f.diaEfetivo), tipo: 'saida', nome: f.fixo.nome, valorCentavos: f.valorCentavos, origem: 'conta',
        situacao: f.status === 'pago' ? 'pago' : (f.diaEfetivo < Number(hoje.slice(8, 10)) ? 'atrasado' : 'previsto'),
      });
    }
    for (const fatura of faturasDoMes(estado.lancamentos, estado.cartoes ?? [], registro, estado.fixos)) {
      if (fatura.totalCentavos === 0) continue;
      itens.push({
        data: fatura.vencimento, tipo: 'saida', nome: `Fatura ${fatura.formaPagamento}`, valorCentavos: fatura.totalCentavos,
        origem: 'fatura', situacao: fatura.status === 'pago' ? 'pago' : (fatura.vencimento < hoje ? 'atrasado' : 'previsto'),
      });
    }
    for (const entrada of entradasAtivasNoMes(entradasFixasDe(estado), mes)) {
      const s = situacaoDaEntradaNoMes(entrada, registro);
      if (s.status === 'nao-veio' || s.status === 'no-saldo') continue;
      itens.push({
        data: dataDoDia(mes, s.dia), tipo: 'entrada', nome: entrada.nome, valorCentavos: s.valorCentavos,
        origem: 'entrada-fixa', situacao: s.status === 'recebida' ? 'recebida' : 'prevista',
      });
    }
    for (const avulsa of entradasAvulsasDe(registro)) {
      itens.push({
        data: avulsa.data, tipo: 'entrada', nome: avulsa.descricao || 'Entrada', valorCentavos: avulsa.valorCentavos,
        origem: 'entrada-avulsa', situacao: 'recebida',
      });
    }
  } else {
    for (const fixo of estado.fixos.filter((f) => fixoAtivoNoMes(f, mes))) {
      if (fixo.valorCentavos === 0) continue;
      itens.push({
        data: dataDoDia(mes, fixo.diaVencimento), tipo: 'saida', nome: fixo.nome, valorCentavos: fixo.valorCentavos,
        origem: 'conta', situacao: 'previsao',
      });
    }
    // Faturas: as parcelas já compradas que vencem neste mês, somadas por cartão.
    const porCartao = new Map();
    for (const s of saidasNoMes(estado.lancamentos, estado.cartoes ?? [], mes).filter((x) => x.cartao)) {
      const atualizado = porCartao.get(s.formaPagamento) ?? { data: s.vencimento, valorCentavos: 0 };
      atualizado.valorCentavos += s.valorCentavos;
      porCartao.set(s.formaPagamento, atualizado);
    }
    for (const [forma, { data, valorCentavos }] of porCartao) {
      itens.push({ data, tipo: 'saida', nome: `Fatura ${forma}`, valorCentavos, origem: 'fatura', situacao: 'previsao' });
    }
    for (const entrada of entradasAtivasNoMes(entradasFixasDe(estado), mes)) {
      itens.push({
        data: dataDoDia(mes, diaDaEntradaNoMes(entrada, mes)), tipo: 'entrada', nome: entrada.nome,
        valorCentavos: entrada.valorCentavos, origem: 'entrada-fixa', situacao: 'previsao',
      });
    }
  }

  itens.sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === b.tipo ? 0 : a.tipo === 'entrada' ? -1 : 1)
    || a.nome.localeCompare(b.nome, 'pt-BR'));
  const soma = (tipo) => itens.filter((i) => i.tipo === tipo).reduce((t, i) => t + i.valorCentavos, 0);
  return { mes, previsao, itens, totalSaidasCentavos: soma('saida'), totalEntradasCentavos: soma('entrada') };
}

/**
 * A grade do mês (semanas de domingo a sábado), com os itens de cada dia.
 *
 * @param {string} mes "AAAA-MM".
 * @param {object[]} itens De itensDoCalendario.
 * @returns {({ data: string, dia: number, itens: object[] } | null)[][]} null = dia fora do mês.
 */
export function gradeDoMes(mes, itens) {
  const [ano, numero] = mes.split('-').map(Number);
  const primeiroDiaDaSemana = new Date(Date.UTC(ano, numero - 1, 1)).getUTCDay(); // 0 = domingo
  const celulas = [
    ...Array.from({ length: primeiroDiaDaSemana }, () => null),
    ...Array.from({ length: diasNoMes(mes) }, (_, i) => {
      const data = dataDoDia(mes, i + 1);
      return { data, dia: i + 1, itens: itens.filter((item) => item.data === data) };
    }),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);
  return Array.from({ length: celulas.length / 7 }, (_, i) => celulas.slice(i * 7, i * 7 + 7));
}
