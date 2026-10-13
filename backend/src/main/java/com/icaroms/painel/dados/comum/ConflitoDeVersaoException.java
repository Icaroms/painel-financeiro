package com.icaroms.painel.dados.comum;

/**
 * O servidor já tem uma versão mais nova do registro (HTTP 409).
 *
 * <p>Regra da sincronização: vale a alteração mais recente (atualizadoEm).
 * A resposta leva a versão do servidor em "atual", para o app adotar.
 */
public class ConflitoDeVersaoException extends RuntimeException {

    private final transient Object atual;

    public ConflitoDeVersaoException(Object atual) {
        super("O servidor já tem uma versão mais nova deste registro.");
        this.atual = atual;
    }

    /** A versão guardada no servidor. */
    public Object getAtual() {
        return atual;
    }
}
