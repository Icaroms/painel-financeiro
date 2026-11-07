/**
 * Lista de desejos na vista Avaliar compra (11/2026).
 *
 * Cada produto mostra o menor preço registrado e o que o app diz sobre
 * comprar nesse preço (a mesma cor do Avaliar compra). Ações:
 * - "Novo preço": registra um preço encontrado (valor, loja, dia);
 * - "Avaliar": abre o produto no formulário do Avaliar compra;
 * - "Opinião da IA": a IA diz se, no menor preço, já dá para comprar;
 * - "Histórico": os preços registrados, com Apagar; e Remover o produto.
 *
 * Como em toda a pasta src/ui, aqui só fica a TELA: as regras estão em
 * src/desejos.js e a mensagem da IA em src/explicacoes.js.
 */

import { hojeLocal, mesDaData, tituloDoMes } from '../datas.js';
import { formatarCentavos } from '../dinheiro.js';
import { ErroValidacao } from '../erros.js';
import { dadosDoMes } from '../meses.js';
import { lerValorPositivo } from '../configuracao.js';
import { premissasDaPrevisao } from '../fluxo.js';
import { desejosDe, registrarPreco, removerPreco, removerDesejo, avaliarDesejo } from '../desejos.js';
import { mensagemDoDesejo } from '../explicacoes.js';
import { blocosDaResposta } from '../analise.js';
import { chamarGemini, iaDisponivel } from '../ia.js';
import { elementosDosBlocos } from './blocos-ia.js';

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

const dataCurta = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const mesPorExtenso = (mes) => tituloDoMes(mes).toLowerCase();
const SELO = { verde: 'Cabe', amarelo: 'Atenção', vermelho: 'Passou' };

/** "Pode comprar agora" / "A partir de dezembro de 2026" / "Ainda não cabe". */
function textoDoMomento(opcao) {
  const { esperaMeses, mesDaCompra } = opcao.melhorMomento;
  if (esperaMeses === 0) return 'Cabe comprar agora';
  if (esperaMeses === null) return 'Ainda não cabe nos próximos 12 meses';
  return `Cabe a partir de ${mesPorExtenso(mesDaCompra)}`;
}

/**
 * @param {object} opcoes
 * @param {() => object} opcoes.obterDados
 * @param {(novos: object, mensagem: string) => Promise<void>} opcoes.aplicarMudanca
 * @param {() => object} opcoes.obterConfigIA
 * @param {(desejo: object, menorCentavos: number) => void} opcoes.abrirNaAvaliacao
 * @returns {{ renderizar: () => void }}
 */
