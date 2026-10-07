/**
 * Tela de lançamento: liga o HTML (index.html) às regras do app.
 *
 * Este arquivo só cuida da TELA: lê o que a pessoa digitou ou escolheu,
 * pede o resultado ao painel (src/painel.js) e copia os textos e
 * posições para o HTML. Nenhuma conta de dinheiro é feita aqui.
 *
 * Nesta versão, os dados são de EXEMPLO e ficam só na memória:
 * recarregar a página volta tudo ao começo. Gravar no aparelho
 * (IndexedDB) é uma tarefa futura.
 */

import { hojeLocal } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { marcasDaEscala } from '../mostrador.js';
import { criarDadosDeExemplo } from '../dados-exemplo.js';
import { calcularPainel } from '../painel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ */
/* Elementos da página                                                */
/* ------------------------------------------------------------------ */

/** Busca um elemento pelo id e avisa claramente se ele não existir. */
function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) {
    throw new Error(`Elemento #${id} não encontrado no index.html.`);
  }
  return encontrado;
}

const el = {
  tela: elemento('tela'),
  tituloMes: elemento('titulo-mes'),
  diaTexto: elemento('dia-texto'),
  linhaSaldo: elemento('linha-saldo'),
  arcoUso: elemento('arco-uso'),
  marcas: elemento('marcas'),
  marcadorHoje: elemento('marcador-hoje'),
  ponteiro: elemento('ponteiro'),
  numero: elemento('numero'),
  legenda: elemento('legenda'),
  usadoTexto: elemento('usado-texto'),
  hojeTexto: elemento('hoje-texto'),
  frase: elemento('frase'),
  formulario: elemento('formulario'),
  valor: elemento('valor'),
  chipsCategoria: elemento('chips-categoria'),
  chipsPagamento: elemento('chips-pagamento'),
  botaoLancar: elemento('botao-lancar'),
  rodapeTexto: elemento('rodape-texto'),
  botaoRestaurar: elemento('botao-restaurar'),
};

/* ------------------------------------------------------------------ */
/* Estado da tela                                                     */
/* ------------------------------------------------------------------ */

let dados = criarDadosDeExemplo(hojeLocal());

/* ------------------------------------------------------------------ */
/* Montagem (feita uma vez, ou ao restaurar o exemplo)                */
/* ------------------------------------------------------------------ */

/**
 * Cria um chip: um botão de rádio de verdade dentro de um <label>.
 * O texto entra com textContent (nunca innerHTML), para que um nome
 * digitado pela pessoa nunca seja interpretado como HTML.
 */
function criarChip(grupo, valor, rotulo, marcado) {
  const label = document.createElement('label');
  label.className = 'chip';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = grupo;
  input.value = valor;
  input.checked = marcado;

  const texto = document.createElement('span');
  texto.textContent = rotulo;

  label.append(input, texto);
  return label;
}

/** Desenha as marcas da escala do mostrador. */
function montarMarcas() {
  for (const marca of marcasDaEscala()) {
    const linha = document.createElementNS(SVG_NS, 'line');
    linha.setAttribute('class', 'marca');
    linha.setAttribute('x1', marca.x1);
    linha.setAttribute('y1', marca.y1);
    linha.setAttribute('x2', marca.x2);
    linha.setAttribute('y2', marca.y2);
    el.marcas.append(linha);
  }
}

/** Cria os chips de categoria e de pagamento a partir dos dados. */
function montarChips() {
  el.chipsCategoria.replaceChildren(
    ...dados.categorias.map((c, i) => criarChip('categoria', c.id, c.nome, i === 0)),
  );
  el.chipsPagamento.replaceChildren(
    ...dados.formasPagamento.map((f, i) => criarChip('pagamento', f, f, i === 0)),
  );
}

/* ------------------------------------------------------------------ */
/* Atualização (a cada tecla e a cada escolha)                        */
/* ------------------------------------------------------------------ */

/** Lê o formulário, calcula o painel e atualiza a tela. Devolve o painel. */
function atualizar() {
  const painel = calcularPainel({
    dados,
    valorTexto: el.valor.value,
    categoriaId: el.formulario.elements.categoria.value,
    formaPagamento: el.formulario.elements.pagamento.value,
    hoje: hojeLocal(),
  });

  el.tela.dataset.cor = painel.cor;
  el.tituloMes.textContent = painel.tituloMes;
  el.diaTexto.textContent = painel.diaTexto;
  el.linhaSaldo.textContent = painel.linhaSaldo;

  el.arcoUso.setAttribute('stroke-dasharray', painel.mostrador.traco);
  el.ponteiro.style.transform = `rotate(${painel.mostrador.grausPonteiro}deg)`;
  el.marcadorHoje.setAttribute('points', painel.mostrador.triangulo);

  el.numero.textContent = painel.numero;
  el.legenda.textContent = painel.legenda;
  el.usadoTexto.textContent = painel.usadoTexto;
  el.hojeTexto.textContent = painel.hojeTexto;
  el.frase.textContent = painel.frase;

  el.botaoLancar.disabled = painel.lancamento === null;
  return painel;
}

/* ------------------------------------------------------------------ */
/* Eventos                                                            */
/* ------------------------------------------------------------------ */

// O evento "input" sobe do campo de valor e dos chips: qualquer mudança atualiza a tela.
el.formulario.addEventListener('input', () => {
  el.rodapeTexto.textContent = '';
  atualizar();
});

// Lançar: grava o gasto (na memória, por enquanto) e limpa o valor.
el.formulario.addEventListener('submit', (evento) => {
  evento.preventDefault(); // impede o navegador de recarregar a página

  const painel = atualizar();
  if (painel.lancamento === null) return;

  dados = { ...dados, lancamentos: [...dados.lancamentos, painel.lancamento] };

  const categoria = dados.categorias.find((c) => c.id === painel.lancamento.categoriaId);
  el.valor.value = '';
  atualizar();
  el.rodapeTexto.textContent = `Lançado: ${formatarCentavos(painel.lancamento.valorCentavos)} em ${categoria.nome}.`;
  el.valor.focus();
});

el.botaoRestaurar.addEventListener('click', () => {
  dados = criarDadosDeExemplo(hojeLocal());
  el.valor.value = '';
  montarChips();
  atualizar();
  el.rodapeTexto.textContent = 'Exemplo restaurado.';
});

/* ------------------------------------------------------------------ */
/* Início                                                             */
/* ------------------------------------------------------------------ */

montarMarcas();
montarChips();
atualizar();
