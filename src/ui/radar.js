/**
 * Seção "Radar de opções" da aba Investir (Fase 04, parte 4.3a).
 *
 * - Ao abrir a aba, mostra o radar guardado no aparelho e, se a última
 *   busca tiver mais de 6 horas, busca o arquivo novo que o robô publicou.
 * - "Atualizar radar" busca na hora.
 * - Sem internet, continua mostrando o último radar guardado.
 * - Tesouro Direto do dia: filtro por tipo de rendimento e 5 títulos por página.
 *
 * A busca é só leitura de um arquivo público: nenhum dado da pessoa sai
 * do aparelho. Como em toda a pasta src/ui, aqui só fica a TELA; as regras
 * ficam em src/radar.js (testado no Node). Todo texto entra com textContent.
 */

import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { paginar } from '../historico.js';
import { quandoFoiFeita } from '../analise.js';
import {
  ENDERECO_RADAR,
  INDEXADORES,
  lerRadar,
  deveBuscarRadar,
  radarAtrasado,
  textoDaTaxa,
  titulosDoTesouro,
} from '../radar.js';

/** Tempo máximo esperando o arquivo do radar. */
const TEMPO_LIMITE_MS = 15_000;

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

/** "2035-05-15" → "15/05/2035". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/**
 * Liga a seção do radar.
 *
 * @param {object} opcoes
 * @param {() => Promise<{ radar: object, buscadoEm: string }|undefined>} opcoes.lerGuardado
 * @param {(guardado: { radar: object, buscadoEm: string }) => Promise<void>} opcoes.guardar
 * @param {typeof fetch} [opcoes.buscar] Para testes; padrão: fetch do navegador.
 * @returns {{ renderizar: () => void }}
 */
