/**
 * Vista "Histórico": todos os gastos de todos os meses e os totais por
 * semana (segunda a domingo), com filtro por categoria.
 *
 * As duas listas mostram 5 itens por página, com botões Anterior e
 * Próxima: a página nunca vira uma rolagem sem fim.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. Os números vêm de
 * src/historico.js, testado no Node.
 */

import { hojeLocal } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { tituloDoMes } from '../painel.js';
import {
  categoriasDoHistorico,
  mesesDoHistorico,
  filtrarGastos,
  semanasDeGastos,
  paginar,
} from '../historico.js';

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** Cria um elemento com classe, texto e atributos opcionais. */
function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** "2026-11-03" → "03/11". */
const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** Valor especial dos filtros para "todas" / "todos". */
const TODOS = '';

/**
 * Liga a vista Histórico.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @returns {{ renderizar: () => void }}
 */
export function iniciarHistorico({ obterDados }) {
  const el = {
    filtroCategoria: elemento('historico-categoria'),
    filtroMes: elemento('historico-mes'),
    media: elemento('historico-media'),
    semanas: elemento('historico-semanas'),
    total: elemento('historico-total'),
    gastos: elemento('historico-gastos'),
    paginacaoSemanas: elemento('paginacao-semanas'),
    paginacaoGastos: elemento('paginacao-gastos'),
  };

  /** Página atual de cada lista. Volta para a 1 quando um filtro muda. */
  const paginas = { semanas: 1, gastos: 1 };

  /**
   * Monta os botões "Anterior" e "Próxima" de uma lista.
   * Com uma página só, a paginação some.
   *
   * @param {HTMLElement} nav
   * @param {{ pagina: number, totalPaginas: number }} resultado
   * @param {(novaPagina: number) => void} irPara
   */
  function montarPaginacao(nav, { pagina, totalPaginas }, irPara) {
    if (totalPaginas <= 1) {
      nav.replaceChildren();
      return;
    }
    const anterior = criar('button', { classe: 'botao-pequeno', type: 'button', texto: '‹ Anterior' });
    const proxima = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Próxima ›' });
    anterior.disabled = pagina === 1;
    proxima.disabled = pagina === totalPaginas;
    anterior.addEventListener('click', () => irPara(pagina - 1));
    proxima.addEventListener('click', () => irPara(pagina + 1));
    nav.replaceChildren(
      anterior,
      criar('span', { classe: 'pagina-atual secundario', texto: `Página ${pagina} de ${totalPaginas}` }),
      proxima,
    );
  }

  /** Recria as opções de um select, mantendo a escolha atual se ela ainda existir. */
  function preencherSelect(select, opcoes, rotuloTodos) {
    const escolhida = select.value;
    select.replaceChildren(
      criar('option', { value: TODOS, texto: rotuloTodos }),
      ...opcoes.map(({ valor, rotulo }) => criar('option', { value: valor, texto: rotulo })),
    );
    select.value = opcoes.some((o) => o.valor === escolhida) ? escolhida : TODOS;
  }

  function renderizarSemanas(categoriaId) {
    const hoje = hojeLocal();
    const { semanas, mediaCentavos, semanasCompletas } = semanasDeGastos(obterDados(), categoriaId, hoje);

    el.media.replaceChildren(
      ...(mediaCentavos === null
        ? ['A média aparece depois da primeira semana completa.']
        : [
            'Média por semana: ',
            criar('strong', { texto: formatarCentavos(mediaCentavos) }),
            ` (${semanasCompletas} semana${semanasCompletas === 1 ? '' : 's'} completa${semanasCompletas === 1 ? '' : 's'})`,
          ]),
    );

    if (semanas.length === 0) {
      el.semanas.replaceChildren(criar('li', { classe: 'lista-vazia secundario', texto: 'Nenhum gasto ainda.' }));
      el.paginacaoSemanas.replaceChildren();
      return;
    }

    const pagina = paginar(semanas, paginas.semanas);
    paginas.semanas = pagina.pagina;
    montarPaginacao(el.paginacaoSemanas, pagina, (nova) => {
      paginas.semanas = nova;
      renderizarSemanas(categoriaId);
    });

    el.semanas.replaceChildren(
      ...pagina.itens.map((s) => {
        const li = criar('li', { classe: 'linha-mes' });
        const info = criar('div', { classe: 'linha-mes-info' });
        info.append(
          criar('span', {
            classe: 'linha-mes-nome',
            texto: `${dataCurta(s.inicio)} a ${dataCurta(s.fim)}${s.atual ? ' (esta semana)' : ''}`,
          }),
          criar('span', {
            classe: 'secundario linha-mes-detalhe',
            texto: s.quantidade === 0 ? 'Nenhum gasto' : `${s.quantidade} gasto${s.quantidade === 1 ? '' : 's'}`,
          }),
        );
        li.append(info, criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(s.totalCentavos) }));
        if (s.quantidade === 0) li.classList.add('a-vencer'); // valor apagado, como "nada aconteceu"
        return li;
      }),
    );
  }

  function renderizarGastos(categoriaId, mes) {
    const { gastos, totalCentavos } = filtrarGastos(obterDados(), { categoriaId, mes });

    el.total.replaceChildren(
      `${gastos.length} gasto${gastos.length === 1 ? '' : 's'}, total: `,
      criar('strong', { texto: formatarCentavos(totalCentavos) }),
    );

    const pagina = paginar(gastos, paginas.gastos);
    paginas.gastos = pagina.pagina;
    montarPaginacao(el.paginacaoGastos, pagina, (nova) => {
      paginas.gastos = nova;
      renderizarGastos(categoriaId, mes);
    });

    el.gastos.replaceChildren(
      ...(gastos.length === 0
        ? [criar('li', { classe: 'lista-vazia secundario', texto: 'Nenhum gasto com esses filtros.' })]
        : pagina.itens.map(({ lancamento, nomeCategoria }) => {
            const li = criar('li', { classe: 'linha-mes' });
            const info = criar('div', { classe: 'linha-mes-info' });
            const detalhe = [dataCurta(lancamento.data), lancamento.formaPagamento, lancamento.descricao || null]
              .filter(Boolean).join(' · ');
            info.append(
              criar('span', { classe: 'linha-mes-nome', texto: nomeCategoria }),
              criar('span', { classe: 'secundario linha-mes-detalhe', texto: detalhe }),
            );
            li.append(info, criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(lancamento.valorCentavos) }));
            return li;
          })),
    );
  }

  /** Lê os filtros e redesenha as duas listas. */
  function aplicarFiltros() {
    const categoriaId = el.filtroCategoria.value === TODOS ? null : el.filtroCategoria.value;
    const mes = el.filtroMes.value === TODOS ? null : el.filtroMes.value;
    renderizarSemanas(categoriaId);
    renderizarGastos(categoriaId, mes);
  }

  // Filtro novo: as listas voltam para a primeira página.
  el.filtroCategoria.addEventListener('change', () => {
    paginas.semanas = 1;
    paginas.gastos = 1;
    aplicarFiltros();
  });
  el.filtroMes.addEventListener('change', () => {
    paginas.gastos = 1;
    aplicarFiltros();
  });

  function renderizar() {
    const dados = obterDados();
    preencherSelect(
      el.filtroCategoria,
      categoriasDoHistorico(dados).map((c) => ({ valor: c.id, rotulo: c.removida ? `${c.nome} (removida)` : c.nome })),
      'Todas as categorias',
    );
    preencherSelect(
      el.filtroMes,
      mesesDoHistorico(dados).map((m) => ({ valor: m, rotulo: tituloDoMes(m) })),
      'Todos os meses',
    );
    aplicarFiltros();
  }

  return { renderizar };
}
