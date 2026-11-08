package com.icaroms.painel.ia;

/**
 * @param texto        a resposta da IA
 * @param usadosHoje   pedidos que esta conta já fez hoje (contando este)
 * @param limiteDiario pedidos permitidos por dia
 */
public record RespostaIa(String texto, int usadosHoje, int limiteDiario) {
}