export function iniciarDesejos({ obterDados, aplicarMudanca, obterConfigIA, abrirNaAvaliacao }) {
  const el = { secao: elemento('secao-desejos'), lista: elemento('lista-desejos'), contagem: elemento('desejos-contagem') };
  /** Qual produto está com o formulário "Novo preço" aberto. */
  let precoAberto = null;

  async function mudar(novos, mensagem) {
    await aplicarMudanca(novos, mensagem);
    renderizar();
  }

  /** Formulário "Novo preço": valor, loja e dia. */
  function formularioDePreco(desejo) {
    const form = criar('form', { classe: 'form-fixo', autocomplete: 'off', novalidate: '' });
    const caixa = criar('span', { classe: 'campo-dinheiro' });
    const valor = criar('input', { inputmode: 'numeric', placeholder: '0,00', 'aria-label': 'Preço encontrado' });
    caixa.append(criar('span', { texto: 'R$', 'aria-hidden': 'true' }), valor);
    const loja = criar('input', { maxlength: '40', placeholder: 'Ex.: Amazon', 'aria-label': 'Loja' });
    const data = criar('input', { type: 'date', 'aria-label': 'Dia' });
    data.value = hojeLocal();
    data.max = hojeLocal();
    const campo = (rotulo, controle, classe = 'campo') => {
      const label = criar('label', { classe });
      label.append(criar('span', { classe: 'secundario', texto: rotulo }), controle);
      return label;
    };
    const erro = criar('span', { classe: 'erro' });
    const acoes = criar('div', { classe: 'acoes' });
    const cancelar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Cancelar' });
    acoes.append(cancelar, criar('button', { classe: 'botao-pequeno', type: 'submit', texto: 'Registrar preço' }));
    cancelar.addEventListener('click', () => {
      precoAberto = null;
      renderizar();
    });
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.textContent = '';
      try {
        const novos = registrarPreco(obterDados(), desejo.id, {
          valorCentavos: lerValorPositivo(valor.value, 'valorCentavos'), data: data.value, loja: loja.value,
        });
        precoAberto = null;
        await mudar(novos, `Preço de ${desejo.nome} registrado.`);
      } catch (falha) {
        if (!(falha instanceof ErroValidacao)) throw falha;
        erro.textContent = falha.message;
      }
    });
    form.append(campo('Preço encontrado', caixa), campo('Dia', data), campo('Loja (opcional)', loja, 'campo inteira'), erro, acoes);
    requestAnimationFrame(() => valor.focus());
    return form;
  }

  /** Histórico de preços, com Apagar, e o botão Remover produto. */
  function historico(desejo) {
    const detalhes = criar('details', { classe: 'historico-precos' });
    detalhes.append(criar('summary', { texto: `Histórico (${desejo.precos.length} ${desejo.precos.length === 1 ? 'preço' : 'preços'})` }));
    const lista = criar('ul', { classe: 'itens-fatura' });
    for (const p of [...desejo.precos].sort((a, b) => b.data.localeCompare(a.data))) {
      const li = criar('li');
      const apagar = criar('button', { classe: 'botao-link', type: 'button', texto: 'apagar', 'aria-label': `Apagar o preço de ${dataCurta(p.data)}` });
      apagar.addEventListener('click', async () => {
        try {
          await mudar(removerPreco(obterDados(), desejo.id, p.id), 'Preço apagado.');
        } catch (falha) {
          if (!(falha instanceof ErroValidacao)) throw falha;
          window.alert(falha.message);
        }
      });
      const texto = criar('span', { texto: `${dataCurta(p.data)}${p.loja ? ` · ${p.loja}` : ''}` });
      li.append(texto, criar('span', { texto: formatarCentavos(p.valorCentavos) }), apagar);
      lista.append(li);
    }
    const remover = criar('button', { classe: 'botao-pequeno perigo', type: 'button', texto: 'Remover da lista' });
    remover.addEventListener('click', async () => {
      if (!window.confirm(`Remover "${desejo.nome}" da lista de desejos? Os preços registrados somem.`)) return;
      await mudar(removerDesejo(obterDados(), desejo.id), `"${desejo.nome}" removido da lista.`);
    });
    detalhes.append(lista, remover);
    return detalhes;
  }

  /** Bloco "Opinião da IA" (só com a IA ligada). */
  function blocoIA(desejo, avaliacao, visao, hoje) {
    if (!iaDisponivel(obterConfigIA())) return null;
    const botao = criar('button', { classe: 'botao-pequeno botao-ia', type: 'button', texto: 'Opinião da IA' });
    const resposta = criar('div', { classe: 'ia-resposta', 'aria-live': 'polite', hidden: '' });
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      resposta.hidden = false;
      resposta.dataset.estado = 'carregando';
      resposta.replaceChildren(criar('p', { texto: 'Avaliando…' }));
      const premissas = premissasDaPrevisao(visao);
      const avisos = [];
      if (premissas.entrada.fonte === 'renda-do-mes' && premissas.entrada.centavos === 0) {
        avisos.push('Os próximos meses estão sendo previstos sem salário (nenhuma entrada fixa cadastrada).');
      }
      const resultado = await chamarGemini(obterConfigIA(), mensagemDoDesejo(desejo, avaliacao, { hoje, premissas, avisos }));
      botao.disabled = false;
      botao.textContent = 'Opinião da IA de novo';
      if (resultado.ok) {
        resposta.dataset.estado = 'ok';
        resposta.replaceChildren(
          ...elementosDosBlocos(blocosDaResposta(resultado.texto)),
          criar('p', { classe: 'ia-selo', texto: 'Texto gerado por IA. Confira os números no app.' }),
        );
      } else {
        resposta.dataset.estado = 'erro';
        resposta.replaceChildren(criar('p', { texto: resultado.erro }));
      }
    });
    const bloco = criar('div', { classe: 'ia-bloco' });
    bloco.append(botao, resposta);
    return bloco;
  }

  /** Um produto da lista. */
  function item(desejo, visao, hoje) {
    const avaliacao = avaliarDesejo(visao, desejo, hoje);
    const { precos } = avaliacao;
    const cor = avaliacao.opcao?.cor ?? 'neutro';
    const li = criar('li', { classe: 'desejo', 'data-cor': cor });

    const topo = criar('div', { classe: 'opcao-topo' });
    topo.append(criar('h3', { texto: desejo.nome }), criar('span', { classe: 'selo-opcao', texto: SELO[cor] ?? '' }));

    const pagamento = avaliacao.ehCartao && desejo.parcelas > 1
      ? `${desejo.parcelas}x de ${formatarCentavos(Math.round(precos.menor.valorCentavos / desejo.parcelas))} no ${desejo.formaPagamento}`
      : `à vista no ${desejo.formaPagamento}`;
    const linhas = criar('ul', { classe: 'opcao-linhas' });
    linhas.append(criar('li', {
      texto: `Menor preço: ${formatarCentavos(precos.menor.valorCentavos)} (${dataCurta(precos.menor.data)}${precos.menor.loja ? `, ${precos.menor.loja}` : ''})`,
    }));
    if (precos.quantos > 1 && precos.variacaoCentavos !== 0) {
      linhas.append(criar('li', {
        texto: `Desde o 1º registro: ${precos.variacaoCentavos < 0 ? 'baixou' : 'subiu'} ${formatarCentavos(Math.abs(precos.variacaoCentavos))}`,
      }));
    }
    linhas.append(criar('li', {
      classe: avaliacao.erro ? 'linha-alerta' : undefined,
      texto: avaliacao.erro ? avaliacao.erro : `${textoDoMomento(avaliacao.opcao)} · ${pagamento}`,
    }));

    const acoes = criar('div', { classe: 'acoes-desejo' });
    const novoPreco = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Novo preço' });
    const avaliar = criar('button', { classe: 'botao-pequeno', type: 'button', texto: 'Avaliar' });
    novoPreco.addEventListener('click', () => {
      precoAberto = desejo.id;
      renderizar();
    });
    avaliar.addEventListener('click', () => abrirNaAvaliacao(desejo, precos.menor.valorCentavos));
    acoes.append(novoPreco, avaliar);

    li.append(topo, linhas, acoes);
    if (precoAberto === desejo.id) li.append(formularioDePreco(desejo));
    const ia = avaliacao.opcao ? blocoIA(desejo, avaliacao, visao, hoje) : null;
    if (ia) li.append(ia);
    li.append(historico(desejo));
    return li;
  }

  function renderizar() {
    const dados = obterDados();
    const desejos = dados ? desejosDe(dados) : [];
    el.secao.hidden = desejos.length === 0;
    if (desejos.length === 0) {
      el.lista.replaceChildren();
      return;
    }
    const hoje = hojeLocal();
    const visao = dadosDoMes(dados, mesDaData(hoje));
    el.contagem.textContent = `(${desejos.length})`;
    el.lista.replaceChildren(...desejos.map((d) => item(d, visao, hoje)));
  }

  return { renderizar };
}
