package com.icaroms.painel.dados.fixo;

import com.icaroms.painel.dados.comum.Registro;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * Conta fixa: se repete todo mês (assinatura) ou por um número de meses
 * (parcelamento, com mês final).
 */
@Entity
@Table(name = "fixos")
public class Fixo extends Registro {

    @Column(nullable = false, length = 80)
    private String nome;

    @Column(name = "valor_centavos", nullable = false)
    private long valorCentavos;

    @Column(name = "dia_vencimento", nullable = false)
    private int diaVencimento;

    @Column(name = "forma_pagamento", nullable = false, length = 40)
    private String formaPagamento;

    @Column(name = "mes_inicial", nullable = false, length = 7)
    private String mesInicial;

    @Column(name = "mes_final", length = 7)
    private String mesFinal;

    @Column(name = "pagamento_automatico", nullable = false)
    private boolean pagamentoAutomatico;

    protected Fixo() {
    }

    public Fixo(UUID id, UUID usuarioId) {
        super(id, usuarioId);
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public long getValorCentavos() {
        return valorCentavos;
    }

    public void setValorCentavos(long valorCentavos) {
        this.valorCentavos = valorCentavos;
    }

    public int getDiaVencimento() {
        return diaVencimento;
    }

    public void setDiaVencimento(int diaVencimento) {
        this.diaVencimento = diaVencimento;
    }

    public String getFormaPagamento() {
        return formaPagamento;
    }

    public void setFormaPagamento(String formaPagamento) {
        this.formaPagamento = formaPagamento;
    }

    public String getMesInicial() {
        return mesInicial;
    }

    public void setMesInicial(String mesInicial) {
        this.mesInicial = mesInicial;
    }

    public String getMesFinal() {
        return mesFinal;
    }

    public void setMesFinal(String mesFinal) {
        this.mesFinal = mesFinal;
    }

    public boolean isPagamentoAutomatico() {
        return pagamentoAutomatico;
    }

    public void setPagamentoAutomatico(boolean pagamentoAutomatico) {
        this.pagamentoAutomatico = pagamentoAutomatico;
    }
}
