package com.icaroms.painel.dados.fixo;

import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.RegistroDto;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** JSON de uma conta fixa, com os nomes de campo do app (src/modelo.js). */
public class FixoDto extends RegistroDto {

    @NotBlank(message = "Informe o nome do fixo.")
    @Size(max = 80, message = "Nome longo demais (máximo 80).")
    private String nome;

    @NotNull(message = "Informe o valor.")
    @PositiveOrZero(message = "O valor não pode ser negativo.")
    private Long valorCentavos;

    @NotNull(message = "Informe o dia de vencimento.")
    @Min(value = 1, message = "O dia de vencimento deve ser de 1 a 31.")
    @Max(value = 31, message = "O dia de vencimento deve ser de 1 a 31.")
    private Integer diaVencimento;

    @NotBlank(message = "Informe a forma de pagamento.")
    @Size(max = 40, message = "Forma de pagamento longa demais (máximo 40).")
    private String formaPagamento;

    @NotNull(message = "Informe o mês inicial.")
    @Pattern(regexp = Formatos.MES, message = "Use o formato AAAA-MM.")
    private String mesInicial;

    @Pattern(regexp = Formatos.MES, message = "Use o formato AAAA-MM.")
    private String mesFinal;

    @NotNull(message = "Informe se o pagamento é automático.")
    private Boolean pagamentoAutomatico;

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public Long getValorCentavos() {
        return valorCentavos;
    }

    public void setValorCentavos(Long valorCentavos) {
        this.valorCentavos = valorCentavos;
    }

    public Integer getDiaVencimento() {
        return diaVencimento;
    }

    public void setDiaVencimento(Integer diaVencimento) {
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

    public Boolean getPagamentoAutomatico() {
        return pagamentoAutomatico;
    }

    public void setPagamentoAutomatico(Boolean pagamentoAutomatico) {
        this.pagamentoAutomatico = pagamentoAutomatico;
    }
}
