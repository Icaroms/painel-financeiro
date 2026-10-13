package com.icaroms.painel.dados.investimento;

import com.icaroms.painel.dados.comum.Registro;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Um investimento da carteira (src/carteira.js e src/acoes.js).
 *
 * <ul>
 *   <li>Renda fixa, fundos e imóveis: valor aplicado e valor atual digitados,
 *       reserva de emergência e taxa contratada (opcional).</li>
 *   <li>Ações e FIIs: lista de operações (compras e vendas) e cotação digitada.</li>
 * </ul>
 */
@Entity
@Table(name = "investimentos")
public class Investimento extends Registro {

    @Column(nullable = false, length = 20)
    private String tipo;

    @Column(nullable = false, length = 40)
    private String nome;

    @Column(name = "data_aplicacao")
    private LocalDate dataAplicacao;

    @Column(name = "valor_aplicado_centavos")
    private Long valorAplicadoCentavos;

    @Column(name = "valor_atual_centavos")
    private Long valorAtualCentavos;

    @Column(name = "valor_atual_em")
    private LocalDate valorAtualEm;

    @Column(nullable = false)
    private boolean reserva;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "taxa")
    private Map<String, Object> taxa;

    @Column(name = "cotacao_centavos")
    private Long cotacaoCentavos;

    @Column(name = "cotacao_em")
    private LocalDate cotacaoEm;

    /** Compras e vendas, na ordem do app. A lista inteira é trocada a cada gravação. */
    @ElementCollection
    @CollectionTable(name = "operacoes", joinColumns = @JoinColumn(name = "investimento_id"))
    @OrderColumn(name = "posicao")
    private List<OperacaoInvestimento> operacoes = new ArrayList<>();

    protected Investimento() {
    }

    public Investimento(UUID id, UUID usuarioId) {
        super(id, usuarioId);
    }

    /** Troca as operações pelas novas (as antigas são apagadas da tabela). */
    public void trocarOperacoes(List<OperacaoInvestimento> novas) {
        operacoes.clear();
        operacoes.addAll(novas);
    }

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

    public boolean isReserva() {
        return reserva;
    }

    public void setReserva(boolean reserva) {
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

    public List<OperacaoInvestimento> getOperacoes() {
        return operacoes;
    }
}
