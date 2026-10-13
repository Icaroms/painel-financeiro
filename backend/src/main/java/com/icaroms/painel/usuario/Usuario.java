package com.icaroms.painel.usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Conta de quem usa o app.
 *
 * <p>Segue os mesmos campos de controle do front (id UUID, criadoEm,
 * atualizadoEm). O e-mail é guardado sempre em minúsculas e a senha só como
 * hash BCrypt: a senha em texto nunca é gravada.
 */
@Entity
@Table(name = "usuarios")
public class Usuario {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "senha_hash", nullable = false, length = 100)
    private String senhaHash;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm;

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm;

    /** Exigido pelo JPA. */
    protected Usuario() {
    }

    public Usuario(UUID id, String email, String senhaHash, Instant agora) {
        this.id = Objects.requireNonNull(id, "id");
        this.email = normalizarEmail(email);
        this.senhaHash = Objects.requireNonNull(senhaHash, "senhaHash");
        this.criadoEm = Objects.requireNonNull(agora, "agora");
        this.atualizadoEm = agora;
    }

    /** E-mail sem espaços nas pontas e em minúsculas (comparação sem diferença de caixa). */
    public static String normalizarEmail(String email) {
        return Objects.requireNonNull(email, "email").trim().toLowerCase(Locale.ROOT);
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getSenhaHash() {
        return senhaHash;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }

    public Instant getAtualizadoEm() {
        return atualizadoEm;
    }
}
