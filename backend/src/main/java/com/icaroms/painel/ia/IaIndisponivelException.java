package com.icaroms.painel.ia;

/** A IA do servidor não está configurada (sem PAINEL_GEMINI_CHAVE): HTTP 503. */
public class IaIndisponivelException extends RuntimeException {

    public IaIndisponivelException() {
        super("A IA do servidor não está configurada. Use a chave do próprio aparelho em Ajustes → IA.");
    }
}
