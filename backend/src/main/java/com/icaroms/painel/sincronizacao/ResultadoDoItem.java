package com.icaroms.painel.sincronizacao;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/**
 * O que aconteceu com um registro enviado na sincronização.
 *
 * @param id       id do registro (null para a configuração)
 * @param situacao "gravado", "conflito" (o servidor tem versão mais nova, que vai em "atual")
 *                 ou "recusado" (dados inválidos, motivo em "campos")
 * @param atual    a versão do servidor, nos conflitos
 * @param campos   campo → mensagem, nos recusados
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ResultadoDoItem(String id, String situacao, Object atual, Map<String, String> campos) {

    public static ResultadoDoItem gravado(String id) {
        return new ResultadoDoItem(id, "gravado", null, null);
    }

    public static ResultadoDoItem conflito(String id, Object atual) {
        return new ResultadoDoItem(id, "conflito", atual, null);
    }

    public static ResultadoDoItem recusado(String id, Map<String, String> campos) {
        return new ResultadoDoItem(id, "recusado", null, campos);
    }
}
