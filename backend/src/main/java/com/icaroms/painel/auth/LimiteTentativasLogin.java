package com.icaroms.painel.auth;

import com.icaroms.painel.config.PainelProperties;
import com.icaroms.painel.erro.TentativasExcedidasException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Limite de tentativas erradas de login (proteção contra adivinhação de senha).
 *
 * <p>Conta as falhas por chave (o IP e o e-mail, separadamente) dentro de uma
 * janela deslizante. Ao atingir o máximo, qualquer tentativa com aquela chave,
 * mesmo com a senha certa, recebe 429 até a falha mais antiga sair da janela.
 * Um login certo zera as chaves usadas.
 *
 * <p>Fica na memória do servidor: reiniciar a API zera a contagem. Para um app
 * de uma pessoa só, isso basta.
 */
@Component
public class LimiteTentativasLogin {

    /** Limite de chaves guardadas, para a memória não crescer sem fim. */
    private static final int MAXIMO_DE_CHAVES = 10_000;

    private final Map<String, Deque<Instant>> falhas = new HashMap<>();
    private final int maxTentativas;
    private final Duration janela;
    private final Clock relogio;

    public LimiteTentativasLogin(PainelProperties propriedades, Clock relogio) {
        this.maxTentativas = propriedades.login().maxTentativas();
        this.janela = propriedades.login().janela();
        this.relogio = relogio;
    }

    /**
     * Lança {@link TentativasExcedidasException} se alguma das chaves já
     * atingiu o limite.
     */
    public synchronized void verificar(String... chaves) {
        Instant agora = relogio.instant();
        for (String chave : chaves) {
            Deque<Instant> lista = limparAntigas(chave, agora);
            if (lista != null && lista.size() >= maxTentativas) {
                Instant libera = lista.peekFirst().plus(janela);
                throw new TentativasExcedidasException(Duration.between(agora, libera));
            }
        }
    }

    /** Registra uma tentativa errada em cada chave. */
    public synchronized void registrarFalha(String... chaves) {
        Instant agora = relogio.instant();
        if (falhas.size() >= MAXIMO_DE_CHAVES) {
            removerChavesVencidas(agora);
        }
        for (String chave : chaves) {
            falhas.computeIfAbsent(chave, c -> new ArrayDeque<>()).addLast(agora);
        }
    }

    /** Login certo: esquece as falhas destas chaves. */
    public synchronized void limpar(String... chaves) {
        for (String chave : chaves) {
            falhas.remove(chave);
        }
    }

    /** Zera tudo (usado nos testes, que compartilham a mesma API). */
    public synchronized void limparTudo() {
        falhas.clear();
    }

    private Deque<Instant> limparAntigas(String chave, Instant agora) {
        Deque<Instant> lista = falhas.get(chave);
        if (lista == null) {
            return null;
        }
        Instant limite = agora.minus(janela);
        while (!lista.isEmpty() && !lista.peekFirst().isAfter(limite)) {
            lista.pollFirst();
        }
        if (lista.isEmpty()) {
            falhas.remove(chave);
            return null;
        }
        return lista;
    }

    private void removerChavesVencidas(Instant agora) {
        for (String chave : falhas.keySet().toArray(String[]::new)) {
            limparAntigas(chave, agora);
        }
    }
}
