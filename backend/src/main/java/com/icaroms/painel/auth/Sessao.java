package com.icaroms.painel.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Uma sessão de login de um aparelho, ligada a um token de renovação.
 * Só o hash do token fica no banco (ver V3__sessoes.sql).
 */
@Entity
@Table(name = "sessoes")
public class Sessao {

    /** Motivos de encerramento gravados em motivo_revogacao. */
    static final String RENOVADA = "renovada";
    static final String SAIDA = "saida";
    static final String REUSO = "reuso";

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private UUID usuarioId;

    @Column(name = "hash_token", nullable = false, length = 64)
    private String hashToken;

    @Column(name = "criada_em", nullable = false)
    private Instant criadaEm;

    @Column(name = "expira_em", nullable = false)
    private Instant expiraEm;

    @Column(name = "revogada_em")
    private Instant revogadaEm;

    @Column(name = "motivo_revogacao", length = 20)
    private String motivoRevogacao;

    /** Exigido pelo JPA. */
    protected Sessao() {
    }

    public Sessao(UUID id, UUID usuarioId, String hashToken, Instant criadaEm, Instant expiraEm) {
        this.id = id;
        this.usuarioId = usuarioId;
        this.hashToken = hashToken;
        this.criadaEm = criadaEm;
        this.expiraEm = expiraEm;
    }

    /** A sessão ainda pode renovar? (não encerrada e dentro da validade) */
    public boolean ativa(Instant agora) {
        return revogadaEm == null && agora.isBefore(expiraEm);
    }

    public void encerrar(Instant agora, String motivo) {
        if (revogadaEm == null) {
            this.revogadaEm = agora;
            this.motivoRevogacao = motivo;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUsuarioId() {
        return usuarioId;
    }

    public Instant getExpiraEm() {
        return expiraEm;
    }

    public Instant getRevogadaEm() {
        return revogadaEm;
    }

    public String getMotivoRevogacao() {
        return motivoRevogacao;
    }
}
