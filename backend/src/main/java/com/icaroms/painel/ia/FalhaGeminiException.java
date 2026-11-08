package com.icaroms.painel.ia;

/**
 * O Gemini não respondeu como esperado (fora do ar, limite da chave,
 * demora, resposta vazia): HTTP 502, ou 504 quando demorou demais.
 */
public class FalhaGeminiException extends RuntimeException {

    private final boolean demorou;

    public FalhaGeminiException(String mensagem, boolean demorou) {
        super(mensagem);
        this.demorou = demorou;
    }

    public boolean isDemorou() {
        return demorou;
    }
}
