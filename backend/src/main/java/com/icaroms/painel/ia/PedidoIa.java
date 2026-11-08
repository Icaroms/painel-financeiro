package com.icaroms.painel.ia;

import jakarta.validation.constraints.NotBlank;

/**
 * Pedido do app para a IA do servidor: o mesmo par que o app mandaria ao
 * Gemini direto (src/ia.js): as instruções (o papel da IA e as regras) e o
 * conteúdo (os números e a pergunta).
 *
 * @param instrucoes o papel da IA e as regras de resposta
 * @param conteudo   os números e a pergunta
 * @param modelo     modelo escolhido no app (opcional; fora da lista, vale o padrão)
 */
public record PedidoIa(
        @NotBlank(message = "Faltam as instruções.") String instrucoes,
        @NotBlank(message = "Falta o conteúdo.") String conteudo,
        String modelo) {
}
