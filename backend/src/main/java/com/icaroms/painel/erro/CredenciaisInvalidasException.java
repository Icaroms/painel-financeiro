package com.icaroms.painel.erro;

/**
 * E-mail ou senha errados. A mensagem é a mesma nos dois casos, para não
 * revelar se o e-mail existe.
 */
public class CredenciaisInvalidasException extends RuntimeException {

    public CredenciaisInvalidasException() {
        super("E-mail ou senha incorretos.");
    }
}
