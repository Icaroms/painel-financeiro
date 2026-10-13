/**
 * Sincronização com o servidor (Fase 05, parte 5.3).
 *
 * O app continua "offline primeiro": os dados ficam no IndexedDB do
 * aparelho, e o servidor guarda uma cópia que outros aparelhos da mesma
 * conta também usam. Este arquivo decide O QUE enviar e COMO juntar o que
 * volta. A conversa com o servidor fica em src/nuvem-cliente.js e a tela
 * em src/ui/nuvem.js.
 *
 * Estado da sincronização (guardado no aparelho, fora do backup):
 *
 *   {
 *     cursor: "2026-10-13T22:10:00.123456Z", ← o servidor devolve; vai como "desde" na próxima vez
 *     enviados: { categorias: { "<id>": 1760392200000 }, ... },
 *                                             ← atualizadoEm (em ms) de cada registro que o
 *                                               servidor já tem; diferente = alteração pendente
 *     assinaturaConfiguracao: "...",          ← a configuração que o servidor já tem
 *     configuracaoAtualizadaEm: "...",        ← atualizadoEm dela no servidor
 *     ultimaEm: "...",                        ← quando a última sincronização terminou
 *     recusados: [{ lista, id, campos }]      ← registros que o servidor recusou na última vez
 *   }
 *
 * Regra de conflito: vale a alteração mais recente (atualizadoEm). As datas
 * são comparadas como data, não como texto: o servidor escreve
 * "...12:00:00Z" e o app "...12:00:00.000Z" para o mesmo momento.
 *
 * Funções puras: não tocam no banco nem na rede, então são testadas no Node.
 */

/** Listas com id e campos de controle, na ordem em que são enviadas. */
export const LISTAS_SINCRONIZADAS = Object.freeze(['categorias', 'fixos', 'meses', 'lancamentos', 'investimentos']);

/** Campos do app que viajam juntos, como "configuração". */
export const CAMPOS_DA_CONFIGURACAO = Object.freeze(['formasPagamento', 'cartoes', 'destinoSobra', 'ultimoBackupEm']);

/** Campos que só existem no servidor e não entram nos dados do app. */
const CAMPOS_DO_SERVIDOR = ['recebidoEm'];

/** Estado de um aparelho que nunca sincronizou. */
export function estadoInicial() {
  return {
    cursor: null,
    enviados: Object.fromEntries(LISTAS_SINCRONIZADAS.map((lista) => [lista, {}])),
    assinaturaConfiguracao: null,
    configuracaoAtualizadaEm: null,
    ultimaEm: null,
    recusados: [],
  };
}

/**
 * Momento de um texto ISO 8601, em milissegundos (null se não for data).
 * "2026-10-13T12:00:00Z" e "2026-10-13T12:00:00.000Z" dão o mesmo número.
 */
export function momento(texto) {
  if (typeof texto !== 'string') return null;
  const valor = Date.parse(texto);
  return Number.isNaN(valor) ? null : valor;
}

/** JSON com as chaves em ordem alfabética: o mesmo objeto sempre dá o mesmo texto. */
export function jsonEstavel(valor) {
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const chaves = Object.keys(valor).filter((chave) => valor[chave] !== undefined).sort();
    return `{${chaves.map((chave) => `${JSON.stringify(chave)}:${jsonEstavel(valor[chave])}`).join(',')}}`;
  }
  return JSON.stringify(valor ?? null);
}

/** A configuração de dentro dos dados do app (só os campos que existem). */
export function configuracaoDosDados(dados) {
  const configuracao = {};
  for (const campo of CAMPOS_DA_CONFIGURACAO) {
    if (dados?.[campo] !== undefined && dados?.[campo] !== null) configuracao[campo] = dados[campo];
  }
  return configuracao;
}

/** Texto que identifica o conteúdo de uma configuração (para saber se mudou). */
export function assinaturaDaConfiguracao(configuracao) {
  return jsonEstavel(configuracaoDosDados(configuracao));
}

/** Um registro vindo do servidor, sem os campos que são só do servidor. */
function limpar(registro) {
  const copia = { ...registro };
  for (const campo of CAMPOS_DO_SERVIDOR) delete copia[campo];
  return copia;
}

/**
 * O que este aparelho tem e o servidor ainda não.
 *
 * @param {object} dados  Os dados do app.
 * @param {object} estado O estado da sincronização.
 * @returns {{ listas: Record<string, object[]>, configuracao: object|null, total: number }}
 */
export function pendentes(dados, estado) {
  const listas = {};
  let total = 0;
  for (const nome of LISTAS_SINCRONIZADAS) {
    const enviados = estado.enviados?.[nome] ?? {};
    const itens = (dados?.[nome] ?? []).filter(
      (registro) => registro && registro.id && enviados[registro.id] !== momento(registro.atualizadoEm),
    );
    listas[nome] = itens;
    total += itens.length;
  }
  const configuracao = configuracaoDosDados(dados);
  const mudou = assinaturaDaConfiguracao(configuracao) !== estado.assinaturaConfiguracao;
  return { listas, configuracao: mudou ? configuracao : null, total: total + (mudou ? 1 : 0) };
}

