/**
 * Vista "Configurar": dinheiro do mês, categorias e formas de pagamento.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA. As mudanças nos dados
 * são feitas pelas funções puras de src/configuracao.js (testadas no Node).
 *
 * Quem usa este módulo (src/ui/app.js) entrega duas funções:
 * - obterDados(): devolve os dados atuais;
 * - aplicarMudanca(novosDados, mensagem): troca os dados, grava no
 *   aparelho e mostra a mensagem.
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { buscarMes } from '../meses.js';
import { tituloDoMes } from '../painel.js';
import {
  textoDoValor,
  lerValorComSinal,
  lerValorPositivo,
  salvarDinheiroDoMes,
  categoriasAtivas,
  adicionarCategoria,
  editarCategoria,
  removerCategoria,
  adicionarFormaPagamento,
  removerFormaPagamento,
} from '../configuracao.js';

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

/** Cria um elemento com classe e texto opcionais. */
function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** Mostra (ou limpa) o erro de um campo e marca o campo como inválido. */
function mostrarErro(campoErro, input, mensagem) {
  campoErro.textContent = mensagem;
  if (input) input.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
}

/**
 * Liga a vista Configurar.
 *
 * @param {object}   opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @returns {{ renderizar: () => void }}
 */
export function iniciarConfigurar({ obterDados, aplicarMudanca }) {
  const el = {
    subtitulo: elemento('config-subtitulo'),
    alertaSaldo: elemento('alerta-saldo'),
    alertaSaldoTexto: elemento('alerta-saldo-texto'),
    formMes: elemento('form-mes'),
    saldoInicial: elemento('saldo-inicial'),
    rendaPrevista: elemento('renda-prevista'),
    erroSaldo: elemento('erro-saldo'),
    erroRenda: elemento('erro-renda'),
    resumoDinheiro: elemento('resumo-dinheiro'),
    botaoSalvarMes: elemento('botao-salvar-mes'),
    listaCategorias: elemento('lista-categorias'),
    formNovaCategoria: elemento('form-nova-categoria'),
    erroNovaCategoria: elemento('erro-nova-categoria'),
    listaFormas: elemento('lista-formas'),
    formNovaForma: elemento('form-nova-forma'),
    erroNovaForma: elemento('erro-nova-forma'),
  };

  const mesAtual = () => mesDaData(hojeLocal());

  /* ---------------- Dinheiro do mês ---------------- */

  /** Atualiza a linha "Dinheiro do mês: R$ ..." enquanto a pessoa digita. */
  function atualizarResumo() {
    let texto;
    try {
      const saldo = lerValorComSinal(el.saldoInicial.value, 'saldo');
      const renda = lerValorPositivo(el.rendaPrevista.value, 'renda');
      texto = formatarCentavos(saldo + renda);
    } catch {
      texto = '—';
    }
    el.resumoDinheiro.replaceChildren(
      'Dinheiro do mês (saldo + renda): ',
      criar('strong', { texto }),
    );
  }

  function renderizarMes() {
    const mes = mesAtual();
    const registro = buscarMes(obterDados(), mes);

    el.subtitulo.textContent = tituloDoMes(mes);
    el.saldoInicial.value = textoDoValor(registro.saldoInicialCentavos);
    el.rendaPrevista.value = textoDoValor(registro.rendaPrevistaCentavos);
    mostrarErro(el.erroSaldo, el.saldoInicial, '');
    mostrarErro(el.erroRenda, el.rendaPrevista, '');

    el.alertaSaldo.hidden = registro.saldoConfirmado;
    el.alertaSaldoTexto.textContent =
      `O saldo de ${formatarCentavos(registro.saldoInicialCentavos)} foi sugerido pelo app: ` +
      'é o que sobrou do mês anterior. Confira com o extrato do banco, corrija se precisar e confirme.';
    el.botaoSalvarMes.textContent = registro.saldoConfirmado ? 'Salvar' : 'Confirmar saldo';

    atualizarResumo();
  }

  el.saldoInicial.addEventListener('input', atualizarResumo);
  el.rendaPrevista.addEventListener('input', atualizarResumo);

  el.formMes.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErro(el.erroSaldo, el.saldoInicial, '');
    mostrarErro(el.erroRenda, el.rendaPrevista, '');

    const mes = mesAtual();
    const confirmadoAntes = buscarMes(obterDados(), mes).saldoConfirmado;

    try {
      const saldoInicialCentavos = lerValorComSinal(el.saldoInicial.value, 'saldo');
      const rendaPrevistaCentavos = lerValorPositivo(el.rendaPrevista.value, 'renda');
      const novos = salvarDinheiroDoMes(obterDados(), mes, { saldoInicialCentavos, rendaPrevistaCentavos });
      await aplicarMudanca(novos, confirmadoAntes ? 'Dinheiro do mês salvo.' : 'Saldo confirmado.');
      renderizarMes();
    } catch (erro) {
      if (!(erro instanceof ErroValidacao)) throw erro;
      if (erro.campo === 'renda' || erro.campo === 'rendaPrevistaCentavos') {
        mostrarErro(el.erroRenda, el.rendaPrevista, erro.message);
        el.rendaPrevista.focus();
      } else {
        mostrarErro(el.erroSaldo, el.saldoInicial, erro.message);
        el.saldoInicial.focus();
      }
    }
  });

  /* ---------------- Categorias ---------------- */

  /** Monta a linha de uma categoria: nome, orçamento, Salvar e Remover. */
  function linhaDaCategoria(categoria) {
    const item = criar('li');
    const form = criar('form', { classe: 'linha-categoria', autocomplete: 'off', novalidate: '' });

    const campoNome = criar('label', { classe: 'campo' });
    const inputNome = criar('input', { name: 'nome', maxlength: '40' });
    inputNome.value = categoria.nome;
    campoNome.append(criar('span', { classe: 'secundario', texto: 'Nome' }), inputNome);

    const campoOrcamento = criar('label', { classe: 'campo' });
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const inputOrcamento = criar('input', { name: 'orcamento', inputmode: 'decimal', placeholder: '0,00' });
    inputOrcamento.value = textoDoValor(categoria.orcamentoCentavos);
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), inputOrcamento);
    campoOrcamento.append(criar('span', { classe: 'secundario', texto: 'Orçamento' }), caixa);

    const acoes = criar('div', { classe: 'acoes' });
    const botaoRemover = criar('button', {
      classe: 'botao-pequeno perigo', texto: 'Remover', type: 'button',
      'aria-label': `Remover a categoria ${categoria.nome}`,
    });
    const botaoSalvar = criar('button', {
      classe: 'botao-pequeno', texto: 'Salvar', type: 'submit',
      'aria-label': `Salvar a categoria ${categoria.nome}`,
    });
    acoes.append(botaoRemover, botaoSalvar);

    const erro = criar('span', { classe: 'erro' });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErro(erro, null, '');
      try {
        const novos = editarCategoria(obterDados(), categoria.id, {
          nome: inputNome.value,
          orcamentoCentavos: lerValorPositivo(inputOrcamento.value, 'orcamento'),
        });
        await aplicarMudanca(novos, 'Categoria salva.');
        renderizarCategorias();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, falha.campo === 'nome' ? inputNome : inputOrcamento, falha.message);
      }
    });

    botaoRemover.addEventListener('click', async () => {
      mostrarErro(erro, null, '');
      const confirmou = window.confirm(
        `Remover a categoria "${categoria.nome}"?\n\nOs gastos já lançados nela continuam guardados.`,
      );
      if (!confirmou) return;
      try {
        await aplicarMudanca(removerCategoria(obterDados(), categoria.id), 'Categoria removida.');
        renderizarCategorias();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        mostrarErro(erro, null, falha.message);
      }
    });

    form.append(campoNome, campoOrcamento, acoes, erro);
    item.append(form);
    return item;
  }

  function renderizarCategorias() {
    el.listaCategorias.replaceChildren(...categoriasAtivas(obterDados()).map(linhaDaCategoria));
  }

  el.formNovaCategoria.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const { nome, orcamento } = el.formNovaCategoria.elements;
    mostrarErro(el.erroNovaCategoria, null, '');
    try {
      const novos = adicionarCategoria(obterDados(), {
        nome: nome.value,
        orcamentoCentavos: lerValorPositivo(orcamento.value, 'orcamento'),
      });
      await aplicarMudanca(novos, `Categoria "${nome.value.trim()}" adicionada.`);
      el.formNovaCategoria.reset();
      renderizarCategorias();
      nome.focus();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(el.erroNovaCategoria, null, falha.message);
    }
  });

  /* ---------------- Formas de pagamento ---------------- */

  function renderizarFormas() {
    el.listaFormas.replaceChildren(
      ...obterDados().formasPagamento.map((forma) => {
        const item = criar('li', { classe: 'forma' });
        const botao = criar('button', { type: 'button', texto: '×', 'aria-label': `Remover ${forma}` });
        botao.addEventListener('click', async () => {
          mostrarErro(el.erroNovaForma, null, '');
          try {
            await aplicarMudanca(removerFormaPagamento(obterDados(), forma), `"${forma}" removida.`);
            renderizarFormas();
          } catch (falha) {
            if (!(falha instanceof ErroValidacao)) throw falha;
            mostrarErro(el.erroNovaForma, null, falha.message);
          }
        });
        item.append(criar('span', { texto: forma }), botao);
        return item;
      }),
    );
  }

  el.formNovaForma.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const { nome } = el.formNovaForma.elements;
    mostrarErro(el.erroNovaForma, null, '');
    try {
      await aplicarMudanca(adicionarFormaPagamento(obterDados(), nome.value), `"${nome.value.trim()}" adicionada.`);
      el.formNovaForma.reset();
      renderizarFormas();
      nome.focus();
    } catch (falha) {
      if (!(falha instanceof ErroValidacao)) throw falha;
      mostrarErro(el.erroNovaForma, null, falha.message);
    }
  });

  /* ---------------- Tudo ---------------- */

  function renderizar() {
    renderizarMes();
    renderizarCategorias();
    renderizarFormas();
  }

  return { renderizar };
}
