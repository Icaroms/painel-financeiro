/**
 * Planejar → Calendário (11/2026): o que sai e o que entra nos próximos
 * 90 dias, mês a mês, e o gráfico do saldo previsto.
 *
 * As regras estão em src/calendario.js e src/graficos.js (testadas no Node).
 */

import { hojeLocal, tituloDoMes } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { itensDoCalendario, gradeDoMes, mesesDoCalendario } from '../calendario.js';
import { saldoPrevisto } from '../graficos.js';
import { colunas } from './graficos.js';

function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

const NOMES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (mes) => `${NOMES_CURTOS[Number(mes.slice(5, 7)) - 1]}`;
const DIAS_DA_SEMANA = [['D', 'Domingo'], ['S', 'Segunda'], ['T', 'Terça'], ['Q', 'Quarta'], ['Q', 'Quinta'], ['S', 'Sexta'], ['S', 'Sábado']];
const SITUACAO = {
  pago: 'Pago', previsto: 'Previsto', atrasado: 'Atrasado', recebida: 'Recebida', prevista: 'Prevista', previsao: 'Previsão',
};

/** "2026-11-10" → "terça, 10 de novembro". */
function dataPorExtenso(data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

/**
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @returns {{ renderizar: () => void }}
 */
export function iniciarCalendario({ obterDados }) {
  const el = {
    saldo: elemento('calendario-saldo'),
    titulo: elemento('calendario-titulo'),
    anterior: elemento('calendario-anterior'),
    seguinte: elemento('calendario-seguinte'),
    totais: elemento('calendario-totais'),
    grade: elemento('calendario-grade'),
    dia: elemento('calendario-dia'),
  };
  let indiceMes = 0;
  let selecionado = null;

  function renderizarDia(calendario) {
    const hoje = hojeLocal();
    const data = selecionado;
    const itens = calendario.itens.filter((i) => i.data === data);
    const cabecalho = criar('h3', { classe: 'calendario-dia-titulo', texto: `${dataPorExtenso(data)}${data === hoje ? ' · hoje' : ''}` });
    if (itens.length === 0) {
      el.dia.replaceChildren(cabecalho, criar('p', { classe: 'vazio secundario', texto: 'Nada marcado para este dia.' }));
      return;
    }
    const lista = criar('ul', { classe: 'lista-simples' });
    for (const item of itens) {
      const li = criar('li');
      const nome = criar('span', { classe: 'nome' });
      nome.append(
        criar('span', { classe: `marca-fluxo ${item.tipo}`, texto: item.tipo === 'entrada' ? '+' : '−', 'aria-hidden': 'true' }),
        ` ${item.nome}`,
      );
      li.append(
        nome,
        criar('span', { classe: `situacao-item ${item.situacao}`, texto: SITUACAO[item.situacao] }),
        criar('span', {
          classe: 'valor valor-sensivel',
          texto: `${item.tipo === 'entrada' ? '+' : '−'} ${formatarCentavos(item.valorCentavos)}`,
          'aria-label': `${item.tipo === 'entrada' ? 'entra' : 'sai'} ${formatarCentavos(item.valorCentavos)}`,
        }),
      );
      lista.append(li);
    }
    el.dia.replaceChildren(cabecalho, lista);
  }

  function renderizar() {
    const dados = obterDados();
    if (!dados) return;
    const hoje = hojeLocal();
    const meses = mesesDoCalendario(hoje);
    indiceMes = Math.min(Math.max(indiceMes, 0), meses.length - 1);
    const mes = meses[indiceMes];
    const calendario = itensDoCalendario(dados, mes, hoje);

    // Saldo previsto (gráfico): o atual e os 5 seguintes.
    const previsto = saldoPrevisto(dados, hoje);
    el.saldo.replaceChildren(colunas({
      dados: previsto.map((m) => ({
        rotulo: mesCurto(m.mes), rotuloLongo: tituloDoMes(m.mes), valor: m.sobraCentavos, parcial: false,
      })),
      formatar: formatarCentavos,
      nome: 'Saldo previsto no fim de cada mês',
      inicial: 0,
      colunaValor: 'Saldo no fim do mês',
    }));

    el.titulo.textContent = `${tituloDoMes(mes)}${calendario.previsao ? ' · previsão' : ''}`;
    el.anterior.disabled = indiceMes === 0;
    el.seguinte.disabled = indiceMes === meses.length - 1;
    el.totais.replaceChildren(
      criar('span', { texto: 'Sai ' }), criar('strong', { classe: 'valor-sensivel', texto: formatarCentavos(calendario.totalSaidasCentavos) }),
      criar('span', { texto: ' · Entra ' }), criar('strong', { classe: 'valor-sensivel', texto: formatarCentavos(calendario.totalEntradasCentavos) }),
    );

    // Dia marcado: hoje (no mês atual) ou o primeiro com algo (nos seguintes).
    if (!selecionado || !selecionado.startsWith(mes)) {
      selecionado = mes === hoje.slice(0, 7) ? hoje : (calendario.itens[0]?.data ?? `${mes}-01`);
    }

    const cabecalho = criar('div', { classe: 'calendario-semana', 'aria-hidden': 'true' });
    for (const [letra] of DIAS_DA_SEMANA) cabecalho.append(criar('span', { texto: letra }));
    const linhas = gradeDoMes(mes, calendario.itens).map((semana) => {
      const linha = criar('div', { classe: 'calendario-semana' });
      for (const dia of semana) {
        if (dia === null) {
          linha.append(criar('span', { classe: 'calendario-vazio' }));
          continue;
        }
        const saidas = dia.itens.filter((i) => i.tipo === 'saida').length;
        const entradas = dia.itens.filter((i) => i.tipo === 'entrada').length;
        const partes = [dataPorExtenso(dia.data)];
        if (saidas) partes.push(`${saidas} ${saidas === 1 ? 'saída' : 'saídas'}`);
        if (entradas) partes.push(`${entradas} ${entradas === 1 ? 'entrada' : 'entradas'}`);
        const botao = criar('button', {
          type: 'button',
          classe: `calendario-celula${dia.data === hoje ? ' hoje' : ''}${dia.data < hoje ? ' passado' : ''}`,
          'aria-pressed': String(dia.data === selecionado),
          'aria-label': partes.join(', '),
        });
        const marcas = criar('span', { classe: 'calendario-marcas', 'aria-hidden': 'true' });
        if (saidas) marcas.append(criar('span', { classe: 'marca-fluxo saida', texto: '−' }));
        if (entradas) marcas.append(criar('span', { classe: 'marca-fluxo entrada', texto: '+' }));
        botao.append(criar('span', { classe: 'calendario-numero', texto: String(dia.dia) }), marcas);
        botao.addEventListener('click', () => {
          selecionado = dia.data;
          renderizar();
          // A grade é refeita: o foco volta para o dia escolhido (teclado e leitores de tela).
          el.grade.querySelector('[aria-pressed="true"]')?.focus();
        });
        linha.append(botao);
      }
      return linha;
    });
    el.grade.replaceChildren(cabecalho, ...linhas);
    renderizarDia(calendario);
  }

  el.anterior.addEventListener('click', () => {
    indiceMes -= 1;
    selecionado = null;
    renderizar();
  });
  el.seguinte.addEventListener('click', () => {
    indiceMes += 1;
    selecionado = null;
    renderizar();
  });

  return { renderizar };
}
