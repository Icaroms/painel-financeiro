package com.icaroms.painel.dados.categoria;

import com.icaroms.painel.dados.comum.RegistroDto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** JSON de uma categoria, com os nomes de campo do app (src/modelo.js). */
public class CategoriaDto extends RegistroDto {

    @NotBlank(message = "Informe o nome da categoria.")
    @Size(max = 80, message = "Nome longo demais (máximo 80).")
    private String nome;

    @NotNull(message = "Informe o orçamento.")
    @PositiveOrZero(message = "O orçamento não pode ser negativo.")
    private Long orcamentoCentavos;

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public Long getOrcamentoCentavos() {
        return orcamentoCentavos;
    }

    public void setOrcamentoCentavos(Long orcamentoCentavos) {
        this.orcamentoCentavos = orcamentoCentavos;
    }
}
