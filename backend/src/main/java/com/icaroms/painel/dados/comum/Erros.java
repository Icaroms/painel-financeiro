package com.icaroms.painel.dados.comum;

import java.util.Map;

/**
 * Juntador de erros de validação: cada regra que falha acrescenta
 * "campo → mensagem", e no fim, se houver algum, lança
 * {@link DadosInvalidosException} com todos de uma vez.
 */
public final class Erros {

    private final Map<String, String> campos = new java.util.LinkedHashMap<>();

    /** Registra o erro se a condição for verdadeira (o primeiro erro de cada campo vale). */
    public Erros se(boolean condicao, String campo, String mensagem) {
        if (condicao) {
            campos.putIfAbsent(campo, mensagem);
        }
        return this;
    }

    public boolean temErros() {
        return !campos.isEmpty();
    }

    /** Lança a exceção se algum erro foi registrado. */
    public void lancarSeHouver() {
        if (temErros()) {
            throw new DadosInvalidosException(new java.util.LinkedHashMap<>(campos));
        }
    }
}
