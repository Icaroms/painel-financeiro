package com.icaroms.painel.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Relógio único do app (sempre em UTC). Quem precisa da hora recebe este
 * {@link Clock} em vez de chamar {@code Instant.now()}: assim os testes podem
 * usar um relógio fixo, como o front faz com o parâmetro "agora".
 */
@Configuration(proxyBeanMethods = false)
public class RelogioConfig {

    @Bean
    public Clock relogio() {
        return Clock.systemUTC();
    }
}
