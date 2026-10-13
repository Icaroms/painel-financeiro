package com.icaroms.painel.auth;

import com.icaroms.painel.config.PainelProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tokens de renovação: abrir, renovar (com rotação) e encerrar sessões.
 *
 * <p>O token é um texto aleatório de 256 bits. O banco guarda só o SHA-256
 * dele: quem lesse o banco não conseguiria usar as sessões.
 */
@Service
public class SessaoService {

    private static final SecureRandom ALEATORIO = new SecureRandom();

    private final SessaoRepository sessoes;
    private final PainelProperties propriedades;
    private final Clock relogio;

    public SessaoService(SessaoRepository sessoes, PainelProperties propriedades, Clock relogio) {
        this.sessoes = sessoes;
        this.propriedades = propriedades;
        this.relogio = relogio;
    }

    /**
     * Token de renovação entregue ao app.
     *
     * @param valor    o token (só existe na resposta; o banco guarda o hash)
     * @param expiraEm quando deixa de valer
     */
    public record TokenDeRenovacao(String valor, Instant expiraEm) {

        @Override
        public String toString() {
            return "TokenDeRenovacao[valor=***, expiraEm=" + expiraEm + "]";
        }
    }

    /**
     * Resultado de uma renovação.
     *
     * @param usuarioId conta dona da sessão
     * @param novo      o token de renovação que substitui o usado
     */
    public record Renovacao(UUID usuarioId, TokenDeRenovacao novo) {
    }

    /** Abre uma sessão nova para a conta (no login). */
    @Transactional
    public TokenDeRenovacao abrir(UUID usuarioId) {
        Instant agora = relogio.instant();
        String valor = gerarToken();
        Instant expiraEm = agora.plus(propriedades.jwt().renovacao());
        sessoes.save(new Sessao(UUID.randomUUID(), usuarioId, hash(valor), agora, expiraEm));
        return new TokenDeRenovacao(valor, expiraEm);
    }

    /**
     * Troca um token de renovação por um novo. Se o token já tinha sido
     * renovado antes, todas as sessões da conta são encerradas (alguém copiou
     * o token) e a renovação é recusada.
     */
    @Transactional(noRollbackFor = SessaoInvalidaException.class)
    public Renovacao renovar(String valor) {
        Instant agora = relogio.instant();
        Sessao sessao = sessoes.findByHashToken(hash(valor)).orElseThrow(SessaoInvalidaException::new);

        if (Sessao.RENOVADA.equals(sessao.getMotivoRevogacao())) {
            sessoes.encerrarTodas(sessao.getUsuarioId(), agora, Sessao.REUSO);
            throw new SessaoInvalidaException();
        }
        if (!sessao.ativa(agora)) {
            throw new SessaoInvalidaException();
        }

        sessao.encerrar(agora, Sessao.RENOVADA);
        sessoes.save(sessao);
        return new Renovacao(sessao.getUsuarioId(), abrir(sessao.getUsuarioId()));
    }

    /** "Sair": encerra a sessão. Um token desconhecido não dá erro (já está fora). */
    @Transactional
    public void encerrar(String valor) {
        sessoes.findByHashToken(hash(valor)).ifPresent(sessao -> {
            sessao.encerrar(relogio.instant(), Sessao.SAIDA);
            sessoes.save(sessao);
        });
    }

    private static String gerarToken() {
        byte[] bytes = new byte[32];
        ALEATORIO.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String valor) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha.digest(valor.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException erro) {
            throw new IllegalStateException("SHA-256 indisponível nesta JVM.", erro);
        }
    }
}
