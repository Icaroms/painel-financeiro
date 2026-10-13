package com.icaroms.painel.dados.comum;

/**
 * Registro inexistente ou de outra conta (HTTP 404). A resposta é a mesma
 * nos dois casos, para não revelar que o id existe em outra conta.
 */
public class RegistroNaoEncontradoException extends RuntimeException {

    public RegistroNaoEncontradoException() {
        super("Registro não encontrado.");
    }
}
