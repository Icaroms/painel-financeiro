package com.icaroms.painel.dados.investimento;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.icaroms.painel.dados.comum.RegistroDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * JSON de um investimento, com os nomes de campo do app.
 *
 * <p>Cada tipo usa só os seus campos; os do outro grupo não aparecem na
 * resposta (ex.: uma ação não tem "valorAplicadoCentavos"). O app já trata
 * campo ausente como vazio.
 */
public class InvestimentoDto extends RegistroDto {

    @NotBlank(message = "Escolha o tipo do investimento.")
    private String tipo;

    @NotBlank(message = "Dê um nome ao investimento.")
    @Size(max = 40, message = "O nome pode ter no máximo 40 letras.")
    private String nome;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private LocalDate dataAplicacao;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Long valorAplicadoCentavos;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Long valorAtualCentavos;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private LocalDate valorAtualEm;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Boolean reserva;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Map<String, Object> taxa;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Long cotacaoCentavos;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private LocalDate cotacaoEm;

    @Valid
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private List<OperacaoDto> operacoes;

    public String getTipo() {
        return tipo;
    }

    public void setTipo(String tipo) {
        this.tipo = tipo;
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public LocalDate getDataAplicacao() {
        return dataAplicacao;
    }

    public void setDataAplicacao(LocalDate dataAplicacao) {
        this.dataAplicacao = dataAplicacao;
    }

    public Long getValorAplicadoCentavos() {
        return valorAplicadoCentavos;
    }

    public void setValorAplicadoCentavos(Long valorAplicadoCentavos) {
        this.valorAplicadoCentavos = valorAplicadoCentavos;
    }

    public Long getValorAtualCentavos() {
        return valorAtualCentavos;
    }

    public void setValorAtualCentavos(Long valorAtualCentavos) {
        this.valorAtualCentavos = valorAtualCentavos;
    }

    public LocalDate getValorAtualEm() {
        return valorAtualEm;
    }

    public void setValorAtualEm(LocalDate valorAtualEm) {
        this.valorAtualEm = valorAtualEm;
    }

    public Boolean getReserva() {
        return reserva;
    }

    public void setReserva(Boolean reserva) {
        this.reserva = reserva;
    }

    public Map<String, Object> getTaxa() {
        return taxa;
    }

    public void setTaxa(Map<String, Object> taxa) {
        this.taxa = taxa;
    }

    public Long getCotacaoCentavos() {
        return cotacaoCentavos;
    }

    public void setCotacaoCentavos(Long cotacaoCentavos) {
        this.cotacaoCentavos = cotacaoCentavos;
    }

    public LocalDate getCotacaoEm() {
        return cotacaoEm;
    }

    public void setCotacaoEm(LocalDate cotacaoEm) {
        this.cotacaoEm = cotacaoEm;
    }

    public List<OperacaoDto> getOperacoes() {
        return operacoes;
    }

    public void setOperacoes(List<OperacaoDto> operacoes) {
        this.operacoes = operacoes;
    }
}
