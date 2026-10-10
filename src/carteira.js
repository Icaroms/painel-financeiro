/**
 * Carteira de investimentos (Fase 04, parte 4.2a).
 *
 * O que a pessoa tem aplicado: renda fixa, fundos e imóveis. Ações e FIIs
 * (registrados por operação, com preço médio) entram na parte 4.2b.
 *
 * Cada investimento fica na lista "investimentos" dos dados (vai junto no
 * backup). A lista é opcional: dados gravados antes da Fase 04 não têm o
 * campo e contam como carteira vazia, então o formato continua na versão 3.
 *
 *   investimentos: [{
 *     id, criadoEm, atualizadoEm, excluidoEm,   ← campos de controle (src/modelo.js)
 *     tipo: 'cdb',                              ← um dos TIPOS_DE_INVESTIMENTO
 *     nome: 'CDB Banco X 2028',
 *     dataAplicacao: '2026-03-10',
 *     valorAplicadoCentavos: 100000,
 *     valorAtualCentavos: 105000,               ← digitado pela pessoa
 *     valorAtualEm: '2026-10-01',               ← data do valor atual
 *   }]
 *
 * Decisões de 10/10/2026: o valor atual da renda fixa é digitado agora; na
 * parte 4.4 (taxas) o app passa a estimar pela taxa contratada.
 *
 * O app só mostra números: nunca diz o que comprar ou vender.
 * Funções puras: testadas no Node. A tela fica em src/ui/investir.js.
 */

import { ErroValidacao } from './erros.js';
import { ehDataValida } from './datas.js';

/** Grupos do resumo da carteira, na ordem em que aparecem. */
export const GRUPOS_DE_INVESTIMENTO = Object.freeze([
  Object.freeze({ id: 'renda-fixa', nome: 'Renda fixa e fundos' }),
  Object.freeze({ id: 'imovel', nome: 'Imóveis' }),
]);

/** Tipos aceitos nesta parte, com o grupo de cada um. */
export const TIPOS_DE_INVESTIMENTO = Object.freeze([
  Object.freeze({ id: 'cdb', nome: 'CDB', grupo: 'renda-fixa' }),
  Object.freeze({ id: 'tesouro', nome: 'Tesouro Direto', grupo: 'renda-fixa' }),
  Object.freeze({ id: 'lci-lca', nome: 'LCI/LCA', grupo: 'renda-fixa' }),
  Object.freeze({ id: 'poupanca', nome: 'Poupança', grupo: 'renda-fixa' }),
  Object.freeze({ id: 'fundo', nome: 'Fundo de investimento', grupo: 'renda-fixa' }),
  Object.freeze({ id: 'outro-renda-fixa', nome: 'Outra renda fixa', grupo: 'renda-fixa' }),
  Object.freeze({ id: 'imovel', nome: 'Imóvel', grupo: 'imovel' }),
]);

/** Tamanho máximo do nome de um investimento. */
export const TAMANHO_MAXIMO_NOME = 40;

/** Tipo pelo id, ou undefined. */
export function tipoDoInvestimento(id) {
  return TIPOS_DE_INVESTIMENTO.find((t) => t.id === id);
}

/** Investimentos que existem (sem os removidos). Dados sem a lista: carteira vazia. */
export function investimentosAtivos(estado) {
  return (estado.investimentos ?? []).filter((i) => !i.excluidoEm);
}

/* ------------------------------------------------------------------ */
/* Validações                                                         */
/* ------------------------------------------------------------------ */

/** Exige uma data válida, que não seja depois de hoje. */
function exigirDataAteHoje(valor, campo, rotulo, hoje) {
  if (!ehDataValida(valor)) {
    throw new ErroValidacao(campo, `${rotulo}: escolha uma data válida.`);
  }
  if (valor > hoje) {
    throw new ErroValidacao(campo, `${rotulo} não pode ser depois de hoje.`);
  }
  return valor;
}

/** Exige centavos inteiros: maiores que zero (ou zero, se permitido). */
function exigirValor(valor, campo, rotulo, { permitirZero }) {
  if (!Number.isSafeInteger(valor) || valor < 0 || (!permitirZero && valor === 0)) {
    throw new ErroValidacao(campo, `${rotulo} deve ser ${permitirZero ? 'zero ou mais' : 'maior que zero'}.`);
  }
  return valor;
}

