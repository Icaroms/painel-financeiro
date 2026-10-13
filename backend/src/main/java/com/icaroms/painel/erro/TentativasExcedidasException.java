package com.icaroms.painel.erro;

import java.time.Duration;

/** Muitas tentativas erradas de login: bloqueio temporário (HTTP 429). */
public class TentativasExcedidasException extends RuntimeException {

    private final Duration esperar;

    public TentativasExcedidasException(Duration esperar) {
        super("Muitas tentativas de login. Aguarde alguns minutos e tente de novo.");
        this.esperar = esperar;
    }

    /** Quanto falta para liberar (vai no cabeçalho Retry-After, em segundos). */
    public Duration getEsperar() {
        return esperar;
    }
}
