package com.icaroms.painel.dados.lancamento;

import com.icaroms.painel.dados.comum.Registro;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Um gasto registrado. Compras no cartão podem ser parceladas (1 a 24x).
 * Compras convertidas de conta fixa trazem o objeto "conversao" (src/conversao.js).
 */
@Entity
@Table(name = "lancamentos")
public class Lancamento extends Registro {

    @Column(name = "valor_centavos", nullable = false)
    private long valorCentavos;

    @Column(name = "categoria_id", nullable = false, length = 80)
    private String categoriaId;

    @Column(name = "forma_pagamento", nullable = false, length = 40)
    private String formaPagamento;

    @Column(name = "data", nullable = false)
    private LocalDate data;

    @Column(nullable = false, length = 500)
    private String descricao;

    @Column(nullable = false)
    private int parcelas;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "conversao")
    private Map<String, Object> conversao;

    protected Lancamento() {
    }

    public Lancamento(UUID id, UUID usuarioId) {
        super(id, usuarioId);
    }

    public long getValorCentavos() {
        return valorCentavos;
    }

    public void setValorCentavos(long valorCentavos) {
        this.valorCentavos = valorCentavos;
    }

    public String getCategoriaId() {
        return categoriaId;
    }

    public void setCategoriaId(String categoriaId) {
        this.categoriaId = categoriaId;
    }

    public String getFormaPagamento() {
        return formaPagamento;
    }

    public void setFormaPagamento(String formaPagamento) {
        this.formaPagamento = formaPagamento;
    }

    public LocalDate getData() {
        return data;
    }

    public void setData(LocalDate data) {
        this.data = data;
    }

    public String getDescricao() {
        return descricao;
    }

    public void setDescricao(String descricao) {
        this.descricao = descricao;
    }

    public int getParcelas() {
        return parcelas;
    }

    public void setParcelas(int parcelas) {
        this.parcelas = parcelas;
    }

    public Map<String, Object> getConversao() {
        return conversao;
    }

    public void setConversao(Map<String, Object> conversao) {
        this.conversao = conversao;
    }
}
