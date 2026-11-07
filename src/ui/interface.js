/**
 * Peças de interface do novo layout (11/2026), usadas em todo o app:
 *
 * - tema: Automático (segue o aparelho), Claro ou Escuro;
 * - ocultar valores (o "olho" do Início, como nos apps de banco);
 * - folha do "+": Gasto, Entrada ou Avaliar compra;
 * - toast: mensagem rápida embaixo, com uma ação opcional ("Desfazer");
 * - ajuda "?": o texto explicativo de um cartão aparece só quando pedido.
 *
 * As escolhas de tema e de ocultar valores ficam só neste aparelho
 * (localStorage): são preferências de tela, não dados do app. Se o
 * navegador não deixar gravar, a tela funciona do mesmo jeito.
 */

const CHAVE_TEMA = 'painel-tema';
const CHAVE_OCULTAR = 'painel-ocultar';
const TEMAS = ['auto', 'claro', 'escuro'];

/** Lê uma preferência do aparelho (null se não der). */
function lerPreferencia(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/** Grava uma preferência do aparelho (sem erro se não der). */
function gravarPreferencia(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // Navegador sem armazenamento (ex.: janela privada): vale só até fechar.
  }
}

/* ------------------------------------------------------------------ */
/* Tema                                                               */
/* ------------------------------------------------------------------ */

/** Cor da barra do navegador/sistema para cada tema. */
const COR_DA_BARRA = { claro: '#F2F4F7', escuro: '#121B24' };

function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'escuro') raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  // A barra do sistema acompanha o tema escolhido (Automático: as duas metas do index.html).
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    if (tema === 'claro' || tema === 'escuro') meta.setAttribute('content', COR_DA_BARRA[tema]);
    else meta.setAttribute('content', meta.media.includes('dark') ? COR_DA_BARRA.escuro : COR_DA_BARRA.claro);
  }
}

/**
 * Liga a escolha de tema (rádios name="tema" em Ajustes).
 *
 * @param {HTMLElement} raiz Onde estão os rádios.
 */
