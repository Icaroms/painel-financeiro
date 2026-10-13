package com.icaroms.painel.dados.comum;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Base de todo registro do app guardado no servidor (categoria, fixo,
 * lançamento, mês, investimento).
 *
 * <p>Os campos de controle são os mesmos do front (src/modelo.js): id (UUID
 * gerado no aparelho), criadoEm, atualizadoEm e excluidoEm (exclusão suave).
 * O servidor acrescenta dois:
 * <ul>
 *   <li>{@code usuarioId}: dono do registro;</li>
 *   <li>{@code recebidoEm}: hora do servidor na última gravação, usada pela
 *       sincronização para saber o que mudou desde a última conversa.</li>
 * </ul>
 * Campos que o app tiver e o servidor não conhecer ficam em {@code extras}
 * e voltam iguais: o servidor nunca perde dado do app.
 */
@MappedSuperclass
public abstract class Registro {

    @Id
    private UUID id;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private UUID usuarioId;

    @Column(name = "criado_em", nullable = false)
    private Instant criadoEm;

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm;

    @Column(name = "excluido_em")
    private Instant excluidoEm;

    @Column(name = "recebido_em", nullable = false)
    private Instant recebidoEm;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extras", nullable = false)
    private Map<String, Object> extras = new LinkedHashMap<>();

    /** Exigido pelo JPA. */
    protected Registro() {
    }

    protected Registro(UUID id, UUID usuarioId) {
        this.id = Objects.requireNonNull(id, "id");
        this.usuarioId = Objects.requireNonNull(usuarioId, "usuarioId");
    }

    /**
     * Copia os campos de controle vindos do app e marca a hora do servidor.
     *
     * @param controle   id, datas e extras enviados pelo app
     * @param recebidoEm hora do servidor
     */
    public void aplicarControle(RegistroDto controle, Instant recebidoEm) {
        this.criadoEm = controle.getCriadoEm();
        this.atualizadoEm = controle.getAtualizadoEm();
        this.excluidoEm = controle.getExcluidoEm();
        this.extras = new LinkedHashMap<>(controle.getExtras());
        this.recebidoEm = recebidoEm;
    }

    /** Exclusão suave feita pelo servidor (DELETE): o registro continua no banco. */
    public void excluir(Instant agora) {
        if (excluidoEm == null) {
            this.excluidoEm = agora;
            this.atualizadoEm = agora;
        }
        this.recebidoEm = agora;
    }

    /** Copia os campos de controle para a resposta. */
    public void preencherControle(RegistroDto destino) {
        destino.setId(id);
        destino.setCriadoEm(criadoEm);
        destino.setAtualizadoEm(atualizadoEm);
        destino.setExcluidoEm(excluidoEm);
        destino.setRecebidoEm(recebidoEm);
        if (extras != null) {
            extras.forEach(destino::guardarExtra);
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUsuarioId() {
        return usuarioId;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }

    public Instant getAtualizadoEm() {
        return atualizadoEm;
    }

    public Instant getExcluidoEm() {
        return excluidoEm;
    }

    public Instant getRecebidoEm() {
        return recebidoEm;
    }
}
