/**
 * Tela Início (novo layout, 11/2026): o que a pessoa precisa ver ao abrir
 * o app, numa só olhada.
 *
 * - o número principal: quanto deve sobrar no fim do mês, com a cor e o
 *   texto da situação (cor nunca sozinha);
 * - quanto deve haver na conta agora (para conferir com o banco);
 * - avisos, do mais importante ao menos (a tela mostra um por vez);
 * - as próximas saídas: contas fixas e faturas que ainda vão sair;
 * - as categorias com orçamento que mais encheram.
 *
 * Os números vêm do resumo do mês (src/resumo-mes.js): esta tela não faz
 * conta nova, só escolhe e ordena.
 *
 * Função pura: testada no Node.
 */

import { resumoDoMes } from './resumo-mes.js';
import { mesDaData, diaDaData } from './datas.js';
import { buscarMes } from './meses.js';
import { entradasFixasDe } from './entradas.js';
import { alertaDosOrcamentos } from './orcamento.js';
import { LIMITES_PADRAO } from './veredito.js';

/** Texto de cada situação do saldo (a cor vem junto, nunca sozinha). */
export const SITUACAO_DO_SALDO = Object.freeze({
  verde: 'Dentro do previsto',
  amarelo: 'Apertado: abaixo da folga',
  vermelho: 'Vai faltar dinheiro',
});

/** Quantas próximas saídas a tela mostra. */
export const QUANTAS_SAIDAS = 4;

/** Quantas categorias a tela mostra. */
export const QUANTAS_CATEGORIAS = 3;

/**
 * Monta o Início.
 *
 * @param {object} estado Os dados do app.
 * @param {string} hoje "AAAA-MM-DD".
 * @param {object} [extras]
 * @param {boolean} [extras.backupAtrasado] O lembrete de backup (src/lembrete-backup.js) está vencido.
 * @param {object} [limites]
 * @returns {{
 *   mes: string, dia: number, diasNoMes: number, fracaoDoMes: number,
 *   deveSobrarCentavos: number, cor: string, situacao: string, naContaAgoraCentavos: number,
 *   avisos: { id: string, texto: string, link: string, rotulo: string, cor: string }[],
 *   proximas: { data: string, nome: string, valorCentavos: number, atrasada: boolean, tipo: 'conta'|'fatura' }[],
 *   categorias: { nome: string, gastoCentavos: number, orcamentoCentavos: number, fracaoUsada: number, cor: string }[]
 * }}
 */
export function resumoDoInicio(estado, hoje, { backupAtrasado = false } = {}, limites = LIMITES_PADRAO) {
  const mes = mesDaData(hoje);
  const r = resumoDoMes(estado, mes, hoje, limites);
  const registro = buscarMes(estado, mes);
  const dia = diaDaData(hoje);

  // Avisos: do que mais mexe nos números ao que só lembra.
  const avisos = [];
  if (!registro.saldoConfirmado) {
    avisos.push({
      id: 'saldo', cor: 'amarelo', link: '#ajustes/dinheiro', rotulo: 'Confirmar',
      texto: 'Confirme o saldo do início do mês: ele foi só sugerido pelo app.',
    });
  }
  if (entradasFixasDe(estado).length === 0) {
    avisos.push({
      id: 'salario', cor: 'amarelo', link: '#ajustes/dinheiro', rotulo: 'Cadastrar',
      texto: 'Cadastre o salário para a previsão dos próximos meses.',
    });
  }
  const atrasadas = r.fixos.filter((f) => f.atrasado);
  if (atrasadas.length > 0) {
    avisos.push({
      id: 'atrasadas', cor: 'vermelho', link: '#mes/contas', rotulo: 'Ver',
      texto: atrasadas.length === 1
        ? `${atrasadas[0].fixo.nome} passou do vencimento e não foi marcada como paga.`
        : `${atrasadas.length} contas passaram do vencimento e não foram marcadas como pagas.`,
    });
  }
  if (alertaDosOrcamentos(estado, mes, limites)) {
    avisos.push({
      id: 'orcamentos', cor: 'amarelo', link: '#ajustes/categorias', rotulo: 'Ajustar',
      texto: 'Os orçamentos somam mais do que o livre do mês.',
    });
  }
  if (backupAtrasado) {
    avisos.push({
      id: 'backup', cor: 'amarelo', link: '#ajustes/conta', rotulo: 'Fazer backup',
      texto: 'Faz tempo que não há backup dos seus dados.',
    });
  }

  // Próximas saídas: contas fixas e faturas ainda previstas, da mais próxima à mais distante.
  const doDia = (d) => `${mes}-${String(d).padStart(2, '0')}`;
  const proximas = [
    ...r.fixos
      .filter((f) => f.status === 'previsto')
      .map((f) => ({ data: doDia(f.diaEfetivo), nome: f.fixo.nome, valorCentavos: f.valorCentavos, atrasada: f.atrasado, tipo: 'conta' })),
    ...r.faturas
      .filter((f) => f.status === 'previsto')
      .map((f) => ({
        data: f.vencimento, nome: `Fatura ${f.formaPagamento}`, valorCentavos: f.totalNoBancoCentavos ?? f.totalCentavos,
        atrasada: f.atrasada === true, tipo: 'fatura',
      })),
  ]
    .filter((s) => s.valorCentavos > 0)
    .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome))
    .slice(0, QUANTAS_SAIDAS);

  // Categorias com orçamento: as que mais encheram primeiro.
  const categorias = r.categorias
    .filter((c) => c.orcamentoCentavos > 0 && c.categoria.excluidoEm === null)
    .sort((a, b) => b.fracaoUsada - a.fracaoUsada)
    .slice(0, QUANTAS_CATEGORIAS)
    .map((c) => ({
      nome: c.categoria.nome, gastoCentavos: c.gastoCentavos, orcamentoCentavos: c.orcamentoCentavos,
      fracaoUsada: c.fracaoUsada, cor: c.cor,
    }));

  return {
    mes,
    dia,
    diasNoMes: r.diasNoMes,
    fracaoDoMes: r.fracaoDoMes,
    deveSobrarCentavos: r.deveSobrarCentavos,
    cor: r.corSaldo,
    situacao: SITUACAO_DO_SALDO[r.corSaldo],
    naContaAgoraCentavos: r.naContaAgoraCentavos,
    avisos,
    proximas,
    categorias,
  };
}
