package com.icaroms.painel.dados.lancamento;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.icaroms.painel.dados.comum.RegistroDto;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Map;

/**
 * JSON de um lançamento, com os nomes de campo do app (src/modelo.js).
 * Lançamentos antigos sem "parcelas" valem 1; sem "descricao", texto vazio.
 */
public class LancamentoDto extends RegistroDto {

    @NotNull(message = "Informe o valor do gasto.")
    @Positive(message = "O valor do gasto deve ser maior que zero.")
    private Long valorCentavos;

    @NotBlank(message = "Informe a categoria.")
    @Size(max = 80, message = "Categoria longa demais (máximo 80).")
    private String categoriaId;

    @NotBlank(message = "Informe a forma de pagamento.")
    @Size(max = 40, message = "Forma de pagamento longa demais (máximo 40).")
    private String formaPagamento;

    @NotNull(message = "Informe a data (AAAA-MM-DD).")
    private LocalDate data;

    @Size(max = 500, message = "Descrição longa demais (máximo 500).")
    private String descricao;

    @Min(value = 1, message = "As parcelas devem ser de 1 a 24.")
    @Max(value = 24, message = "As parcelas devem ser de 1 a 24.")
    private Integer parcelas;

    /** Só nas compras convertidas de conta fixa; nas outras, o campo não aparece. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Map<String, Object> conversao;

    public Long getValorCentavos() {
        return valorCentavos;
    }

    public void setValorCentavos(Long valorCentavos) {
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

    public Integer getParcelas() {
        return parcelas;
    }

    public void setParcelas(Integer parcelas) {
        this.parcelas = parcelas;
    }

    public Map<String, Object> getConversao() {
        return conversao;
    }

    public void setConversao(Map<String, Object> conversao) {
        this.conversao = conversao;
    }
}
