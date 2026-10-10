/**
 * Resumo do mês: tudo o que a vista "Mês" mostra.
 *
 * - Quanto dinheiro o mês tem (saldo inicial + renda prevista);
 * - quanto já foi PAGO (concretizado): contas pagas + gastos à vista + faturas pagas;
 * - quanto ainda está PREVISTO (estipulado): contas e faturas que ainda vão sair;
 * - as faturas de cartão que vencem no mês;
 * - quanto deve sobrar no fim do mês;
 * - quanto deve estar na conta agora (para conferir com o banco);
 * - a situação de cada categoria, com as mesmas regras do veredito;
 * - a lista de contas fixas e de gastos do mês.
 *
 * Função pura: testada no Node. A tela fica em src/ui/mes.js.
 */

import { ErroValidacao } from './erros.js';
import { mesDaData, diaDaData, diasNoMes } from './datas.js';
import { excluirRegistro } from './modelo.js';
import { buscarMes } from './meses.js';
import { fixosDoMes, diaDeReferencia } from './fixos.js';
import { saidasNoMes, faturasDoMes } from './fluxo.js';
import { categoriasAtivas } from './configuracao.js';
import {
  LIMITES_PADRAO,
  calcularRitmo,
  calcularSaldoProjetado,
  lancamentosValidosDoMes,
} from './veredito.js';

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

  // Contas fixas com a situação do mês. "Atrasada": prevista e já passou do vencimento.
  const ORDEM = { atrasada: 0, previsto: 1, pago: 2, dispensado: 3 };
  const fixos = fixosDoMes(estado, mes, hoje)
    .map((item) => ({ ...item, atrasado: item.status === 'previsto' && item.diaEfetivo < dia }))
    // O que pede ação vem primeiro: atrasadas, previstas, pagas e, por último, dispensadas.
    .sort((a, b) =>
      ORDEM[a.atrasado ? 'atrasada' : a.status] - ORDEM[b.atrasado ? 'atrasada' : b.status]
      || a.diaEfetivo - b.diaEfetivo);

  const somar = (lista, campo) => lista.reduce((soma, item) => soma + item[campo], 0);
  const fixosPagos = somar(fixos.filter((f) => f.status === 'pago'), 'valorCentavos');
  const fixosPrevistos = somar(fixos.filter((f) => f.status === 'previsto'), 'valorCentavos');

  // O que sai da conta no mês: gastos à vista (na data deles) e faturas (no vencimento).
  // Uma compra no cartão aparece nos gastos e nas categorias do mês da compra,
  // mas o dinheiro dela só sai na fatura.
  const cartoes = estado.cartoes ?? [];
  const saidas = saidasNoMes(estado.lancamentos, cartoes, mes);
  const gastosAVista = somar(saidas.filter((s) => !s.cartao), 'valorCentavos');
  const faturas = faturasDoMes(estado.lancamentos, cartoes, registro)
    .map((f) => ({ ...f, atrasada: f.status === 'previsto' && diaDaData(f.vencimento) < dia }));
  const faturasPagas = somar(faturas.filter((f) => f.status === 'pago'), 'totalCentavos');
  const faturasPrevistas = somar(faturas.filter((f) => f.status === 'previsto'), 'totalCentavos');

  const dinheiroDoMes = registro.saldoInicialCentavos + registro.rendaPrevistaCentavos;
  const { saldoProjetadoCentavos } = calcularSaldoProjetado(registro, estado.fixos, saidas, 0);
  const jaPagoTotal = fixosPagos + gastosAVista + faturasPagas;

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
    // Concretizado: o que já saiu de verdade.
    jaPago: {
      fixosCentavos: fixosPagos,
      gastosCentavos: gastosAVista,
      faturasCentavos: faturasPagas,
      totalCentavos: jaPagoTotal,
    },
    // Estipulado: contas e faturas que ainda vão sair (as contas dispensadas não contam).
    previstoCentavos: fixosPrevistos + faturasPrevistas,
    deveSobrarCentavos: saldoProjetadoCentavos,
    // Dinheiro do mês menos o que já foi pago: deve bater com o saldo do banco.
    naContaAgoraCentavos: dinheiroDoMes - jaPagoTotal,
    faturas,
    contagemFixos: {
      previstas: fixos.filter((f) => f.status === 'previsto').length,
      atrasadas: fixos.filter((f) => f.atrasado).length,
      pagas: fixos.filter((f) => f.status === 'pago').length,
      dispensadas: fixos.filter((f) => f.status === 'dispensado').length,
    },
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
