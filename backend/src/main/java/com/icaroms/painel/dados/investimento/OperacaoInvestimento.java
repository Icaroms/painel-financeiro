package com.icaroms.painel.dados.investimento;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Uma compra ou venda de ação ou FII (tabela "operacoes"). */
@Embeddable
public class OperacaoInvestimento {

    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tipo", nullable = false, length = 10)
    private String tipo;

    @Column(name = "data", nullable = false)
    private LocalDate data;

    @Column(name = "quantidade", nullable = false)
    private long quantidade;

    @Column(name = "preco_centavos", nullable = false)
    private long precoCentavos;

    @Column(name = "custos_centavos", nullable = false)
    private long custosCentavos;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extras", nullable = false)
    private Map<String, Object> extras = new LinkedHashMap<>();

    /** Exigido pelo JPA. */
    protected OperacaoInvestimento() {
    }

    public OperacaoInvestimento(UUID id, String tipo, LocalDate data, long quantidade, long precoCentavos,
            long custosCentavos, Map<String, Object> extras) {
        this.id = id;
        this.tipo = tipo;
        this.data = data;
        this.quantidade = quantidade;
        this.precoCentavos = precoCentavos;
        this.custosCentavos = custosCentavos;
        this.extras = new LinkedHashMap<>(extras);
    }

    public UUID getId() {
        return id;
    }

    public String getTipo() {
        return tipo;
    }

    public LocalDate getData() {
        return data;
    }

    public long getQuantidade() {
        return quantidade;
    }

    public long getPrecoCentavos() {
        return precoCentavos;
    }

    public long getCustosCentavos() {
        return custosCentavos;
    }

    public Map<String, Object> getExtras() {
        return extras;
    }
}