export function iniciarTema(raiz) {
  const salvo = lerPreferencia(CHAVE_TEMA);
  const tema = TEMAS.includes(salvo) ? salvo : 'auto';
  aplicarTema(tema);
  for (const radio of raiz.querySelectorAll('input[name="tema"]')) {
    radio.checked = radio.value === tema;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      gravarPreferencia(CHAVE_TEMA, radio.value === 'auto' ? null : radio.value);
      aplicarTema(radio.value);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Ocultar valores                                                    */
/* ------------------------------------------------------------------ */

/**
 * Liga o botão do "olho": borra os valores marcados com .valor-sensivel.
 *
 * @param {HTMLButtonElement} botao
 */
export function iniciarOcultarValores(botao) {
  const raiz = document.documentElement;
  const atualizar = (ocultos) => {
    raiz.classList.toggle('valores-ocultos', ocultos);
    botao.setAttribute('aria-pressed', String(ocultos));
    const rotulo = ocultos ? 'Mostrar valores' : 'Ocultar valores';
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
  };
  atualizar(lerPreferencia(CHAVE_OCULTAR) === '1');
  botao.addEventListener('click', () => {
    const ocultos = !raiz.classList.contains('valores-ocultos');
    gravarPreferencia(CHAVE_OCULTAR, ocultos ? '1' : null);
    atualizar(ocultos);
  });
}

/* ------------------------------------------------------------------ */
/* Folha do "+"                                                       */
/* ------------------------------------------------------------------ */

/**
 * Liga a folha do botão "+". Fecha no fundo escuro, no X, no Esc e ao
 * escolher uma opção; o foco volta para o "+".
 *
 * @param {object} opcoes
 * @param {HTMLButtonElement} opcoes.botao O "+".
 * @param {HTMLElement} opcoes.fundo A folha com o fundo escuro.
 * @param {(destino: string) => void} [opcoes.aoEscolher] Avisado com o href escolhido.
 * @returns {{ abrir: () => void, fechar: () => void }}
 */
export function iniciarFolha({ botao, fundo, aoEscolher = () => {} }) {
  const folha = fundo.querySelector('.folha');

  function abrir() {
    fundo.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    // O foco vai para a primeira opção (teclado e leitores de tela).
    requestAnimationFrame(() => folha.querySelector('.opcao-folha')?.focus());
  }

  function fechar({ devolverFoco = true } = {}) {
    if (fundo.hidden) return;
    fundo.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    if (devolverFoco) botao.focus();
  }

  botao.addEventListener('click', () => (fundo.hidden ? abrir() : fechar()));
  fundo.addEventListener('click', (evento) => {
    if (evento.target === fundo) fechar();
  });
  for (const elemento of fundo.querySelectorAll('[data-fechar-folha]')) {
    elemento.addEventListener('click', () => {
      const destino = elemento.getAttribute('href');
      fechar({ devolverFoco: !destino });
      if (destino) aoEscolher(destino);
    });
  }
  fundo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fechar();
    // Tab fica dentro da folha enquanto ela está aberta.
    if (evento.key === 'Tab') {
      const focaveis = [...folha.querySelectorAll('a[href], button')];
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }
  });
  return { abrir, fechar };
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */

/**
 * Cria a função que mostra mensagens rápidas.
 *
 * @param {HTMLElement} caixa O #config-mensagem (com #toast-texto e #toast-acao).
 * @returns {(texto: string, opcoes?: { acao?: { rotulo: string, aoClicar: () => void }, duracaoMs?: number }) => void}
 */
export function criarToast(caixa) {
  const texto = caixa.querySelector('#toast-texto');
  const botao = caixa.querySelector('#toast-acao');
  let temporizador = null;
  let acaoAtual = null;

  botao.addEventListener('click', () => {
    const acao = acaoAtual;
    caixa.hidden = true;
    clearTimeout(temporizador);
    acao?.();
  });

  return function mostrar(mensagem, { acao = null, duracaoMs } = {}) {
    clearTimeout(temporizador);
    if (!mensagem) {
      caixa.hidden = true;
      return;
    }
    texto.textContent = mensagem;
    acaoAtual = acao?.aoClicar ?? null;
    botao.hidden = acao === null;
    botao.textContent = acao?.rotulo ?? '';
    // Reinicia a animação de entrada quando uma mensagem substitui outra.
    caixa.hidden = true;
    void caixa.offsetWidth;
    caixa.hidden = false;
    temporizador = setTimeout(() => {
      caixa.hidden = true;
      acaoAtual = null;
    }, duracaoMs ?? (acao ? 8000 : 5000));
  };
}

/* ------------------------------------------------------------------ */
/* Ajuda "?"                                                          */
/* ------------------------------------------------------------------ */

let contadorDeAjudas = 0;

/**
 * Troca o texto explicativo fixo de cada cartão por um botão "?" ao lado
 * do título: o texto aparece só quando a pessoa toca nele.
 *
 * Só os textos fixos: <p class="explicacao"> filho direto do cartão, logo
 * depois do título, sem id (os que têm id mudam pelo JavaScript) e sem
 * hidden (os que aparecem conforme a situação).
 *
 * @param {ParentNode} raiz Onde procurar (ex.: a vista Configurar).
 */
export function ligarAjudas(raiz) {
  for (const cartao of raiz.querySelectorAll('section.cartao')) {
    const titulo = cartao.querySelector(':scope > h2');
    const texto = titulo?.nextElementSibling;
    if (!texto || !texto.matches('p.explicacao:not([id]):not([hidden])') || texto.classList.contains('ajuda')) continue;

    contadorDeAjudas += 1;
    texto.id = `ajuda-${contadorDeAjudas}`;
    texto.classList.add('ajuda');
    texto.hidden = true;

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao-ajuda';
    botao.textContent = '?';
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-controls', texto.id);
    botao.setAttribute('aria-label', `Ajuda: ${titulo.textContent.trim()}`);
    botao.addEventListener('click', () => {
      const abrir = texto.hidden;
      texto.hidden = !abrir;
      botao.setAttribute('aria-expanded', String(abrir));
    });

    const linha = document.createElement('div');
    linha.className = 'titulo-com-ajuda';
    titulo.replaceWith(linha);
    linha.append(titulo, botao);
  }
}
