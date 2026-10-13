package com.icaroms.painel.dados.categoria;

import com.icaroms.painel.dados.comum.Registro;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

/** Categoria de gasto com orçamento mensal (ex.: "iFood", R$ 300,00). */
@Entity
@Table(name = "categorias")
public class Categoria extends Registro {

    @Column(nullable = false, length = 80)
    private String nome;

    @Column(name = "orcamento_centavos", nullable = false)
    private long orcamentoCentavos;

    protected Categoria() {
    }

    public Categoria(UUID id, UUID usuarioId) {
        super(id, usuarioId);
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public long getOrcamentoCentavos() {
        return orcamentoCentavos;
    }

    public void setOrcamentoCentavos(long orcamentoCentavos) {
        this.orcamentoCentavos = orcamentoCentavos;
    }
}
