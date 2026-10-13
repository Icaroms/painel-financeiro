package com.icaroms.painel.dados.configuracao;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * JSON da configuração, com os nomes de campo do app:
 * formasPagamento, cartoes, destinoSobra e ultimoBackupEm.
 * Campos desconhecidos seguem como extras.
 */
public class ConfiguracaoDto {

    private static final Set<String> RESERVADOS = Set.of("recebidoEm", "usuarioId");

    @NotEmpty(message = "Mantenha pelo menos uma forma de pagamento.")
    private List<@NotBlank(message = "Forma de pagamento sem nome.")
            @Size(max = 40, message = "Forma de pagamento longa demais (máximo 40).") String> formasPagamento;

    private List<Map<String, Object>> cartoes = new ArrayList<>();

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Map<String, Object> destinoSobra;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Instant ultimoBackupEm;

    @NotNull(message = "Informe atualizadoEm.")
    private Instant atualizadoEm;

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Instant recebidoEm;

    private final Map<String, Object> extras = new LinkedHashMap<>();

    @JsonAnySetter
    public void guardarExtra(String nome, Object valor) {
        if (!RESERVADOS.contains(nome)) {
            extras.put(nome, valor);
        }
    }

    @JsonAnyGetter
    public Map<String, Object> getExtras() {
        return extras;
    }

    public List<String> getFormasPagamento() {
        return formasPagamento;
    }

    public void setFormasPagamento(List<String> formasPagamento) {
        this.formasPagamento = formasPagamento;
    }

    public List<Map<String, Object>> getCartoes() {
        return cartoes;
    }

    public void setCartoes(List<Map<String, Object>> cartoes) {
        this.cartoes = cartoes == null ? new ArrayList<>() : cartoes;
    }

    public Map<String, Object> getDestinoSobra() {
        return destinoSobra;
    }

    public void setDestinoSobra(Map<String, Object> destinoSobra) {
        this.destinoSobra = destinoSobra;
    }

    public Instant getUltimoBackupEm() {
        return ultimoBackupEm;
    }

    public void setUltimoBackupEm(Instant ultimoBackupEm) {
        this.ultimoBackupEm = ultimoBackupEm;
    }

    public Instant getAtualizadoEm() {
        return atualizadoEm;
    }

    public void setAtualizadoEm(Instant atualizadoEm) {
        this.atualizadoEm = atualizadoEm;
    }

    public Instant getRecebidoEm() {
        return recebidoEm;
    }

    public void setRecebidoEm(Instant recebidoEm) {
        this.recebidoEm = recebidoEm;
    }
}
