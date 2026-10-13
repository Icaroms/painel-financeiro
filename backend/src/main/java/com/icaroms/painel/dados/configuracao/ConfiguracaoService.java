package com.icaroms.painel.dados.configuracao;

import com.icaroms.painel.dados.comum.ConflitoDeVersaoException;
import com.icaroms.painel.dados.comum.Erros;
import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.Gravacao;
import com.icaroms.painel.dados.comum.RegistroNaoEncontradoException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configuração do app: um documento por conta, com as regras do app
 * (src/configuracao.js, src/cartoes.js e src/destino.js).
 */
@Service
public class ConfiguracaoService {

    private final ConfiguracaoRepository configuracoes;
    private final Clock relogio;

    public ConfiguracaoService(ConfiguracaoRepository configuracoes, Clock relogio) {
        this.configuracoes = configuracoes;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public ConfiguracaoDto buscar(UUID usuarioId) {
        return configuracoes.findById(usuarioId).map(ConfiguracaoService::paraDto)
                .orElseThrow(RegistroNaoEncontradoException::new);
    }

    @Transactional
    public Gravacao<ConfiguracaoDto> gravar(UUID usuarioId, ConfiguracaoDto dto) {
        validar(dto);

        Optional<Configuracao> existente = configuracoes.findById(usuarioId);
        if (existente.isPresent() && dto.getAtualizadoEm().isBefore(existente.get().getAtualizadoEm())) {
            throw new ConflitoDeVersaoException(paraDto(existente.get()));
        }

        Configuracao configuracao = existente.orElseGet(() -> new Configuracao(usuarioId));
        configuracao.setFormasPagamento(new ArrayList<>(dto.getFormasPagamento().stream().map(String::trim).toList()));
        configuracao.setCartoes(new ArrayList<>(dto.getCartoes()));
        configuracao.setDestinoSobra(dto.getDestinoSobra() == null ? null : Formatos.copiar(dto.getDestinoSobra()));
        configuracao.setUltimoBackupEm(dto.getUltimoBackupEm());
        configuracao.setAtualizadoEm(dto.getAtualizadoEm());
        configuracao.setRecebidoEm(relogio.instant().truncatedTo(ChronoUnit.MICROS));
        configuracao.setExtras(Formatos.copiar(dto.getExtras()));

        Configuracao salva = configuracoes.saveAndFlush(configuracao);
        return new Gravacao<>(paraDto(salva), existente.isEmpty());
    }

    /** Regras do app que as anotações não cobrem. */
    private static void validar(ConfiguracaoDto dto) {
        Erros erros = new Erros();
        List<String> formas = dto.getFormasPagamento() == null ? List.of() : dto.getFormasPagamento();

        Set<String> nomes = new HashSet<>();
        boolean repetida = formas.stream()
                .filter(forma -> forma != null)
                .anyMatch(forma -> !nomes.add(forma.trim().toLowerCase(Locale.ROOT)));
        erros.se(repetida, "formasPagamento", "Há formas de pagamento repetidas.");

        Set<String> formasComCartao = new HashSet<>();
        for (Map<String, Object> cartao : dto.getCartoes()) {
            Object forma = cartao == null ? null : cartao.get("formaPagamento");
            if (forma == null || !formas.contains(forma.toString())) {
                erros.se(true, "cartoes", "Todo cartão precisa de uma forma de pagamento da lista.");
                continue;
            }
            erros.se(!formasComCartao.add(forma.toString()), "cartoes", "Há dois cartões para \"" + forma + "\".");
            erros.se(!inteiroEntre(cartao.get("limiteCentavos"), 1, Long.MAX_VALUE),
                    "cartoes", "O limite de \"" + forma + "\" deve ser maior que zero.");
            Object fechamento = cartao.get("diaFechamento");
            Object vencimento = cartao.get("diaVencimento");
            erros.se(!inteiroEntre(fechamento, 1, 31) || !inteiroEntre(vencimento, 1, 31),
                    "cartoes", "Os dias de fechamento e vencimento de \"" + forma + "\" devem ser de 1 a 31.");
            erros.se(fechamento != null && fechamento.equals(vencimento),
                    "cartoes", "O vencimento de \"" + forma + "\" não pode ser no dia do fechamento.");
        }

        validarDestino(dto.getDestinoSobra(), erros);
        erros.lancarSeHouver();
    }

    /** Destino da sobra: porcentagens inteiras que somam 100 e meta de 1 a 24 meses. */
    private static void validarDestino(Map<String, Object> destino, Erros erros) {
        if (destino == null) {
            return;
        }
        if (destino.get("porcentagens") instanceof Map<?, ?> porcentagens) {
            Object reserva = porcentagens.get("reserva");
            Object investir = porcentagens.get("investir");
            Object alivio = porcentagens.get("alivio");
            boolean validas = inteiroEntre(reserva, 0, 100) && inteiroEntre(investir, 0, 100) && inteiroEntre(alivio, 0, 100);
            erros.se(!validas, "destinoSobra", "As porcentagens devem ser números inteiros de 0 a 100.");
            erros.se(validas && ((Number) reserva).longValue() + ((Number) investir).longValue()
                            + ((Number) alivio).longValue() != 100,
                    "destinoSobra", "As porcentagens precisam somar 100%.");
        }
        Object meta = destino.get("metaMeses");
        erros.se(meta != null && !inteiroEntre(meta, 1, 24), "destinoSobra", "A meta da reserva deve ser de 1 a 24 meses.");
    }

    /** O valor é um número inteiro dentro da faixa? */
    private static boolean inteiroEntre(Object valor, long minimo, long maximo) {
        if (!(valor instanceof Number numero)) {
            return false;
        }
        double real = numero.doubleValue();
        return real == Math.rint(real) && numero.longValue() >= minimo && numero.longValue() <= maximo;
    }

    @SuppressWarnings("unchecked")
    private static ConfiguracaoDto paraDto(Configuracao configuracao) {
        ConfiguracaoDto dto = new ConfiguracaoDto();
        dto.setFormasPagamento(configuracao.getFormasPagamento().stream().map(String::valueOf).toList());
        List<Map<String, Object>> cartoes = new ArrayList<>();
        for (Object cartao : configuracao.getCartoes()) {
            if (cartao instanceof Map<?, ?> mapa) {
                cartoes.add((Map<String, Object>) mapa);
            }
        }
        dto.setCartoes(cartoes);
        dto.setDestinoSobra(configuracao.getDestinoSobra());
        dto.setUltimoBackupEm(configuracao.getUltimoBackupEm());
        dto.setAtualizadoEm(configuracao.getAtualizadoEm());
        dto.setRecebidoEm(configuracao.getRecebidoEm());
        if (configuracao.getExtras() != null) {
            configuracao.getExtras().forEach(dto::guardarExtra);
        }
        return dto;
    }
}
