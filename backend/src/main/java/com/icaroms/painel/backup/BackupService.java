package com.icaroms.painel.backup;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.icaroms.painel.config.PainelProperties;
import com.icaroms.painel.dados.comum.DadosInvalidosException;
import com.icaroms.painel.dados.comum.RegistroNaoEncontradoException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Backups na nuvem: o pacote completo do app (o mesmo do arquivo de backup).
 *
 * <p>O servidor confere só o envelope (formato, versão, dados): quem lê e
 * converte o conteúdo é o app, na hora de restaurar, com as mesmas regras do
 * arquivo de backup. Assim um backup de uma versão nova do app nunca é
 * estragado pelo servidor.
 */
@Service
public class BackupService {

    /** O "formato" do pacote do app (src/persistencia.js). */
    static final String FORMATO = "painel-financeiro";

    /** Listas contadas no resumo, na ordem em que aparecem. */
    static final List<String> LISTAS_DO_RESUMO = List.of("meses", "lancamentos", "categorias", "fixos", "investimentos");

    private final BackupRepository backups;
    private final ObjectMapper json;
    private final PainelProperties propriedades;
    private final Clock relogio;

    public BackupService(BackupRepository backups, ObjectMapper json, PainelProperties propriedades, Clock relogio) {
        this.backups = backups;
        this.json = json;
        this.propriedades = propriedades;
        this.relogio = relogio;
    }

    public long tamanhoMaximoBytes() {
        return propriedades.backups().tamanhoMaximo().toBytes();
    }

    /**
     * Lê o corpo do pedido sem passar do limite: um corpo grande demais é
     * recusado sem ser lido inteiro para a memória.
     */
    public byte[] lerCorpo(InputStream corpo) throws IOException {
        long limite = tamanhoMaximoBytes();
        byte[] bytes = corpo.readNBytes((int) Math.min(Integer.MAX_VALUE - 8L, limite + 1));
        if (bytes.length > limite) {
            throw new BackupGrandeDemaisException(limite);
        }
        return bytes;
    }

    /** Confere o envelope, grava e apaga os backups além do máximo. */
    @Transactional
    public BackupResumo guardar(UUID usuarioId, byte[] corpo) {
        if (corpo.length == 0) {
            throw new DadosInvalidosException("pacote", "O backup está vazio.");
        }
        JsonNode pacote;
        try {
            pacote = json.readTree(corpo);
        } catch (IOException erro) {
            throw new DadosInvalidosException("pacote", "O backup não é um JSON válido.");
        }
        if (pacote == null || !pacote.isObject() || !FORMATO.equals(pacote.path("formato").asText(null))) {
            throw new DadosInvalidosException("pacote", "Este conteúdo não é um backup do Painel Financeiro.");
        }
        JsonNode versao = pacote.path("versao");
        if (!versao.canConvertToInt() || !versao.isIntegralNumber() || versao.asInt() < 1) {
            throw new DadosInvalidosException("pacote", "O backup não informa a versão do formato.");
        }
        JsonNode dados = pacote.path("dados");
        if (!dados.isObject()) {
            throw new DadosInvalidosException("pacote", "O backup não tem dados dentro.");
        }

        UUID id = UUID.randomUUID();
        Instant agora = relogio.instant().truncatedTo(ChronoUnit.MICROS);
        Map<String, Integer> resumo = resumir(dados);
        backups.inserir(id, usuarioId, agora, salvoEm(pacote), versao.asInt(), corpo.length, resumo,
                new String(corpo, StandardCharsets.UTF_8));
        backups.manterOsMaisNovos(usuarioId, propriedades.backups().maximo());
        return new BackupResumo(id, agora, salvoEm(pacote), versao.asInt(), corpo.length, resumo);
    }

    @Transactional(readOnly = true)
    public ListaDeBackups listar(UUID usuarioId) {
        return new ListaDeBackups(backups.listar(usuarioId), propriedades.backups().maximo(), tamanhoMaximoBytes());
    }

    @Transactional(readOnly = true)
    public String pacote(UUID usuarioId, UUID id) {
        return backups.pacote(usuarioId, id).orElseThrow(RegistroNaoEncontradoException::new);
    }

    @Transactional
    public void apagar(UUID usuarioId, UUID id) {
        if (!backups.apagar(usuarioId, id)) {
            throw new RegistroNaoEncontradoException();
        }
    }

    /** Quantos registros de cada lista (sem os excluídos). */
    static Map<String, Integer> resumir(JsonNode dados) {
        Map<String, Integer> resumo = new LinkedHashMap<>();
        for (String lista : LISTAS_DO_RESUMO) {
            int quantos = 0;
            for (JsonNode registro : dados.path(lista)) {
                JsonNode excluido = registro.path("excluidoEm");
                if (excluido.isMissingNode() || excluido.isNull()) {
                    quantos++;
                }
            }
            resumo.put(lista, quantos);
        }
        return resumo;
    }

    private static Instant salvoEm(JsonNode pacote) {
        String texto = pacote.path("salvoEm").asText(null);
        if (texto == null) {
            return null;
        }
        try {
            return Instant.parse(texto);
        } catch (DateTimeParseException erro) {
            return null;
        }
    }
}
