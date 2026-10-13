package com.icaroms.painel.dados.mes;

import com.icaroms.painel.dados.comum.Registro;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * O dinheiro de um mês: saldo com que começa, renda prevista e, por conta
 * fixa, o valor só deste mês (ajustesFixos) e a situação (statusFixos).
 */
@Entity
@Table(name = "meses")
public class Mes extends Registro {

    @Column(nullable = false, length = 7)
    private String mes;

    @Column(name = "saldo_inicial_centavos", nullable = false)
    private long saldoInicialCentavos;

    @Column(name = "renda_prevista_centavos", nullable = false)
    private long rendaPrevistaCentavos;

    @Column(name = "saldo_confirmado", nullable = false)
    private boolean saldoConfirmado;

    /** Por id do fixo: valor em centavos só neste mês. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ajustes_fixos", nullable = false)
    private Map<String, Object> ajustesFixos = new LinkedHashMap<>();

    /** Por id do fixo: "previsto", "pago" ou "dispensado". */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "status_fixos", nullable = false)
    private Map<String, Object> statusFixos = new LinkedHashMap<>();

    protected Mes() {
    }

    public Mes(UUID id, UUID usuarioId) {
        super(id, usuarioId);
    }

    public String getMes() {
        return mes;
    }

    public void setMes(String mes) {
        this.mes = mes;
    }

    public long getSaldoInicialCentavos() {
        return saldoInicialCentavos;
    }

    public void setSaldoInicialCentavos(long saldoInicialCentavos) {
        this.saldoInicialCentavos = saldoInicialCentavos;
    }

    public long getRendaPrevistaCentavos() {
        return rendaPrevistaCentavos;
    }

    public void setRendaPrevistaCentavos(long rendaPrevistaCentavos) {
        this.rendaPrevistaCentavos = rendaPrevistaCentavos;
    }

    public boolean isSaldoConfirmado() {
        return saldoConfirmado;
    }

    public void setSaldoConfirmado(boolean saldoConfirmado) {
        this.saldoConfirmado = saldoConfirmado;
    }

    public Map<String, Object> getAjustesFixos() {
        return ajustesFixos;
    }

    public void setAjustesFixos(Map<String, Object> ajustesFixos) {
        this.ajustesFixos = ajustesFixos;
    }

    public Map<String, Object> getStatusFixos() {
        return statusFixos;
    }

    public void setStatusFixos(Map<String, Object> statusFixos) {
        this.statusFixos = statusFixos;
    }
}
