package com.icaroms.painel.dados.mes;

import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.RegistroDto;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * JSON de um mês, com os nomes de campo do app (src/modelo.js).
 * Campos mais novos do app, como "statusFaturas", seguem como extras.
 */
public class MesDto extends RegistroDto {

    @NotNull(message = "Informe o mês.")
    @Pattern(regexp = Formatos.MES, message = "Use o formato AAAA-MM.")
    private String mes;

    @NotNull(message = "Informe o saldo inicial.")
    private Long saldoInicialCentavos;

    @NotNull(message = "Informe a renda prevista.")
    @PositiveOrZero(message = "A renda prevista não pode ser negativa.")
    private Long rendaPrevistaCentavos;

    @NotNull(message = "Informe se o saldo foi confirmado.")
    private Boolean saldoConfirmado;

    private Map<String, Long> ajustesFixos = new LinkedHashMap<>();

    private Map<String, String> statusFixos = new LinkedHashMap<>();

    public String getMes() {
        return mes;
    }

    public void setMes(String mes) {
        this.mes = mes;
    }

    public Long getSaldoInicialCentavos() {
        return saldoInicialCentavos;
    }

    public void setSaldoInicialCentavos(Long saldoInicialCentavos) {
        this.saldoInicialCentavos = saldoInicialCentavos;
    }

    public Long getRendaPrevistaCentavos() {
        return rendaPrevistaCentavos;
    }

    public void setRendaPrevistaCentavos(Long rendaPrevistaCentavos) {
        this.rendaPrevistaCentavos = rendaPrevistaCentavos;
    }

    public Boolean getSaldoConfirmado() {
        return saldoConfirmado;
    }

    public void setSaldoConfirmado(Boolean saldoConfirmado) {
        this.saldoConfirmado = saldoConfirmado;
    }

    public Map<String, Long> getAjustesFixos() {
        return ajustesFixos;
    }

    public void setAjustesFixos(Map<String, Long> ajustesFixos) {
        this.ajustesFixos = ajustesFixos == null ? new LinkedHashMap<>() : ajustesFixos;
    }

    public Map<String, String> getStatusFixos() {
        return statusFixos;
    }

    public void setStatusFixos(Map<String, String> statusFixos) {
        this.statusFixos = statusFixos == null ? new LinkedHashMap<>() : statusFixos;
    }
}