/**
 * Monta o corpo do POST /api/sync com as alterações pendentes.
 *
 * @param {object} dados
 * @param {object} estado
 * @param {Date} [agora] Vira o atualizadoEm da configuração, se ela mudou.
 * @returns {{ desde: string|null, listas: Record<string, object[]>, configuracao: object|null }}
 */
export function montarPedido(dados, estado, agora = new Date()) {
  const { listas, configuracao } = pendentes(dados, estado);
  const comItens = Object.fromEntries(Object.entries(listas).filter(([, itens]) => itens.length > 0));
  return {
    desde: estado.cursor ?? null,
    listas: comItens,
    configuracao: configuracao === null ? null : { ...configuracao, atualizadoEm: agora.toISOString() },
  };
}

/**
 * Junta numa lista do app os registros que vieram do servidor.
 *
 * - Registro novo: entra no fim da lista.
 * - Registro que o aparelho já tem: vale o atualizadoEm mais recente; se o
 *   do aparelho for mais novo, ele fica (e vai na próxima sincronização).
 * - Meses: se o servidor já tem o mesmo mês com outro id (criado em outro
 *   aparelho), o do servidor substitui o daqui.
 *
 * @returns {{ lista: object[], mudou: boolean }}
 */
function mesclarLista(nome, locais, vindos, enviadosDaLista) {
  const resultado = [...locais];
  const posicao = new Map(resultado.map((registro, indice) => [registro.id, indice]));
  let mudou = false;

  for (const bruto of vindos) {
    const registro = limpar(bruto);
    let indice = posicao.get(registro.id);

    if (indice === undefined && nome === 'meses') {
      const outro = resultado.findIndex((mes) => mes.mes === registro.mes && mes.id !== registro.id);
      if (outro >= 0) {
        delete enviadosDaLista[resultado[outro].id];
        posicao.delete(resultado[outro].id);
        posicao.set(registro.id, outro);
        indice = outro;
      }
    }

    if (indice === undefined) {
      posicao.set(registro.id, resultado.length);
      resultado.push(registro);
      enviadosDaLista[registro.id] = momento(registro.atualizadoEm);
      mudou = true;
      continue;
    }

    const local = resultado[indice];
    const localMaisNovo = local.id === registro.id && momento(local.atualizadoEm) > momento(registro.atualizadoEm);
    if (localMaisNovo) continue;

    if (jsonEstavel(local) !== jsonEstavel(registro)) {
      resultado[indice] = registro;
      mudou = true;
    }
    enviadosDaLista[registro.id] = momento(registro.atualizadoEm);
  }
  return { lista: resultado, mudou };
}

/** Troca os campos de configuração dos dados pelos da configuração dada. */
function aplicarConfiguracao(dados, configuracao) {
  const novos = { ...dados };
  for (const campo of CAMPOS_DA_CONFIGURACAO) {
    const valor = configuracao[campo];
    if (valor !== undefined && valor !== null) novos[campo] = valor;
    else if (campo === 'cartoes') novos.cartoes = []; // lista obrigatória no app (src/persistencia.js)
    else if (campo !== 'formasPagamento') delete novos[campo];
  }
  return novos;
}

/**
 * Junta a resposta do servidor aos dados do app.
 *
 * Os dados podem ter mudado enquanto o pedido estava na rede: a junção é
 * feita sobre os dados de AGORA, e o que mudou nesse meio-tempo continua
 * pendente (o atualizadoEm não bate com o que foi enviado).
 *
 * @param {object} dados    Os dados do app agora.
 * @param {object} estado   O estado da sincronização usado no pedido.
 * @param {object} pedido   O que foi enviado (montarPedido).
 * @param {object} resposta A resposta do POST /api/sync.
 * @param {Date} [agora]
 * @returns {{ dados: object, estado: object, mudou: boolean, recusados: object[] }}
 */
