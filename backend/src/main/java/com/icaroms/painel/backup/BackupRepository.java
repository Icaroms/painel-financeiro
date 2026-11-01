package com.icaroms.painel.backup;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Acesso à tabela "backups" com SQL direto (JdbcTemplate), e não com JPA:
 * assim a lista lê só as colunas pequenas e o conteúdo (que pode ter
 * megabytes) só é lido quando a pessoa restaura.
 */
@Repository
public class BackupRepository {

    private static final TypeReference<Map<String, Integer>> TIPO_RESUMO = new TypeReference<>() {
    };

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public BackupRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Grava um backup. "pacoteJson" vai como veio do app (convertido para JSONB pelo banco). */
    public void inserir(UUID id, UUID usuarioId, Instant criadoEm, Instant salvoEm, int versao, int tamanhoBytes,
            Map<String, Integer> resumo, String pacoteJson) {
        jdbc.update("""
                INSERT INTO backups (id, usuario_id, criado_em, salvo_em, versao_formato, tamanho_bytes, resumo, pacote)
                VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
                """,
                id, usuarioId, utc(criadoEm), salvoEm == null ? null : utc(salvoEm), versao, tamanhoBytes,
                paraJson(resumo), pacoteJson);
    }

    /** Lista da conta, do mais novo para o mais antigo, sem o conteúdo. */
    public List<BackupResumo> listar(UUID usuarioId) {
        return jdbc.query("""
                SELECT id, criado_em, salvo_em, versao_formato, tamanho_bytes, resumo::text AS resumo
                FROM backups WHERE usuario_id = ?
                ORDER BY criado_em DESC, id DESC
                """, this::lerResumo, usuarioId);
    }

    /** O conteúdo de um backup da conta (o pacote, em JSON). */
    public Optional<String> pacote(UUID usuarioId, UUID id) {
        List<String> encontrados = jdbc.queryForList(
                "SELECT pacote::text FROM backups WHERE id = ? AND usuario_id = ?", String.class, id, usuarioId);
        return encontrados.stream().findFirst();
    }

    /** Apaga um backup da conta. Devolve false se não existia. */
    public boolean apagar(UUID usuarioId, UUID id) {
        return jdbc.update("DELETE FROM backups WHERE id = ? AND usuario_id = ?", id, usuarioId) > 0;
    }

    /** Apaga os mais antigos, deixando só os "manter" mais novos da conta. */
    public int manterOsMaisNovos(UUID usuarioId, int manter) {
        return jdbc.update("""
                DELETE FROM backups
                WHERE usuario_id = ? AND id NOT IN (
                    SELECT id FROM backups WHERE usuario_id = ?
                    ORDER BY criado_em DESC, id DESC LIMIT ?)
                """, usuarioId, usuarioId, manter);
    }

    private BackupResumo lerResumo(ResultSet linha, int numero) throws SQLException {
        OffsetDateTime salvoEm = linha.getObject("salvo_em", OffsetDateTime.class);
        return new BackupResumo(
                linha.getObject("id", UUID.class),
                linha.getObject("criado_em", OffsetDateTime.class).toInstant(),
                salvoEm == null ? null : salvoEm.toInstant(),
                linha.getInt("versao_formato"),
                linha.getInt("tamanho_bytes"),
                deJson(linha.getString("resumo")));
    }

    private static OffsetDateTime utc(Instant momento) {
        return OffsetDateTime.ofInstant(momento, ZoneOffset.UTC);
    }

    private String paraJson(Map<String, Integer> resumo) {
        try {
            return json.writeValueAsString(resumo);
        } catch (JsonProcessingException erro) {
            throw new IllegalStateException("Resumo do backup inválido.", erro);
        }
    }

    private Map<String, Integer> deJson(String texto) {
        try {
            return json.readValue(texto, TIPO_RESUMO);
        } catch (JsonProcessingException erro) {
            throw new IllegalStateException("Resumo do backup ilegível no banco.", erro);
        }
    }
}
