package com.icaroms.painel.dados.configuracao;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Configuração do app de uma conta (uma linha por conta): formas de
 * pagamento, cartões de crédito, destino da sobra e data do último backup.
 *
 * <p>No app, esses itens não têm id próprio (o cartão é identificado pela
 * forma de pagamento), então são gravados juntos, como um documento só, e
 * vale a versão com o {@code atualizadoEm} mais recente.
 */
@Entity
@Table(name = "configuracoes")
public class Configuracao {

    @Id
    @Column(name = "usuario_id")
    private UUID usuarioId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "formas_pagamento", nullable = false)
    private List<Object> formasPagamento = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cartoes", nullable = false)
    private List<Object> cartoes = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "destino_sobra")
    private Map<String, Object> destinoSobra;

    @Column(name = "ultimo_backup_em")
    private Instant ultimoBackupEm;

    @Column(name = "atualizado_em", nullable = false)
    private Instant atualizadoEm;

    @Column(name = "recebido_em", nullable = false)
    private Instant recebidoEm;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extras", nullable = false)
    private Map<String, Object> extras = new LinkedHashMap<>();

    /** Exigido pelo JPA. */
    protected Configuracao() {
    }

    public Configuracao(UUID usuarioId) {
        this.usuarioId = usuarioId;
    }

    public UUID getUsuarioId() {
        return usuarioId;
    }

    public List<Object> getFormasPagamento() {
        return formasPagamento;
    }

    public void setFormasPagamento(List<Object> formasPagamento) {
        this.formasPagamento = formasPagamento;
    }

    public List<Object> getCartoes() {
        return cartoes;
    }

    public void setCartoes(List<Object> cartoes) {
        this.cartoes = cartoes;
    }

    public Map<String, Object> getDestinoSobra() {
        return destinoSobra;
    }

    public void setDestinoSobra(Map<String, Object> destinoSobra) {
        this.destinoSobra = destinoSobra;
    }

    public Instant getUltimoBackupEm() {
        return ultimoBackupEm;
    }

    public void setUltimoBackupEm(Instant ultimoBackupEm) {
        this.ultimoBackupEm = ultimoBackupEm;
    }

    public Instant getAtualizadoEm() {
        return atualizadoEm;
    }

    public void setAtualizadoEm(Instant atualizadoEm) {
        this.atualizadoEm = atualizadoEm;
    }

    public Instant getRecebidoEm() {
        return recebidoEm;
    }

    public void setRecebidoEm(Instant recebidoEm) {
        this.recebidoEm = recebidoEm;
    }

    public Map<String, Object> getExtras() {
        return extras;
    }

    public void setExtras(Map<String, Object> extras) {
        this.extras = extras;
    }
}
