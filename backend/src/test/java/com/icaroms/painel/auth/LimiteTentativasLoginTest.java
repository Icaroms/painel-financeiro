package com.icaroms.painel.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.icaroms.painel.config.PainelProperties;
import com.icaroms.painel.erro.TentativasExcedidasException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Regras do limite de tentativas, com relógio controlado (sem esperar de verdade). */
class LimiteTentativasLoginTest {

    private RelogioAjustavel relogio;
    private LimiteTentativasLogin limite;

    @BeforeEach
    void preparar() {
        relogio = new RelogioAjustavel(Instant.parse("2026-10-13T12:00:00Z"));
        PainelProperties propriedades = new PainelProperties(
                new PainelProperties.Jwt("x".repeat(32), Duration.ofHours(1), "teste"),
                new PainelProperties.Cors(List.of("http://localhost:8080")),
                new PainelProperties.Login(3, Duration.ofMinutes(10)),
                null);
        limite = new LimiteTentativasLogin(propriedades, relogio);
    }

    @Test
    void abaixoDoLimitePassa() {
        limite.registrarFalha("ip:1");
        limite.registrarFalha("ip:1");

        assertThatCode(() -> limite.verificar("ip:1")).doesNotThrowAnyException();
    }

    @Test
    void noLimiteBloqueiaEDizQuantoFalta() {
        limite.registrarFalha("ip:1");
        relogio.avancar(Duration.ofMinutes(2));
        limite.registrarFalha("ip:1");
        limite.registrarFalha("ip:1");

        assertThatThrownBy(() -> limite.verificar("ip:1"))
                .isInstanceOfSatisfying(TentativasExcedidasException.class,
                        erro -> assertThat(erro.getEsperar()).isEqualTo(Duration.ofMinutes(8)));
    }

    @Test
    void falhasAntigasSaemDaJanela() {
        limite.registrarFalha("ip:1");
        limite.registrarFalha("ip:1");
        limite.registrarFalha("ip:1");
        relogio.avancar(Duration.ofMinutes(10));

        assertThatCode(() -> limite.verificar("ip:1")).doesNotThrowAnyException();
    }

    @Test
    void qualquerChaveNoLimiteBloqueia() {
        limite.registrarFalha("email:a@b.c");
        limite.registrarFalha("email:a@b.c");
        limite.registrarFalha("email:a@b.c");

        assertThatThrownBy(() -> limite.verificar("ip:outro", "email:a@b.c"))
                .isInstanceOf(TentativasExcedidasException.class);
        assertThatCode(() -> limite.verificar("ip:outro")).doesNotThrowAnyException();
    }

    @Test
    void limparEsqueceAsFalhas() {
        limite.registrarFalha("ip:1");
        limite.registrarFalha("ip:1");
        limite.registrarFalha("ip:1");
        limite.limpar("ip:1");

        assertThatCode(() -> limite.verificar("ip:1")).doesNotThrowAnyException();
    }

    /** Relógio que só anda quando o teste manda. */
    private static final class RelogioAjustavel extends Clock {

        private Instant agora;

        RelogioAjustavel(Instant inicio) {
            this.agora = inicio;
        }

        void avancar(Duration tempo) {
            agora = agora.plus(tempo);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zona) {
            return this;
        }

        @Override
        public Instant instant() {
            return agora;
        }
    }
}
