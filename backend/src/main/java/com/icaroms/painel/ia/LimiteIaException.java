package com.icaroms.painel.ia;

import java.time.Duration;

/** A conta já usou todos os pedidos de IA do dia: HTTP 429 (com Retry-After até a meia-noite). */
public class LimiteIaException extends RuntimeException {

    private final int limiteDiario;
    private final Duration esperar;

    public LimiteIaException(int limiteDiario, Duration esperar) {
        super("Você já usou os " + limiteDiario + " pedidos de IA de hoje. O limite volta amanhã.");
        this.limiteDiario = limiteDiario;
        this.esperar = esperar;
    }

    public int getLimiteDiario() {
        return limiteDiario;
    }

    /** Quanto falta para o limite voltar (meia-noite de Brasília). */
    public Duration getEsperar() {
        return esperar;
    }
}
