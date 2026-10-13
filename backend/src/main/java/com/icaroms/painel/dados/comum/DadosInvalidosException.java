package com.icaroms.painel.dados.comum;

import java.util.Map;

/** Regras de integridade que a anotação de validação sozinha não cobre (HTTP 400). */
public class DadosInvalidosException extends RuntimeException {

    private final Map<String, String> campos;

    public DadosInvalidosException(Map<String, String> campos) {
        super("Confira os campos destacados.");
        this.campos = campos;
    }

    public DadosInvalidosException(String campo, String mensagem) {
        this(Map.of(campo, mensagem));
    }

    /** Campo → mensagem, para o app destacar cada um. */
    public Map<String, String> getCampos() {
        return campos;
    }
}
