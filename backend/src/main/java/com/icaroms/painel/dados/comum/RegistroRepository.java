package com.icaroms.painel.dados.comum;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

/**
 * Consultas comuns a toda lista de registros. Cada lista tem o seu
 * repositório, que herda deste (ex.: CategoriaRepository).
 *
 * @param <E> a entidade da lista
 */
@NoRepositoryBean
public interface RegistroRepository<E extends Registro> extends JpaRepository<E, UUID> {

    /** Todos os registros da conta, inclusive os excluídos (o app precisa saber deles). */
    List<E> findByUsuarioIdOrderByCriadoEmAscIdAsc(UUID usuarioId);

    /**
     * Registros gravados no servidor a partir de um momento. Usa "a partir de"
     * (maior ou igual): repetir um registro não faz mal, perder um faria.
     */
    List<E> findByUsuarioIdAndRecebidoEmGreaterThanEqualOrderByRecebidoEmAscIdAsc(UUID usuarioId, Instant desde);
}
