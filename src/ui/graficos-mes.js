/**
 * Mês → Resumo: os gráficos do mês (11/2026).
 * - "Para onde foi o dinheiro": gastos do mês por categoria;
 * - "Gastos por mês": os últimos meses registrados, o atual até hoje.
 *
 * Os números vêm de src/graficos.js (testado no Node).
 */

import { hojeLocal, tituloDoMes } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { gastosPorMes, gastosPorCategoria } from '../graficos.js';
import { colunas, barrasHorizontais } from './graficos.js';

function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

const NOMES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 0.394 → "39%"; abaixo de 1%, "menos de 1%". */
const porcento = (fatia) => (fatia < 0.01 ? 'menos de 1%' : `${Math.round(fatia * 100)}%`);

/**
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @returns {{ renderizar: () => void }}
 */
export function iniciarGraficosMes({ obterDados }) {
  const el = { categorias: elemento('grafico-categorias'), meses: elemento('grafico-meses') };

  function vazio(texto) {
    const p = document.createElement('p');
    p.className = 'vazio secundario';
    p.textContent = texto;
    return p;
  }

  function renderizar() {
    const dados = obterDados();
    if (!dados) return;
    const hoje = hojeLocal();

    const porCategoria = gastosPorCategoria(dados, hoje);
    el.categorias.replaceChildren(porCategoria.itens.length === 0
      ? vazio('Nenhum gasto lançado neste mês ainda.')
      : barrasHorizontais({
        dados: porCategoria.itens.map((i) => ({ nome: i.nome, valor: i.gastoCentavos, detalhe: porcento(i.fatia) })),
        formatar: formatarCentavos,
      }));

    const porMes = gastosPorMes(dados, hoje);
    el.meses.replaceChildren(porMes.length < 2
      ? vazio('O gráfico aparece quando houver pelo menos 2 meses registrados.')
      : colunas({
        dados: porMes.map((m) => ({
          rotulo: NOMES_CURTOS[Number(m.mes.slice(5, 7)) - 1], rotuloLongo: tituloDoMes(m.mes), valor: m.totalCentavos, parcial: m.parcial,
        })),
        formatar: formatarCentavos,
        nome: 'Gastos de cada mês',
        colunaValor: 'Gastos',
      }));
  }

  return { renderizar };
}