export function iniciarRadar({ lerGuardado, guardar, buscar = (...args) => fetch(...args) }) {
  const el = {
    situacao: elemento('radar-situacao'),
    fonte: elemento('radar-tesouro-fonte'),
    filtro: elemento('radar-tesouro-filtro'),
    lista: elemento('radar-tesouro'),
    paginacao: elemento('paginacao-radar-tesouro'),
    botao: elemento('botao-atualizar-radar'),
  };

  /** O que está guardado no aparelho: { radar, buscadoEm } ou null. */
  let guardado = null;
  let carregou = false;
  let buscando = false;
  let pagina = 1;

  /* ---------------- Desenho ---------------- */

  /** Botões "Anterior" e "Próxima". Com uma página só, a paginação some. */
  function montarPaginacao({ pagina: atual, totalPaginas }) {
    if (totalPaginas <= 1) {
      el.paginacao.replaceChildren();
      return;
    }
    const anterior = criar('button', { classe: 'botao-pequeno', type: 'button', texto: '‹ Anterior' });
    const proxima = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Próxima ›' });
    anterior.disabled = atual === 1;
    proxima.disabled = atual === totalPaginas;
    anterior.addEventListener('click', () => { pagina = atual - 1; desenhar(); });
    proxima.addEventListener('click', () => { pagina = atual + 1; desenhar(); });
    el.paginacao.replaceChildren(
      anterior,
      criar('span', { classe: 'pagina-atual secundario', texto: `Página ${atual} de ${totalPaginas}` }),
      proxima,
    );
  }

  /** Opções do filtro: "Todos" e só os tipos que existem no radar. */
  function preencherFiltro(radar) {
    const escolhido = el.filtro.value;
    const existentes = INDEXADORES.filter((i) => radar.tesouro.titulos.some((t) => t.indexador === i.id));
    el.filtro.replaceChildren(
      criar('option', { value: '', texto: 'Todos os tipos' }),
      ...existentes.map((i) => criar('option', { value: i.id, texto: i.nome })),
    );
    el.filtro.value = existentes.some((i) => i.id === escolhido) ? escolhido : '';
  }

  /** Linha de um título do Tesouro. */
  function linhaDoTitulo(titulo) {
    const li = criar('li', { classe: 'linha-mes' });
    const info = criar('div', { classe: 'linha-mes-info' });
    info.append(
      criar('span', { classe: 'linha-mes-nome', texto: titulo.nome }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: `${textoDaTaxa(titulo)} · vence em ${dataLonga(titulo.vencimento)}` }),
    );
    const lado = criar('div', { classe: 'linha-mes-lado' });
    lado.append(
      criar('span', { classe: 'linha-mes-valor', texto: formatarCentavos(titulo.precoCompraCentavos) }),
      criar('span', { classe: 'linha-mes-detalhe secundario', texto: 'por título' }),
    );
    li.append(info, lado);
    return li;
  }

  /** Desenha o radar guardado (ou o aviso de que ainda não há radar). */
  function desenhar() {
    el.botao.disabled = buscando;
    if (!guardado) {
      el.fonte.textContent = '';
      el.filtro.hidden = true;
      el.lista.replaceChildren(criar('li', {
        classe: 'lista-vazia secundario',
        texto: buscando ? 'Buscando o radar…' : 'Nenhum radar guardado neste aparelho ainda.',
      }));
      el.paginacao.replaceChildren();
      return;
    }

    const { radar } = guardado;
    el.fonte.replaceChildren(
      `Taxas de ${dataLonga(radar.tesouro.dataBase)} · fonte: `,
      criar('a', { href: radar.tesouro.link, target: '_blank', rel: 'noopener noreferrer', texto: radar.tesouro.fonte }),
      '.',
    );
    el.filtro.hidden = false;
    preencherFiltro(radar);

    const paginaAtual = paginar(titulosDoTesouro(radar, el.filtro.value), pagina);
    pagina = paginaAtual.pagina; // paginar() volta sozinha para a última página que ainda existe
    el.lista.replaceChildren(...paginaAtual.itens.map(linhaDoTitulo));
    montarPaginacao(paginaAtual);
  }

  /** Linha de situação: quando o robô gerou o radar, e aviso se está atrasado. */
  function textoDaSituacao(complemento = '') {
    if (!guardado) return complemento;
    const { radar } = guardado;
    let texto = `Radar gerado ${quandoFoiFeita(radar.geradoEm)}.`;
    if (radarAtrasado(radar)) texto += ' Ele não é atualizado há alguns dias: os números podem estar velhos.';
    return complemento ? `${complemento} ${texto}` : texto;
  }

  /* ---------------- Busca ---------------- */

  /**
   * Busca o radar publicado pelo robô e guarda no aparelho.
   * Em qualquer falha, o radar guardado continua na tela.
   */
  async function buscarRadar() {
    if (buscando) return;
    buscando = true;
    el.situacao.textContent = 'Buscando o radar…';
    desenhar();
    let mensagem = '';
    try {
      const resposta = await buscar(ENDERECO_RADAR, {
        cache: 'no-cache',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      if (resposta.status === 404) {
        mensagem = 'O radar ainda não foi gerado. No GitHub: aba Actions → Radar → Run workflow.';
      } else if (!resposta.ok) {
        mensagem = `O GitHub respondeu com erro (${resposta.status}). Tente de novo mais tarde.`;
      } else {
        const radar = lerRadar(await resposta.json());
        guardado = { radar, buscadoEm: new Date().toISOString() };
        await guardar(guardado);
        mensagem = 'Radar atualizado.';
      }
    } catch (falha) {
      mensagem = falha instanceof ErroValidacao
        ? falha.message
        : 'Sem internet ou o GitHub não respondeu.';
      if (guardado) mensagem += ' Mostrando o radar guardado neste aparelho.';
    } finally {
      buscando = false;
    }
    el.situacao.textContent = textoDaSituacao(mensagem);
    desenhar();
  }

  el.botao.addEventListener('click', () => buscarRadar());
  el.filtro.addEventListener('change', () => { pagina = 1; desenhar(); });

  /** Mostra o guardado e, se já passou da hora, busca o novo. */
  async function renderizar() {
    if (!carregou) {
      carregou = true;
      try {
        guardado = (await lerGuardado()) ?? null;
      } catch {
        guardado = null; // sem IndexedDB: o radar só fica na memória
      }
    }
    el.situacao.textContent = textoDaSituacao();
    desenhar();
    if (deveBuscarRadar(guardado?.buscadoEm)) buscarRadar();
  }

  return { renderizar: () => { renderizar(); } };
}
