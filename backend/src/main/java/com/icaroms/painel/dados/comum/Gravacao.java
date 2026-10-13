package com.icaroms.painel.dados.comum;

/**
 * Resultado de uma gravação (PUT).
 *
 * @param registro o registro como ficou no servidor
 * @param criado   true se não existia (HTTP 201), false se foi atualizado (HTTP 200)
 * @param <D>      o tipo do JSON do registro
 */
public record Gravacao<D>(D registro, boolean criado) {
}
