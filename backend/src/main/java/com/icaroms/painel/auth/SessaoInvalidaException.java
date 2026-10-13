package com.icaroms.painel.auth;

/** Token de renovação inexistente, vencido ou encerrado (HTTP 401). */
public class SessaoInvalidaException extends RuntimeException {

    public SessaoInvalidaException() {
        super("Sessão encerrada. Entre de novo.");
    }
}
