/**
 * Rotas do app (novo layout, 11/2026): o endereço depois do "#" diz qual
 * tela abrir e, em algumas, qual parte dela.
 *
 *   #inicio (ou nada)          → Início
 *   #lancar, #gasto            → Novo gasto (o antigo Lançar)
 *   #mes, #mes/<parte>         → Mês: resumo | entradas | contas | gastos
 *   #historico                 → Histórico completo (aberto pela parte Gastos do Mês)
 *   #planejar, #planejar/<parte> → Planejar: compras | calendario | investir
 *   #investir/<parte>          → uma parte de Investir: carteira | simulador | radar | receita
 *   #simular                   → Avaliar compra
 *   #ajustes                   → menu de Ajustes
 *   #ajustes/<parte>           → uma página de Ajustes (o antigo Configurar, em partes; lembretes desde 11/2026)
 *
 * Endereços antigos continuam funcionando: #configurar vira #ajustes e
 * #investir vira #planejar/investir. Endereço desconhecido: Início.
 *
 * Função pura: testada no Node.
 */

/** Partes da aba Mês. */
export const PARTES_DO_MES = Object.freeze(['resumo', 'entradas', 'contas', 'gastos']);

/** Partes de Planejar. */
export const PARTES_DE_PLANEJAR = Object.freeze(['compras', 'calendario', 'investir']);

/** Páginas de Investir. */
export const PAGINAS_DE_INVESTIR = Object.freeze(['carteira', 'simulador', 'radar', 'receita']);

/** Páginas de Ajustes, na ordem do menu. */
export const PAGINAS_DE_AJUSTES = Object.freeze(['dinheiro', 'contas', 'categorias', 'pagamentos', 'sobra', 'ia', 'lembretes', 'conta', 'app']);

/**
 * Lê o endereço.
 *
 * @param {string} hash O location.hash (ex.: "#mes/entradas").
 * @returns {{ vista: string, parte: string|null, aba: string|null }}
 *   vista: inicio | lancar | mes | historico | planejar | investir | simular | ajustes | configurar;
 *   parte: a parte da vista (ou null); aba: qual aba da barra fica marcada (null no Novo gasto).
 */
export function lerRota(hash) {
  const texto = String(hash ?? '').replace(/^#/, '');
  const [principal, parte = null] = texto.split('/');

  switch (principal) {
    case 'lancar':
    case 'gasto':
      return { vista: 'lancar', parte: null, aba: null };
    case 'mes':
      return { vista: 'mes', parte: PARTES_DO_MES.includes(parte) ? parte : 'resumo', aba: 'mes' };
    case 'historico':
      return { vista: 'historico', parte: null, aba: 'mes' };
    case 'planejar':
      return { vista: 'planejar', parte: PARTES_DE_PLANEJAR.includes(parte) ? parte : 'compras', aba: 'planejar' };
    case 'investir':
      return PAGINAS_DE_INVESTIR.includes(parte)
        ? { vista: 'investir', parte, aba: 'planejar' }
        : { vista: 'planejar', parte: 'investir', aba: 'planejar' };
    case 'simular':
      return { vista: 'simular', parte: null, aba: 'planejar' };
    case 'ajustes':
    case 'configurar':
      return PAGINAS_DE_AJUSTES.includes(parte)
        ? { vista: 'configurar', parte, aba: 'ajustes' }
        : { vista: 'ajustes', parte: null, aba: 'ajustes' };
    default:
      return { vista: 'inicio', parte: null, aba: 'inicio' };
  }
}
