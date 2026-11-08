package com.icaroms.painel.ia;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Contagem de pedidos de IA por conta e por dia (tabela uso_ia). */
@Repository
public class UsoIaRepository {

    private final JdbcTemplate jdbc;

    public UsoIaRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Soma um pedido, mas só se ainda estiver abaixo do limite (numa única
     * instrução: dois pedidos ao mesmo tempo não passam do limite).
     *
     * @return quantos pedidos a conta fez no dia, contando este; vazio se o limite já foi atingido
     */
    public java.util.Optional<Integer> registrar(UUID usuarioId, LocalDate dia, int limite) {
        List<Integer> resultado = jdbc.queryForList("""
                INSERT INTO uso_ia (usuario_id, dia, pedidos) VALUES (?, ?, 1)
                ON CONFLICT (usuario_id, dia) DO UPDATE SET pedidos = uso_ia.pedidos + 1
                WHERE uso_ia.pedidos < ?
                RETURNING pedidos
                """, Integer.class, usuarioId, dia, limite);
        return resultado.stream().findFirst();
    }

    /** Pedidos da conta no dia (0 se nenhum). */
    public int usados(UUID usuarioId, LocalDate dia) {
        List<Integer> resultado = jdbc.queryForList(
                "SELECT pedidos FROM uso_ia WHERE usuario_id = ? AND dia = ?", Integer.class, usuarioId, dia);
        return resultado.isEmpty() ? 0 : resultado.get(0);
    }
}
