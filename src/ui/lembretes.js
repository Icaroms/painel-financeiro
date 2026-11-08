/**
 * Lembretes de vencimento no aparelho (11/2026): Ajustes → Lembretes.
 *
 * Com os lembretes ligados e a permissão do navegador, o app mostra uma
 * notificação para cada conta ou fatura que vence hoje ou amanhã (e para
 * as atrasadas), uma vez por dia em cada aparelho. As regras estão em
 * src/lembretes.js (testadas no Node).
 *
 * Limite honesto: sem servidor de notificações, o aviso aparece quando o
 * app é aberto ou volta para a tela (e a cada 30 minutos com ele aberto).
 * Avisos com o app totalmente fechado precisam do servidor hospedado
 * (Web Push, parte 5.6).
 *
 * As escolhas ficam só neste aparelho (localStorage): notificação é coisa
 * de cada aparelho, não dos dados.
 */

import { hojeLocal } from '../datas.js';
import { lembretesDeVencimento, lembretesNovos, chaveAvisada } from '../lembretes.js';

const CHAVE_LIGADOS = 'painel-lembretes';
const CHAVE_AVISADOS = 'painel-lembretes-avisados';
const INTERVALO_MS = 30 * 60 * 1000;

function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento: os lembretes valem só até fechar o app.
  }
}

/** Chaves já avisadas HOJE neste aparelho (a lista recomeça a cada dia). */
function avisadosDeHoje(hoje) {
  try {
    const salvo = JSON.parse(ler(CHAVE_AVISADOS) ?? 'null');
    return salvo?.dia === hoje && Array.isArray(salvo.chaves) ? salvo.chaves : [];
  } catch {
    return [];
  }
}

/** O navegador permite notificações? (iPhone: só com o app instalado na Tela de Início, iOS 16.4+) */
const temNotificacao = () => 'Notification' in window && 'serviceWorker' in navigator;

/**
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @returns {{ verificar: () => Promise<void>, renderizar: () => void, ligados: () => boolean }}
 */
export function iniciarLembretes({ obterDados }) {
  const el = {
    ligados: document.getElementById('lembretes-ligados'),
    situacao: document.getElementById('lembretes-situacao'),
    testar: document.getElementById('lembretes-testar'),
  };
  const ligados = () => ler(CHAVE_LIGADOS) === '1';

  async function mostrar(lembrete) {
    const registro = await navigator.serviceWorker.ready;
    await registro.showNotification(lembrete.titulo, {
      body: lembrete.texto,
      tag: chaveAvisada(lembrete), // o mesmo aviso não se acumula
      icon: 'icones/icone-192.png',
      badge: 'icones/icone-192.png',
      data: { endereco: './#planejar/calendario' },
    });
  }

  /** Avisa o que ainda não foi avisado hoje (só com os lembretes ligados e a permissão dada). */
  async function verificar() {
    const dados = obterDados();
    if (!dados || !ligados() || !temNotificacao() || Notification.permission !== 'granted') return;
    const hoje = hojeLocal();
    const avisados = avisadosDeHoje(hoje);
    const novos = lembretesNovos(lembretesDeVencimento(dados, hoje), avisados);
    if (novos.length === 0) return;
    try {
      for (const lembrete of novos) await mostrar(lembrete);
      gravar(CHAVE_AVISADOS, JSON.stringify({ dia: hoje, chaves: [...avisados, ...novos.map(chaveAvisada)] }));
    } catch {
      // Notificação recusada pelo sistema: tenta de novo na próxima verificação.
    }
  }

  function renderizar() {
    if (!el.ligados) return;
    el.ligados.checked = ligados();
    if (!temNotificacao()) {
      el.ligados.disabled = true;
      el.testar.hidden = true;
      el.situacao.textContent = 'Este navegador não mostra notificações. No iPhone, instale o app na Tela de Início '
        + '(Compartilhar → Adicionar à Tela de Início) e use o iOS 16.4 ou mais novo.';
      return;
    }
    const permissao = Notification.permission;
    el.testar.hidden = !(ligados() && permissao === 'granted');
    el.situacao.textContent = {
      granted: ligados() ? 'Ligados neste aparelho.' : 'Desligados.',
      denied: 'As notificações estão bloqueadas para este app nos ajustes do aparelho/navegador. Libere lá para usar os lembretes.',
      default: ligados() ? 'Falta permitir as notificações.' : 'Desligados.',
    }[permissao];
  }

  el.ligados?.addEventListener('change', async () => {
    if (el.ligados.checked) {
      // O pedido de permissão precisa vir de um toque da pessoa (aqui).
      const permissao = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permissao !== 'granted') {
        el.ligados.checked = false;
        gravar(CHAVE_LIGADOS, null);
        renderizar();
        return;
      }
      gravar(CHAVE_LIGADOS, '1');
      renderizar();
      await verificar();
    } else {
      gravar(CHAVE_LIGADOS, null);
      renderizar();
    }
  });

  el.testar?.addEventListener('click', () => mostrar({
    titulo: 'Lembrete de teste', texto: 'Assim chegam os avisos de contas que vencem hoje e amanhã.', quando: 'teste', chave: 'teste',
  }).catch(() => {}));

  // Verifica ao voltar para o app e, com ele aberto, a cada 30 minutos.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificar();
  });
  setInterval(verificar, INTERVALO_MS);

  return { verificar, renderizar, ligados };
}
