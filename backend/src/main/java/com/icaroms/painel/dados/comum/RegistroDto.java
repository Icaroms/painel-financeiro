package com.icaroms.painel.dados.comum;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Base do JSON de todo registro: os mesmos nomes de campo do app, para o
 * front enviar e receber os registros exatamente como guarda no IndexedDB.
 *
 * <p>Campos que a classe filha não declara são guardados em {@link #getExtras()}
 * e voltam na resposta no mesmo nível (sem um objeto "extras" no JSON).
 * {@code recebidoEm} só existe na resposta: se o app mandar, é ignorado.
 */
public abstract class RegistroDto {

    /** Nomes que nunca entram nos extras (são do servidor). */
    private static final Set<String> RESERVADOS = Set.of("recebidoEm", "usuarioId");

    private UUID id;

    @NotNull(message = "Informe criadoEm.")
    private Instant criadoEm;

    @NotNull(message = "Informe atualizadoEm.")
    private Instant atualizadoEm;

    private Instant excluidoEm;

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Instant recebidoEm;

    private final Map<String, Object> extras = new LinkedHashMap<>();

    /** Recebe qualquer campo que a classe não conhece. */
    @JsonAnySetter
    public void guardarExtra(String nome, Object valor) {
        if (!RESERVADOS.contains(nome)) {
            extras.put(nome, valor);
        }
    }

    /** Devolve os campos extras no mesmo nível dos outros. */
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

    public Instant getCriadoEm() {
        return criadoEm;
    }

    public void setCriadoEm(Instant criadoEm) {
        this.criadoEm = criadoEm;
    }

    public Instant getAtualizadoEm() {
        return atualizadoEm;
    }

    public void setAtualizadoEm(Instant atualizadoEm) {
        this.atualizadoEm = atualizadoEm;
    }

    public Instant getExcluidoEm() {
        return excluidoEm;
    }

    public void setExcluidoEm(Instant excluidoEm) {
        this.excluidoEm = excluidoEm;
    }

    public Instant getRecebidoEm() {
        return recebidoEm;
    }

    public void setRecebidoEm(Instant recebidoEm) {
        this.recebidoEm = recebidoEm;
    }
}
