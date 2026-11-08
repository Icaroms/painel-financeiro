/**
 * Menu de Ajustes (novo layout, 11/2026): a linha de resumo embaixo de cada
 * item, para a pessoa saber o que tem lá dentro sem abrir.
 *
 * Função pura: testada no Node.
 */

import { formatarCentavos } from './dinheiro.js';
import { mesDaData } from './datas.js';
import { buscarMes } from './meses.js';
import { fixoAtivoNoMes, valorDoFixoNoMes } from './modelo.js';
import { entradasAtivasNoMes, entradasFixasDe } from './entradas.js';
import { livreParaODiaADia, alertaDosOrcamentos } from './orcamento.js';
import { lembretesDeVencimento } from './lembretes.js';

/** "1 conta" / "3 contas". */
const contar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * @param {object} estado
 * @param {string} hoje "AAAA-MM-DD".
 * @param {object} [extras]
 * @param {boolean} [extras.iaLigada]
 * @param {string} [extras.backupTexto] Ex.: "Último backup: há 3 dias".
 * @param {boolean} [extras.backupAtrasado] O lembrete de backup venceu.
 * @param {boolean} [extras.lembretesLigados] Lembretes de vencimento ligados neste aparelho.
 * @param {string} [extras.versao] Ex.: "v35".
 * @returns {{ textos: Record<string, string>, pontos: Record<string, boolean> }}
 *   textos: resumo de cada página; pontos: páginas que pedem atenção.
 */
export function resumosDosAjustes(estado, hoje, {
  iaLigada = false, backupTexto = '', backupAtrasado = false, versao = '', lembretesLigados = false,
} = {}) {
  const mes = mesDaData(hoje);
  const registro = buscarMes(estado, mes);
  const salarios = entradasAtivasNoMes(entradasFixasDe(estado), mes);
  const totalEntradas = salarios.reduce((soma, e) => soma + e.valorCentavos, 0);
  const fixos = estado.fixos.filter((f) => fixoAtivoNoMes(f, mes));
  const totalFixos = fixos.reduce((soma, f) => soma + valorDoFixoNoMes(f, registro), 0);
  const categorias = estado.categorias.filter((c) => c.excluidoEm === null);
  const livre = livreParaODiaADia(estado, mes);
  const sobra = estado.destinoSobra?.porcentagens;
  const vencendo = lembretesDeVencimento(estado, hoje).filter((l) => l.quando !== 'atrasado').length;

  const textos = {
    dinheiro: `Saldo ${formatarCentavos(registro.saldoInicialCentavos)}` +
      (salarios.length > 0 ? ` · entradas fixas ${formatarCentavos(totalEntradas)}` : ' · sem entradas fixas'),
    contas: fixos.length === 0 ? 'Nenhuma conta fixa' : `${contar(fixos.length, 'conta', 'contas')} · ${formatarCentavos(totalFixos)} neste mês`,
    categorias: `${contar(categorias.length, 'categoria', 'categorias')} · livre ${formatarCentavos(livre.livreCentavos)}`,
    pagamentos: (estado.formasPagamento ?? []).join(', ') || 'Nenhuma forma de pagamento',
    sobra: sobra ? `Reserva ${sobra.reserva}% · Investir ${sobra.investir}% · Alívio ${sobra.alivio}%` : 'Como dividir o que sobra',
    ia: iaLigada ? 'Ligada' : 'Desligada',
    lembretes: `${lembretesLigados ? 'Ligados' : 'Desligados'}` +
      (vencendo > 0 ? ` · ${contar(vencendo, 'conta vence', 'contas vencem')} hoje ou amanhã` : ''),
    conta: backupTexto || 'Conta, sincronização e backup',
    app: versao ? `Versão ${versao}` : 'Versão e atualização',
  };
  const pontos = {
    dinheiro: !registro.saldoConfirmado || salarios.length === 0,
    categorias: alertaDosOrcamentos(estado, mes) !== null,
    conta: backupAtrasado,
  };
  return { textos, pontos };
}
