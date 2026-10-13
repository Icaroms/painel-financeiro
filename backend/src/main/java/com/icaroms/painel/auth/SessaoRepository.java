package com.icaroms.painel.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Acesso à tabela "sessoes". */
public interface SessaoRepository extends JpaRepository<Sessao, UUID> {

    Optional<Sessao> findByHashToken(String hashToken);

    /** Encerra todas as sessões ainda abertas de uma conta. */
    @Modifying
    @Query("update Sessao s set s.revogadaEm = :agora, s.motivoRevogacao = :motivo "
            + "where s.usuarioId = :usuarioId and s.revogadaEm is null")
    int encerrarTodas(@Param("usuarioId") UUID usuarioId, @Param("agora") Instant agora,
            @Param("motivo") String motivo);
}