/**
 * Confere e normaliza os dados de um investimento (cadastro ou edição).
 * Valor atual vazio (null) = igual ao aplicado, na data da aplicação.
 */
function validar({ tipo, nome, dataAplicacao, valorAplicadoCentavos, valorAtualCentavos = null, valorAtualEm = null }, hoje) {
  if (!tipoDoInvestimento(tipo)) {
    throw new ErroValidacao('tipo', 'Escolha o tipo do investimento.');
  }
  const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
  if (nomeLimpo === '') {
    throw new ErroValidacao('nome', 'Dê um nome ao investimento (ex.: "CDB Banco X 2028").');
  }
  if (nomeLimpo.length > TAMANHO_MAXIMO_NOME) {
    throw new ErroValidacao('nome', `O nome pode ter no máximo ${TAMANHO_MAXIMO_NOME} letras.`);
  }
  exigirDataAteHoje(dataAplicacao, 'dataAplicacao', 'A data da aplicação', hoje);
  exigirValor(valorAplicadoCentavos, 'valorAplicadoCentavos', 'O valor aplicado', { permitirZero: false });

  if (valorAtualCentavos === null) {
    return { tipo, nome: nomeLimpo, dataAplicacao, valorAplicadoCentavos, valorAtualCentavos: valorAplicadoCentavos, valorAtualEm: dataAplicacao };
  }
  exigirValor(valorAtualCentavos, 'valorAtualCentavos', 'O valor atual', { permitirZero: true });
  exigirDataAteHoje(valorAtualEm, 'valorAtualEm', 'A data do valor atual', hoje);
  if (valorAtualEm < dataAplicacao) {
    throw new ErroValidacao('valorAtualEm', 'A data do valor atual não pode ser antes da aplicação.');
  }
  return { tipo, nome: nomeLimpo, dataAplicacao, valorAplicadoCentavos, valorAtualCentavos, valorAtualEm };
}

/* ------------------------------------------------------------------ */
/* Cadastro, edição, valor atual e remoção                            */
/* ------------------------------------------------------------------ */

/** Gera o id padrão. Funciona no navegador e no Node 20+. */
const gerarIdPadrao = () => globalThis.crypto.randomUUID();

/** Busca um investimento ativo pelo id, ou lança erro claro. */
function buscar(estado, id) {
  const encontrado = investimentosAtivos(estado).find((i) => i.id === id);
  if (!encontrado) throw new ErroValidacao('id', 'Este investimento não existe mais.');
  return encontrado;
}

/** Troca um investimento da lista pelo novo (mesmo id). */
function substituir(estado, novo) {
  return { ...estado, investimentos: (estado.investimentos ?? []).map((i) => (i.id === novo.id ? novo : i)) };
}

/**
 * Cadastra um investimento.
 *
 * @param {object} estado
 * @param {object} dados
 * @param {string} dados.tipo                  Um dos TIPOS_DE_INVESTIMENTO.
 * @param {string} dados.nome
 * @param {string} dados.dataAplicacao         "AAAA-MM-DD", até hoje.
 * @param {number} dados.valorAplicadoCentavos Maior que zero.
 * @param {number|null} [dados.valorAtualCentavos] null = igual ao aplicado.
 * @param {string|null} [dados.valorAtualEm]   Data do valor atual (obrigatória com o valor).
 * @param {object} opcoes { hoje, agora, gerarId }
 * @returns {object} Estado novo.
 */
export function adicionarInvestimento(estado, dados, { hoje, agora = new Date(), gerarId = gerarIdPadrao }) {
  const momento = agora.toISOString();
  const novo = {
    id: gerarId(),
    criadoEm: momento,
    atualizadoEm: momento,
    excluidoEm: null,
    ...validar(dados, hoje),
  };
  return { ...estado, investimentos: [...(estado.investimentos ?? []), novo] };
}

/**
 * Edita um investimento (todos os campos).
 *
 * @param {object} estado
 * @param {string} id
 * @param {object} dados Os mesmos de adicionarInvestimento.
 * @param {object} opcoes { hoje, agora }
 * @returns {object} Estado novo.
 */
