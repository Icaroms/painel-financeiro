/**
 * Resumo do mês: tudo o que a vista "Mês" mostra.
 *
 * - Quanto dinheiro o mês tem (saldo inicial + renda prevista);
 * - quanto já saiu (contas fixas já vencidas + gastos lançados);
 * - quanto ainda vai vencer (contas fixas com vencimento depois de hoje);
 * - quanto deve sobrar no fim do mês;
 * - a situação de cada categoria, com as mesmas regras do veredito;
 * - a lista de contas fixas e de gastos do mês.
 *
 * Função pura: testada no Node. A tela fica em src/ui/mes.js.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, diaDaData, diasNoMes } from './datas.js';
import { excluirRegistro } from './modelo.js';
import { buscarMes } from './meses.js';
import { fixosDoMes } from './fixos.js';
import { categoriasAtivas } from './configuracao.js';
import {
  LIMITES_PADRAO,
  calcularRitmo,
  calcularSaldoProjetado,
  lancamentosValidosDoMes,
} from './veredito.js';

/**
 * Dia que serve de "hoje" para um mês:
 * - mês atual: o dia de hoje;
 * - mês que já passou: o último dia (tudo já venceu);
 * - mês futuro: 0 (nada venceu ainda).
 */
function diaDeReferencia(mes, hoje) {
  const mesHoje = mesDaData(hoje);
  if (mes === mesHoje) return diaDaData(hoje);
  return mes < mesHoje ? diasNoMes(mes) : 0;
}

/**
 * Cor da situação de uma categoria, sem nenhum gasto novo:
 * - neutro:   sem orçamento;
 * - vermelho: passou do orçamento;
 * - amarelo:  ritmo mais de 15 pontos à frente do mês;
 * - verde:    dentro do previsto.
 */
function corDaCategoria(orcamento, gasto, mes, dia, limites) {
  if (orcamento === 0) return 'neutro';
  if (gasto > orcamento) return 'vermelho';
  if (dia === 0) return 'verde';

  const data = `${mes}-${String(dia).padStart(2, '0')}`;
  const { acelerado } = calcularRitmo(orcamento, gasto, data, limites.toleranciaRitmoPontos);
  return acelerado ? 'amarelo' : 'verde';
}

/**
 * Monta o resumo de um mês.
 *
 * @param {object} estado
 * @param {string} mes  "AAAA-MM".
 * @param {string} hoje "AAAA-MM-DD".
 * @param {object} [limites] Padrão: LIMITES_PADRAO.
 * @returns {object}
 */
export function resumoDoMes(estado, mes, hoje, limites = LIMITES_PADRAO) {
  const registro = buscarMes(estado, mes);
  if (!registro) {
    throw new ErroValidacao('mes', `O mês ${mes} não existe nos dados.`);
  }

  const dia = diaDeReferencia(mes, hoje);
  const ultimoDia = diasNoMes(mes);
  const lancamentos = lancamentosValidosDoMes(estado.lancamentos, mes);

  // Contas fixas: um vencimento no dia 31 cai no último dia dos meses mais curtos.
  const fixos = fixosDoMes(estado, mes).map((item) => {
    const diaEfetivo = Math.min(item.fixo.diaVencimento, ultimoDia);
    return { ...item, diaEfetivo, vencido: diaEfetivo <= dia };
  });

  const somar = (lista, campo) => lista.reduce((soma, item) => soma + item[campo], 0);
  const fixosVencidos = somar(fixos.filter((f) => f.vencido), 'valorCentavos');
  const fixosAVencer = somar(fixos.filter((f) => !f.vencido), 'valorCentavos');
  const totalLancamentos = somar(lancamentos, 'valorCentavos');

  const dinheiroDoMes = registro.saldoInicialCentavos + registro.rendaPrevistaCentavos;
  const { saldoProjetadoCentavos } = calcularSaldoProjetado(registro, estado.fixos, lancamentos, 0);

  let corSaldo = 'verde';
  if (saldoProjetadoCentavos < 0) corSaldo = 'vermelho';
  else if (saldoProjetadoCentavos < limites.colchaoSaldoCentavos) corSaldo = 'amarelo';

  // Categorias: as ativas e também as removidas que tiveram gasto neste mês
  // (para o total por categoria bater com o total de gastos).
  const ativas = categoriasAtivas(estado);
  const comGasto = new Set(lancamentos.map((l) => l.categoriaId));
  const categorias = estado.categorias
    .filter((c) => ativas.includes(c) || comGasto.has(c.id))
    .map((categoria) => {
      const gasto = somar(lancamentos.filter((l) => l.categoriaId === categoria.id), 'valorCentavos');
      const orcamento = categoria.orcamentoCentavos;
      return {
        categoria,
        gastoCentavos: gasto,
        orcamentoCentavos: orcamento,
        margemCentavos: orcamento > 0 ? orcamento - gasto : null,
        fracaoUsada: orcamento > 0 ? gasto / orcamento : null,
        cor: corDaCategoria(orcamento, gasto, mes, dia, limites),
      };
    });

  // Gastos do mais recente para o mais antigo (mesma data: o lançado por último primeiro).
  const nomes = new Map(estado.categorias.map((c) => [c.id, c.nome]));
  const gastos = [...lancamentos]
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm))
    .map((lancamento) => ({ lancamento, nomeCategoria: nomes.get(lancamento.categoriaId) ?? 'Sem categoria' }));

  return {
    mes,
    dia,
    diasNoMes: ultimoDia,
    fracaoDoMes: dia / ultimoDia,
    saldoConfirmado: registro.saldoConfirmado,
    dinheiroDoMesCentavos: dinheiroDoMes,
    jaSaiu: {
      fixosCentavos: fixosVencidos,
      gastosCentavos: totalLancamentos,
      totalCentavos: fixosVencidos + totalLancamentos,
    },
    aVencerCentavos: fixosAVencer,
    deveSobrarCentavos: saldoProjetadoCentavos,
    corSaldo,
    categorias,
    fixos,
    gastos,
  };
}

/**
 * Exclui um gasto lançado (exclusão suave: ele deixa de contar, mas o
 * registro continua guardado, como em todo o app).
 *
 * @param {object} estado
 * @param {string} id
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function excluirLancamento(estado, id, opcoes = {}) {
  const lancamento = estado.lancamentos.find((l) => l.id === id && l.excluidoEm === null);
  if (!lancamento) {
    throw new ErroValidacao('lancamento', 'Gasto não encontrado.');
  }
  return {
    ...estado,
    lancamentos: estado.lancamentos.map((l) => (l.id === id ? excluirRegistro(l, opcoes) : l)),
  };
}
