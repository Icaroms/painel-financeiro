/**
 * Erros do Painel Financeiro.
 *
 * Todas as validações do app lançam ErroValidacao. Além da mensagem,
 * o erro informa o "campo" que falhou, para a tela poder destacar
 * exatamente o campo do formulário que precisa ser corrigido.
 */

export class ErroValidacao extends Error {
  /**
   * @param {string} campo    Nome do campo inválido (ex.: "valorCentavos").
   * @param {string} mensagem Texto explicando o problema e como corrigir.
   */
  constructor(campo, mensagem) {
    super(mensagem);
    this.name = 'ErroValidacao';
    this.campo = campo;
  }
}
