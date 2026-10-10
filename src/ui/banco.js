/**
 * Banco de dados do aparelho (IndexedDB).
 *
 * O IndexedDB é um banco que fica DENTRO do navegador, em cada aparelho.
 * Os dados não saem do aparelho e continuam lá depois de fechar a página.
 *
 * Organização usada:
 * - banco "painel-financeiro"
 *   - gaveta (object store) "estado"
 *     - um registro de chave "atual", com o pacote inteiro
 *       (o envelope de src/persistencia.js);
 *     - um registro de chave "config-ia", com a configuração da IA
 *       (Fase 03). Ele fica fora do backup de propósito;
 *     - um registro de chave "analise-mes", com a última análise do mês
 *       feita pela IA (Fase 03). Também fora do backup.
 *
 * Guardar tudo num registro só é simples e seguro para o volume de um
 * app pessoal: cada gravação substitui o pacote inteiro de uma vez.
 *
 * Este arquivo só funciona no navegador (o Node não tem IndexedDB).
 * Por isso a lógica testável fica em src/persistencia.js, e aqui fica
 * só a conversa com o banco.
 */

const NOME_BANCO = 'painel-financeiro';
const VERSAO_BANCO = 1; // versão da ESTRUTURA do banco (gavetas), não dos dados
const GAVETA = 'estado';
const CHAVE = 'atual';
// Configuração da IA (Fase 03): numa chave separada, para NÃO entrar no
// backup, que exporta só o pacote "atual". A chave do Gemini fica só no aparelho.
const CHAVE_CONFIG_IA = 'config-ia';
// Última análise do mês feita pela IA (Fase 03): também fora do backup.
const CHAVE_ANALISE_MES = 'analise-mes';

/** Guarda a conexão aberta, para não abrir o banco a cada gravação. */
let conexao = null;

/**
 * Abre (ou cria, na primeira vez) o banco do aparelho.
 *
 * O IndexedDB é antigo e trabalha com eventos (onsuccess, onerror).
 * Aqui ele é "embrulhado" numa Promise, para poder usar await.
 *
 * @returns {Promise<IDBDatabase>}
 */
function abrirBanco() {
  if (conexao) return Promise.resolve(conexao);

  return new Promise((resolver, rejeitar) => {
    if (!('indexedDB' in globalThis)) {
      rejeitar(new Error('Este navegador não tem IndexedDB.'));
      return;
    }

    const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

    // Só roda quando o banco é criado ou a VERSAO_BANCO aumenta.
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      if (!banco.objectStoreNames.contains(GAVETA)) {
        banco.createObjectStore(GAVETA);
      }
    };

    pedido.onsuccess = () => {
      conexao = pedido.result;
      resolver(conexao);
    };
    pedido.onerror = () => rejeitar(pedido.error);
    pedido.onblocked = () => rejeitar(new Error('O banco está bloqueado por outra aba aberta.'));
  });
}

/**
 * Executa uma operação na gaveta e espera ela terminar de verdade.
 *
 * @param {'readonly'|'readwrite'} modo
 * @param {(gaveta: IDBObjectStore) => IDBRequest} operacao
 * @returns {Promise<any>} O resultado da operação.
 */
async function naGaveta(modo, operacao) {
  const banco = await abrirBanco();

  return new Promise((resolver, rejeitar) => {
    const transacao = banco.transaction(GAVETA, modo);
    const pedido = operacao(transacao.objectStore(GAVETA));

    // Resolve só quando a transação termina: aí o dado está gravado de fato.
    transacao.oncomplete = () => resolver(pedido.result);
    transacao.onerror = () => rejeitar(transacao.error);
    transacao.onabort = () => rejeitar(transacao.error ?? new Error('Gravação cancelada.'));
  });
}

/**
 * Lê o pacote gravado.
 * @returns {Promise<object|undefined>} O pacote, ou undefined se nunca foi gravado.
 */
export function lerPacote() {
  return naGaveta('readonly', (gaveta) => gaveta.get(CHAVE));
}

/**
 * Grava o pacote, substituindo o anterior.
 * @param {object} pacote
 * @returns {Promise<void>}
 */
export async function gravarPacote(pacote) {
  await naGaveta('readwrite', (gaveta) => gaveta.put(pacote, CHAVE));
}

/**
 * Lê a configuração da IA (chave do Gemini, modelo, ligada).
 * @returns {Promise<object|undefined>} undefined se nunca foi gravada.
 */
export function lerConfigIA() {
  return naGaveta('readonly', (gaveta) => gaveta.get(CHAVE_CONFIG_IA));
}

/**
 * Grava a configuração da IA. Com null, apaga (ex.: "Apagar chave").
 * @param {object|null} config
 * @returns {Promise<void>}
 */
export async function gravarConfigIA(config) {
  await naGaveta('readwrite', (gaveta) => (config === null
    ? gaveta.delete(CHAVE_CONFIG_IA)
    : gaveta.put(config, CHAVE_CONFIG_IA)));
}

/**
 * Lê a última análise do mês feita pela IA.
 * @returns {Promise<object|undefined>}
 */
export function lerAnaliseMes() {
  return naGaveta('readonly', (gaveta) => gaveta.get(CHAVE_ANALISE_MES));
}

/**
 * Grava a última análise do mês (substitui a anterior).
 * @param {object} analise { mes, texto, geradaEm }
 * @returns {Promise<void>}
 */
export async function gravarAnaliseMes(analise) {
  await naGaveta('readwrite', (gaveta) => gaveta.put(analise, CHAVE_ANALISE_MES));
}

/**
 * Pede ao navegador para NÃO apagar os dados quando faltar espaço.
 *
 * Sem esse pedido, o navegador pode limpar dados de sites para liberar
 * espaço. O pedido pode ser negado; nesse caso o app funciona igual,
 * e o backup (tarefa futura) continua sendo a garantia.
 *
 * @returns {Promise<boolean>} true se o armazenamento ficou persistente.
 */
export async function pedirArmazenamentoPersistente() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
