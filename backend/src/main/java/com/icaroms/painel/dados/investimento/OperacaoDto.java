package com.icaroms.painel.dados.investimento;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** JSON de uma operação, com os nomes de campo do app (src/acoes.js). */
public class OperacaoDto {

    /** Mesmo limite do app (QUANTIDADE_MAXIMA). */
    static final long QUANTIDADE_MAXIMA = 10_000_000L;

    @NotNull(message = "Informe o id da operação.")
    private UUID id;

    @NotNull(message = "Escolha se é compra ou venda.")
    @Pattern(regexp = "compra|venda", message = "Escolha se é compra ou venda.")
    private String tipo;

    @NotNull(message = "Informe a data da operação.")
    private LocalDate data;

    @NotNull(message = "Informe a quantidade.")
    @Positive(message = "A quantidade deve ser maior que zero.")
    @Max(value = QUANTIDADE_MAXIMA, message = "Quantidade grande demais.")
    private Long quantidade;

    @NotNull(message = "Informe o preço.")
    @Positive(message = "O preço deve ser maior que zero.")
    private Long precoCentavos;

    @PositiveOrZero(message = "Os custos devem ser zero ou mais.")
    private Long custosCentavos;

    private final Map<String, Object> extras = new LinkedHashMap<>();

    @JsonAnySetter
    public void guardarExtra(String nome, Object valor) {
        extras.put(nome, valor);
    }

    @JsonAnyGetter
    public Map<String, Object> getExtras() {
        return extras;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getTipo() {
        return tipo;
    }

    public void setTipo(String tipo) {
        this.tipo = tipo;
    }

    public LocalDate getData() {
        return data;
    }

    public void setData(LocalDate data) {
        this.data = data;
    }

    public Long getQuantidade() {
        return quantidade;
    }

    public void setQuantidade(Long quantidade) {
        this.quantidade = quantidade;
    }

    public Long getPrecoCentavos() {
        return precoCentavos;
    }

    public void setPrecoCentavos(Long precoCentavos) {
        this.precoCentavos = precoCentavos;
    }

    public Long getCustosCentavos() {
        return custosCentavos;
    }

    public void setCustosCentavos(Long custosCentavos) {
        this.custosCentavos = custosCentavos;
    }
}