export function aplicarResposta(dados, estado, pedido, resposta, agora = new Date()) {
  let novos = { ...dados };
  let mudou = false;
  const recusados = [];
  const enviados = Object.fromEntries(
    LISTAS_SINCRONIZADAS.map((nome) => [nome, { ...(estado.enviados?.[nome] ?? {}) }]),
  );

  for (const nome of LISTAS_SINCRONIZADAS) {
    const enviadosDaLista = enviados[nome];
    const noPedido = new Map((pedido.listas?.[nome] ?? []).map((registro) => [registro.id, registro]));
    const vindos = [...(resposta.mudancas?.[nome] ?? [])];

    for (const resultado of resposta.resultados?.[nome] ?? []) {
      if (resultado.situacao === 'gravado' && noPedido.has(resultado.id)) {
        enviadosDaLista[resultado.id] = momento(noPedido.get(resultado.id).atualizadoEm);
      } else if (resultado.situacao === 'conflito' && resultado.atual) {
        vindos.push(resultado.atual);
      } else if (resultado.situacao === 'recusado') {
        recusados.push({ lista: nome, id: resultado.id, campos: resultado.campos ?? {} });
      }
    }

    if (vindos.length > 0) {
      const juncao = mesclarLista(nome, novos[nome] ?? [], vindos, enviadosDaLista);
      novos[nome] = juncao.lista;
      mudou = mudou || juncao.mudou;
    }
  }

  // Configuração: um documento só, vale a versão mais recente.
  let assinatura = estado.assinaturaConfiguracao ?? null;
  let configuracaoAtualizadaEm = estado.configuracaoAtualizadaEm ?? null;
  const resultadoConfiguracao = resposta.configuracao ?? null;

  if (resultadoConfiguracao?.situacao === 'gravado' && pedido.configuracao) {
    assinatura = assinaturaDaConfiguracao(pedido.configuracao);
    configuracaoAtualizadaEm = pedido.configuracao.atualizadoEm;
  }
  if (resultadoConfiguracao?.situacao === 'recusado') {
    recusados.push({ lista: 'configuracao', id: null, campos: resultadoConfiguracao.campos ?? {} });
  }

  const emConflito = resultadoConfiguracao?.situacao === 'conflito' ? resultadoConfiguracao.atual : null;
  const candidatas = [resposta.configuracaoAtual, emConflito].filter(Boolean);
  const doServidor = candidatas.sort((a, b) => (momento(b.atualizadoEm) ?? 0) - (momento(a.atualizadoEm) ?? 0))[0];

  if (doServidor) {
    const localPendente = assinaturaDaConfiguracao(novos) !== assinatura;
    // Com alteração local ainda não enviada, a do servidor só vale se ganhou um conflito.
    if (!localPendente || emConflito) {
      if (assinaturaDaConfiguracao(novos) !== assinaturaDaConfiguracao(doServidor)) {
        novos = aplicarConfiguracao(novos, doServidor);
        mudou = true;
      }
      assinatura = assinaturaDaConfiguracao(doServidor);
      configuracaoAtualizadaEm = doServidor.atualizadoEm ?? null;
    }
  }

  return {
    dados: novos,
    estado: {
      cursor: resposta.cursor ?? estado.cursor ?? null,
      enviados,
      assinaturaConfiguracao: assinatura,
      configuracaoAtualizadaEm,
      ultimaEm: agora.toISOString(),
      recusados,
    },
    mudou,
    recusados,
  };
}

/** A resposta do servidor tem algum dado da conta? */
export function temDadosNoServidor(resposta) {
  const algumRegistro = LISTAS_SINCRONIZADAS.some((nome) => (resposta?.mudancas?.[nome] ?? []).length > 0);
  return algumRegistro || Boolean(resposta?.configuracaoAtual);
}

/**
 * Monta os dados do app só com o que está no servidor (para "usar os dados
 * da nuvem neste aparelho"). Devolve null se faltar o mínimo que o app
 * precisa: pelo menos um mês e a lista de formas de pagamento.
 *
 * @param {object} resposta Resposta de um POST /api/sync com "desde" vazio.
 * @returns {object|null}
 */
export function dadosDoServidor(resposta) {
  const configuracao = resposta?.configuracaoAtual;
  const meses = (resposta?.mudancas?.meses ?? []).map(limpar);
  if (!configuracao || !Array.isArray(configuracao.formasPagamento) || meses.length === 0) return null;

  const dados = { origem: 'usuario' };
  for (const nome of LISTAS_SINCRONIZADAS) {
    dados[nome] = (resposta.mudancas?.[nome] ?? []).map(limpar);
  }
  return aplicarConfiguracao(dados, configuracao);
}

/**
 * Estado da sincronização logo depois de adotar os dados do servidor:
 * tudo o que veio já está "enviado".
 *
 * @param {object} dados    Os dados montados por dadosDoServidor.
 * @param {object} resposta A resposta usada para montá-los.
 * @param {Date} [agora]
 * @returns {object}
 */
export function estadoDepoisDeAdotar(dados, resposta, agora = new Date()) {
  const estado = estadoInicial();
  for (const nome of LISTAS_SINCRONIZADAS) {
    for (const registro of dados[nome] ?? []) {
      estado.enviados[nome][registro.id] = momento(registro.atualizadoEm);
    }
  }
  estado.cursor = resposta.cursor ?? null;
  estado.assinaturaConfiguracao = assinaturaDaConfiguracao(resposta.configuracaoAtual ?? {});
  estado.configuracaoAtualizadaEm = resposta.configuracaoAtual?.atualizadoEm ?? null;
  estado.ultimaEm = agora.toISOString();
  return estado;
}
