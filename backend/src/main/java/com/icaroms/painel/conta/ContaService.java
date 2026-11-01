package com.icaroms.painel.conta;

import com.icaroms.painel.dados.comum.RegistroNaoEncontradoException;
import com.icaroms.painel.usuario.Usuario;
import com.icaroms.painel.usuario.UsuarioRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Apagar os dados da conta ("Apagar tudo e começar do zero" e "Restaurar
 * backup", com a conta conectada).
 *
 * <p>Apaga de verdade (não é exclusão suave) todos os registros e a
 * configuração da conta e marca a hora em usuarios.dados_zerados_em. A conta,
 * as sessões e os backups na nuvem continuam.
 *
 * <p>Os outros aparelhos ficam sabendo na próxima sincronização: o servidor
 * responde "zerados" e o app pergunta se usa os dados da conta ou envia os dele.
 */
@Service
public class ContaService {

    /** Tabelas com os dados do app (as operações saem junto com os investimentos). */
    static final List<String> TABELAS_DE_DADOS =
            List.of("lancamentos", "fixos", "categorias", "meses", "investimentos", "configuracoes");

    private final JdbcTemplate jdbc;
    private final UsuarioRepository usuarios;
    private final Clock relogio;

    public ContaService(JdbcTemplate jdbc, UsuarioRepository usuarios, Clock relogio) {
        this.jdbc = jdbc;
        this.usuarios = usuarios;
        this.relogio = relogio;
    }

    @Transactional
    public DadosZeradosResponse zerarDados(UUID usuarioId) {
        Usuario usuario = usuarios.findById(usuarioId).orElseThrow(RegistroNaoEncontradoException::new);
        for (String tabela : TABELAS_DE_DADOS) {
            // Nome da tabela vem da lista fixa acima, nunca do pedido.
            jdbc.update("DELETE FROM " + tabela + " WHERE usuario_id = ?", usuarioId);
        }
        Instant agora = relogio.instant().truncatedTo(ChronoUnit.MICROS);
        usuario.marcarDadosZerados(agora);
        usuarios.save(usuario);
        return new DadosZeradosResponse(agora);
    }
}
