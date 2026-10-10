/**
 * Vista "Investir" (Fase 04, parte 4.2a): a carteira de investimentos.
 *
 * - Resumo: valor atual da carteira, quanto foi aplicado, quanto rendeu e
 *   o total de cada grupo (renda fixa e fundos, imóveis).
 * - Lista: 5 investimentos por página, do maior valor para o menor, com
 *   Remover, Editar e Atualizar valor (o caso mais comum: conferir o saldo
 *   no banco e digitar aqui).
 * - Cadastro: tipo, nome, data e valor aplicados e, se quiser, o valor atual.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. As regras ficam em
 * src/carteira.js (testado no Node). Todo texto entra com textContent.
 */

import { hojeLocal } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { textoDoValor, lerValorPositivo } from '../configuracao.js';
import { paginar } from '../historico.js';
import {
  TIPOS_DE_INVESTIMENTO,
  TAMANHO_MAXIMO_NOME,
  tipoDoInvestimento,
  adicionarInvestimento,
  editarInvestimento,
  atualizarValorAtual,
  removerInvestimento,
  rendimento,
  textoDoPercentual,
  resumoDaCarteira,
} from '../carteira.js';

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

/** "2026-03-10" → "10/03/2026". */
const dataLonga = (data) => data.split('-').reverse().join('/');

/** Valor com sinal: "+R$ 52,30" ou "−R$ 23,00". */
function valorComSinal(centavos) {
  if (centavos > 0) return `+${formatarCentavos(centavos)}`;
  if (centavos < 0) return `−${formatarCentavos(-centavos)}`;
  return formatarCentavos(0);
}

/** Classe da cor do rendimento: verde quando ganhou, vermelho quando perdeu. */
const classeDoRendimento = (centavos) => (centavos > 0 ? 'ganho' : centavos < 0 ? 'perda' : '');

/** Campo com rótulo. */
function campo(rotulo, controle, classeExtra = '') {
  const label = criar('label', { classe: `campo ${classeExtra}`.trim() });
  label.append(criar('span', { classe: 'secundario', texto: rotulo }), controle);
  return label;
}

/** Campo de dinheiro (com "R$" fixo à esquerda). */
function campoDinheiro(rotulo, nome, valorInicial = '', { classeExtra = '', placeholder = '0,00' } = {}) {
  const caixa = criar('span', { classe: 'campo-dinheiro' });
  const input = criar('input', { name: nome, inputmode: 'decimal', placeholder });
  input.value = valorInicial;
  caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);
  return { rotulo: campo(rotulo, caixa, classeExtra), input };
}

