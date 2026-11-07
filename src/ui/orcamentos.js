/**
 * Configurar → Categorias e orçamentos: o livre do mês, o alerta quando a
 * soma dos orçamentos passa dele e o botão "Sugerir valores" (11/2026).
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA: as contas estão em
 * src/orcamento.js (testadas no Node).
 */

import { hojeLocal, mesDaData } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { textoDoValor, lerValorPositivo } from '../configuracao.js';
import { livreParaODiaADia, alertaDosOrcamentos, sugerirOrcamentos, aplicarSugestao } from '../orcamento.js';

function elemento(id) {
  const encontrado = document.getElementById(id);
  if (!encontrado) throw new Error(`Elemento #${id} não encontrado no index.html.`);
  return encontrado;
}

function criar(tag, { classe, texto, ...atributos } = {}) {
  const novo = document.createElement(tag);
  if (classe) novo.className = classe;
  if (texto !== undefined) novo.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) novo.setAttribute(nome, valor);
  return novo;
}

/** De onde veio o peso de cada categoria na sugestão. */
const BASE = {
  gastos: 'pelo que você gastou em cada categoria (este mês e até 3 anteriores)',
  orcamentos: 'pela proporção dos orçamentos atuais (ainda não há gastos para comparar)',
  iguais: 'em partes iguais (ainda não há gastos nem orçamentos)',
};

/**
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @param {() => void} [opcoes.aoAplicar] Redesenha a lista de categorias.
 * @returns {{ renderizar: () => void }}
 */
export function iniciarOrcamentos({ obterDados, aplicarMudanca, aoAplicar = () => {} }) {
  const el = {
    livre: elemento('livre-do-mes'),
    alerta: elemento('alerta-orcamentos'),
    alertaTexto: elemento('alerta-orcamentos-texto'),
    botao: elemento('botao-sugerir-orcamentos'),
    area: elemento('area-sugestao-orcamentos'),
  };
  const mesAtual = () => mesDaData(hojeLocal());
  let aberta = false;

  /** O quadro da sugestão: um campo por categoria, já preenchido, e Aplicar. */
  function quadroDaSugestao() {
    const sugestao = sugerirOrcamentos(obterDados(), mesAtual());
    const quadro = criar('div', { classe: 'quadro-sugestao' });
    const fechar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Fechar' });
    fechar.addEventListener('click', () => {
      aberta = false;
      renderizar();
    });

    if (!sugestao.ok) {
      quadro.append(criar('p', { texto: sugestao.motivo }), fechar);
      return quadro;
    }

    quadro.append(criar('p', {
      texto: `Livre para o dia a dia: ${formatarCentavos(sugestao.livre.livreCentavos)}, dividido ${BASE[sugestao.base]}. ` +
        'Ajuste o que quiser antes de aplicar.',
    }));
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });
    const campos = sugestao.itens.map(({ categoria, atualCentavos, sugeridoCentavos }) => {
      const label = criar('label', { classe: 'campo' });
      const caixa = criar('span', { classe: 'campo-dinheiro' });
      const input = criar('input', { inputmode: 'numeric', 'aria-label': `Orçamento de ${categoria.nome}` });
      input.value = textoDoValor(sugeridoCentavos);
      caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), input);
      label.append(
        criar('span', { classe: 'secundario', texto: `${categoria.nome} (hoje ${formatarCentavos(atualCentavos)})` }),
        caixa,
      );
      form.append(label);
      return { categoria, input };
    });
    const soma = criar('p', { classe: 'dica secundario inteira' });
    const atualizarSoma = () => {
      try {
        const total = campos.reduce((t, c) => t + lerValorPositivo(c.input.value, 'orcamento'), 0);
        const sobra = sugestao.livre.livreCentavos - total;
        soma.textContent = `Soma: ${formatarCentavos(total)} · ${sobra >= 0 ? `ficam ${formatarCentavos(sobra)} sem destino` : `passa do livre em ${formatarCentavos(-sobra)}`}`;
      } catch {
        soma.textContent = '';
      }
    };
    form.addEventListener('input', atualizarSoma);
    atualizarSoma();

    const erro = criar('span', { classe: 'erro' });
    const acoes = criar('div', { classe: 'acoes' });
    const aplicar = criar('button', { classe: 'botao-pequeno', type: 'submit', texto: 'Aplicar' });
    acoes.append(fechar, aplicar);
    form.append(soma, erro, acoes);
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.textContent = '';
      try {
        const valores = campos.map(({ categoria, input }) => ({
          categoriaId: categoria.id, orcamentoCentavos: lerValorPositivo(input.value, 'orcamento'),
        }));
        aberta = false;
        await aplicarMudanca(aplicarSugestao(obterDados(), valores), 'Orçamentos atualizados.');
        renderizar();
        aoAplicar();
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        erro.textContent = falha.message;
      }
    });
    quadro.append(form);
    return quadro;
  }

  function renderizar() {
    const dados = obterDados();
    if (!dados) return;
    const mes = mesAtual();
    const livre = livreParaODiaADia(dados, mes);
    const partes = [`entradas ${formatarCentavos(livre.entradasCentavos)}`, `contas fixas ${formatarCentavos(livre.contasCentavos)}`];
    if (livre.parcelasCentavos > 0) partes.push(`parcelas ${formatarCentavos(livre.parcelasCentavos)}`);
    partes.push(`folga ${formatarCentavos(livre.folgaCentavos)}`);
    el.livre.replaceChildren(
      'Livre para o dia a dia: ',
      criar('strong', { texto: formatarCentavos(livre.livreCentavos) }),
      ` (${partes.join(' − ')})`,
    );

    const alerta = alertaDosOrcamentos(dados, mes);
    el.alerta.hidden = alerta === null;
    if (alerta) {
      el.alertaTexto.textContent = livre.entradasCentavos === 0
        ? `Os orçamentos somam ${formatarCentavos(alerta.somaCentavos)}, mas o app não sabe quanto entra por mês. ` +
          'Cadastre o salário em "Entradas fixas".'
        : `Os orçamentos somam ${formatarCentavos(alerta.somaCentavos)}: ${formatarCentavos(alerta.excessoCentavos)} a mais do que o livre do mês. ` +
          'Se todos forem usados até o fim, o mês fecha no vermelho. Use "Sugerir valores" ou reduza alguns.';
    }

    el.botao.hidden = aberta;
    el.area.replaceChildren(...(aberta ? [quadroDaSugestao()] : []));
  }

  el.botao.addEventListener('click', () => {
    aberta = true;
    renderizar();
  });

  return { renderizar };
}
