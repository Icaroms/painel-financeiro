package com.icaroms.painel.ia;

import java.util.List;

/**
 * Situação da IA do servidor para a conta (Ajustes → IA, no app).
 *
 * @param disponivel   o servidor tem a chave do Gemini configurada
 * @param modelos      modelos aceitos (o primeiro é o padrão)
 * @param usadosHoje   pedidos que esta conta já fez hoje
 * @param limiteDiario pedidos permitidos por dia
 */
public record SituacaoIa(boolean disponivel, List<String> modelos, int usadosHoje, int limiteDiario) {
}