/**
 * Liga a vista Investir.
 *
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarInvestir({ obterDados, aplicarMudanca }) {
  const el = {
    total: elemento('investir-total'),
    rendimento: elemento('investir-rendimento'),
    grupos: elemento('investir-grupos'),
    lista: elemento('lista-investimentos'),
    paginacao: elemento('paginacao-investimentos'),
    area: elemento('area-investimento'),
    botaoNovo: elemento('botao-novo-investimento'),
  };

  /** O que está aberto: null, 'novo', ou { id, modo: 'editar' | 'valor' }. */
  let aberto = null;
  /** Página atual da lista. */
  let pagina = 1;

  /** Fecha o formulário aberto e redesenha. */
  function fechar() {
    aberto = null;
    renderizar();
  }

  /* ---------------- Formulário completo (cadastro e edição) ---------------- */

  /**
   * @param {object|null} item null para cadastrar.
   */
  function formularioDoInvestimento(item) {
    const hoje = hojeLocal();
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });

    const tipo = criar('select', { name: 'tipo' });
    for (const t of TIPOS_DE_INVESTIMENTO) tipo.append(criar('option', { value: t.id, texto: t.nome }));
    tipo.value = item?.tipo ?? TIPOS_DE_INVESTIMENTO[0].id;

    const nome = criar('input', { name: 'nome', maxlength: String(TAMANHO_MAXIMO_NOME), placeholder: 'Ex.: CDB Banco X 2028' });
    nome.value = item?.nome ?? '';

    const dataAplicacao = criar('input', { name: 'dataAplicacao', type: 'date', max: hoje });
    dataAplicacao.value = item?.dataAplicacao ?? hoje;

    const aplicado = campoDinheiro('Valor aplicado', 'valorAplicado', item ? textoDoValor(item.valorAplicadoCentavos) : '');
    const atual = campoDinheiro('Valor atual', 'valorAtual', item ? textoDoValor(item.valorAtualCentavos) : '', {
      placeholder: 'opcional',
    });
    const dataAtual = criar('input', { name: 'valorAtualEm', type: 'date', max: hoje });
    dataAtual.value = item?.valorAtualEm ?? hoje;

    const dica = criar('p', {
      classe: 'dica secundario',
      texto: 'O valor atual é o que aparece hoje no app ou no extrato do banco. Deixe vazio se ainda é igual ao aplicado.',
    });
    const erro = criar('span', { classe: 'erro', role: 'alert' });

    const acoes = criar('div', { classe: 'acoes' });
    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    cancelar.addEventListener('click', fechar);
    acoes.append(cancelar, criar('button', { classe: 'botao-pequeno', type: 'submit', texto: item ? 'Salvar' : 'Adicionar' }));

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.textContent = '';
      try {
        const semValorAtual = atual.input.value.trim() === '';
        const dados = {
          tipo: tipo.value,
          nome: nome.value,
          dataAplicacao: dataAplicacao.value,
          valorAplicadoCentavos: lerValorPositivo(aplicado.input.value, 'valorAplicadoCentavos'),
          valorAtualCentavos: semValorAtual ? null : lerValorPositivo(atual.input.value, 'valorAtualCentavos'),
          valorAtualEm: semValorAtual ? null : dataAtual.value,
        };
        const estado = obterDados();
        const novos = item
          ? editarInvestimento(estado, item.id, dados, { hoje: hojeLocal() })
          : adicionarInvestimento(estado, dados, { hoje: hojeLocal() });
        aberto = null;
        await aplicarMudanca(novos, item ? `"${dados.nome.trim()}" salvo.` : `"${dados.nome.trim()}" adicionado à carteira.`);
        renderizar();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        erro.textContent = falha.message;
      }
    });

    form.append(
      campo('Tipo', tipo, 'inteira'),
      campo('Nome', nome, 'inteira'),
      campo('Data da aplicação', dataAplicacao),
      aplicado.rotulo,
      atual.rotulo,
      campo('Data do valor atual', dataAtual),
      dica,
      erro,
      acoes,
    );
    return form;
  }

  /* ---------------- Formulário curto: só o valor atual ---------------- */

  function formularioDoValor(item) {
    const form = criar('form', { classe: 'form-pago', autocomplete: 'off', novalidate: '' });
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const input = criar('input', {
      name: 'valorAtual', inputmode: 'decimal', placeholder: '0,00', 'aria-label': `Valor atual de ${item.nome}`,
    });
    input.value = textoDoValor(item.valorAtualCentavos);
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);

    const acoes = criar('div', { classe: 'acoes' });
    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    cancelar.addEventListener('click', fechar);
    acoes.append(cancelar, criar('button', { classe: 'botao-pequeno', type: 'submit', texto: 'Salvar' }));

    const dica = criar('p', { classe: 'dica secundario', texto: 'Valor de hoje, como aparece no banco.' });
    const erro = criar('span', { classe: 'erro', role: 'alert' });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.textContent = '';
      try {
        const centavos = lerValorPositivo(input.value, 'valorAtualCentavos');
        const novos = atualizarValorAtual(obterDados(), item.id, centavos, { hoje: hojeLocal() });
        aberto = null;
        await aplicarMudanca(novos, `Valor de "${item.nome}" atualizado.`);
        renderizar();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        erro.textContent = falha.message;
      }
    });

    form.append(caixa, acoes, dica, erro);
    return form;
  }

  /* ---------------- Lista ---------------- */

  function itemDoInvestimento(item) {
    const li = criar('li', { classe: 'fixo investimento' });

    const topo = criar('div', { classe: 'fixo-topo' });
    topo.append(
      criar('span', { classe: 'fixo-nome', texto: item.nome }),
      criar('span', { classe: 'fixo-valor', texto: formatarCentavos(item.valorAtualCentavos) }),
    );

    const r = rendimento(item.valorAplicadoCentavos, item.valorAtualCentavos);
    const detalhe = criar('p', { classe: 'fixo-detalhe secundario' });
    detalhe.append(
      `${tipoDoInvestimento(item.tipo)?.nome ?? item.tipo} · aplicado ${formatarCentavos(item.valorAplicadoCentavos)} ` +
        `em ${dataLonga(item.dataAplicacao)} · rendeu `,
      criar('span', {
        classe: classeDoRendimento(r.rendimentoCentavos),
        texto: `${valorComSinal(r.rendimentoCentavos)} (${textoDoPercentual(r.percentual)})`,
      }),
      ` · valor de ${dataLonga(item.valorAtualEm)}`,
    );

    const acoes = criar('div', { classe: 'acoes' });
    const erro = criar('span', { classe: 'erro', role: 'alert' });
    const remover = criar('button', {
      classe: 'botao-pequeno perigo', type: 'button', texto: 'Remover', 'aria-label': `Remover ${item.nome}`,
    });
    const editar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Editar', 'aria-label': `Editar ${item.nome}` });
    const valor = criar('button', {
      classe: 'botao-pequeno', type: 'button', texto: 'Atualizar valor', 'aria-label': `Atualizar o valor de ${item.nome}`,
    });

    remover.addEventListener('click', async () => {
      erro.textContent = '';
      if (!window.confirm(`Remover "${item.nome}" da carteira?`)) return;
      try {
        aberto = null;
        await aplicarMudanca(removerInvestimento(obterDados(), item.id), `"${item.nome}" removido da carteira.`);
        renderizar();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        erro.textContent = falha.message;
      }
    });
    editar.addEventListener('click', () => {
      aberto = { id: item.id, modo: 'editar' };
      renderizar();
    });
    valor.addEventListener('click', () => {
      aberto = { id: item.id, modo: 'valor' };
      renderizar();
    });
    acoes.append(remover, editar, valor);

    li.append(topo, detalhe, acoes, erro);
    if (aberto?.id === item.id) {
      li.append(aberto.modo === 'valor' ? formularioDoValor(item) : formularioDoInvestimento(item));
    }
    return li;
  }

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
    anterior.addEventListener('click', () => { pagina = atual - 1; aberto = null; renderizar(); });
    proxima.addEventListener('click', () => { pagina = atual + 1; aberto = null; renderizar(); });
    el.paginacao.replaceChildren(
      anterior,
      criar('span', { classe: 'pagina-atual secundario', texto: `Página ${atual} de ${totalPaginas}` }),
      proxima,
    );
  }

  /* ---------------- Resumo e tela inteira ---------------- */

  function renderizarResumo(r) {
    el.total.textContent = formatarCentavos(r.atualCentavos);
    if (r.itens.length === 0) {
      el.rendimento.textContent = 'Nenhum investimento cadastrado ainda.';
      el.grupos.replaceChildren();
      return;
    }
    el.rendimento.replaceChildren(
      `Aplicado ${formatarCentavos(r.aplicadoCentavos)} · rendeu `,
      criar('strong', {
        classe: classeDoRendimento(r.rendimentoCentavos),
        texto: `${valorComSinal(r.rendimentoCentavos)} (${textoDoPercentual(r.percentual)})`,
      }),
    );
    el.grupos.replaceChildren(...r.grupos.map((g) => {
      const linha = criar('div', { classe: 'conta-linha' });
      const termo = criar('dt', { texto: `${g.nome} ` });
      termo.append(criar('span', {
        classe: 'secundario',
        texto: `${g.quantidade} ${g.quantidade === 1 ? 'investimento' : 'investimentos'} · aplicado ${formatarCentavos(g.aplicadoCentavos)}`,
      }));
      linha.append(termo, criar('dd', { texto: formatarCentavos(g.atualCentavos) }));
      return linha;
    }));
  }

  function renderizar() {
    const r = resumoDaCarteira(obterDados());
    renderizarResumo(r);

    const paginaAtual = paginar(r.itens, pagina);
    pagina = paginaAtual.pagina; // paginar() volta sozinha para a última página que ainda existe
    el.lista.replaceChildren(
      ...(r.itens.length === 0
        ? [criar('li', { classe: 'lista-vazia secundario', texto: 'Cadastre o que você já tem aplicado: CDB, Tesouro, poupança, fundos ou imóvel.' })]
        : paginaAtual.itens.map(itemDoInvestimento)),
    );
    montarPaginacao(paginaAtual);

    el.botaoNovo.hidden = aberto === 'novo';
    el.area.replaceChildren(...(aberto === 'novo' ? [formularioDoInvestimento(null)] : []));
  }

  el.botaoNovo.addEventListener('click', () => {
    aberto = 'novo';
    renderizar();
    el.area.querySelector('select')?.focus();
  });

  return { renderizar };
}
