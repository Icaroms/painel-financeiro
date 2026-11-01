package com.icaroms.painel.backup;

/** Backup acima do tamanho máximo (HTTP 413). */
public class BackupGrandeDemaisException extends RuntimeException {

    private final long limiteBytes;

    public BackupGrandeDemaisException(long limiteBytes) {
        super("O backup passa do tamanho máximo aceito pelo servidor ("
                + Math.max(1, limiteBytes / (1024 * 1024)) + " MB).");
        this.limiteBytes = limiteBytes;
    }

    public long getLimiteBytes() {
        return limiteBytes;
    }
}