export function editarInvestimento(estado, id, dados, { hoje, agora = new Date() }) {
  const atual = buscar(estado, id);
  return substituir(estado, { ...atual, ...validar(dados, hoje), atualizadoEm: agora.toISOString() });
}

/**
 * Atualiza só o valor atual (o caso mais comum: conferir o saldo no banco).
 *
 * @param {object} estado
 * @param {string} id
 * @param {number} valorAtualCentavos Zero ou mais.
 * @param {object} opcoes { hoje, agora } O valor fica com a data de hoje.
 * @returns {object} Estado novo.
 */
export function atualizarValorAtual(estado, id, valorAtualCentavos, { hoje, agora = new Date() }) {
  const atual = buscar(estado, id);
  return editarInvestimento(estado, id, { ...atual, valorAtualCentavos, valorAtualEm: hoje }, { hoje, agora });
}

/**
 * Remove um investimento ("exclusão suave", como os outros registros).
 *
 * @param {object} estado
 * @param {string} id
 * @param {object} [opcoes] { agora }
 * @returns {object} Estado novo.
 */
export function removerInvestimento(estado, id, { agora = new Date() } = {}) {
  const atual = buscar(estado, id);
  const momento = agora.toISOString();
  return substituir(estado, { ...atual, excluidoEm: momento, atualizadoEm: momento });
}

/* ------------------------------------------------------------------ */
/* Resumo                                                             */
/* ------------------------------------------------------------------ */

/**
 * Quanto rendeu: diferença e porcentagem sobre o aplicado.
 *
 * @param {number} aplicadoCentavos
 * @param {number} atualCentavos
 * @returns {{ rendimentoCentavos: number, percentual: number|null }} percentual null sem aplicado.
 */
export function rendimento(aplicadoCentavos, atualCentavos) {
  const rendimentoCentavos = atualCentavos - aplicadoCentavos;
  return {
    rendimentoCentavos,
    percentual: aplicadoCentavos === 0 ? null : (rendimentoCentavos / aplicadoCentavos) * 100,
  };
}

/**
 * "+5,0%", "−2,3%" ou "0,0%" (uma casa decimal, com sinal).
 * @param {number|null} percentual
 * @returns {string} Texto vazio quando não há porcentagem.
 */
export function textoDoPercentual(percentual) {
  if (percentual === null || !Number.isFinite(percentual)) return '';
  const arredondado = Math.round(percentual * 10) / 10;
  const numero = Math.abs(arredondado).toFixed(1).replace('.', ',');
  if (arredondado > 0) return `+${numero}%`;
  if (arredondado < 0) return `−${numero}%`;
  return `${numero}%`;
}

/**
 * Resumo da carteira: total, por grupo e a lista ordenada (maior valor atual primeiro).
 *
 * @param {object} estado
 * @returns {{
 *   aplicadoCentavos: number, atualCentavos: number, rendimentoCentavos: number, percentual: number|null,
 *   grupos: { id: string, nome: string, aplicadoCentavos: number, atualCentavos: number, quantidade: number }[],
 *   itens: object[]
 * }} grupos: só os que têm investimento.
 */
export function resumoDaCarteira(estado) {
  const itens = [...investimentosAtivos(estado)]
    .sort((a, b) => b.valorAtualCentavos - a.valorAtualCentavos || a.nome.localeCompare(b.nome, 'pt-BR'));

  const grupos = GRUPOS_DE_INVESTIMENTO
    .map((grupo) => {
      const doGrupo = itens.filter((i) => tipoDoInvestimento(i.tipo)?.grupo === grupo.id);
      return {
        id: grupo.id,
        nome: grupo.nome,
        aplicadoCentavos: doGrupo.reduce((soma, i) => soma + i.valorAplicadoCentavos, 0),
        atualCentavos: doGrupo.reduce((soma, i) => soma + i.valorAtualCentavos, 0),
        quantidade: doGrupo.length,
      };
    })
    .filter((g) => g.quantidade > 0);

  const aplicadoCentavos = itens.reduce((soma, i) => soma + i.valorAplicadoCentavos, 0);
  const atualCentavos = itens.reduce((soma, i) => soma + i.valorAtualCentavos, 0);
  return { aplicadoCentavos, atualCentavos, ...rendimento(aplicadoCentavos, atualCentavos), grupos, itens };
}
