package com.icaroms.paineldev;

import com.icaroms.painel.PainelApiApplication;
import org.springframework.boot.SpringApplication;

/**
 * Roda a API no seu computador, sem instalar o PostgreSQL:
 *
 * <pre>
 * cd backend
 * mvnw spring-boot:test-run -Dspring-boot.run.main-class=com.icaroms.paineldev.PainelApiDev
 * </pre>
 *
 * <p>Liga o perfil "dev" (src/test/resources/application-dev.yml) e troca o
 * banco pelo PostgreSQL embutido de {@link BancoDev}. Fica em src/test (e num
 * pacote fora de com.icaroms.painel) para nada disto ir para o .jar de produção.
 */
public final class PainelApiDev {

    private PainelApiDev() {
    }

    public static void main(String[] args) {
        System.setProperty("spring.profiles.active", "dev");
        SpringApplication.from(PainelApiApplication::main).with(BancoDev.class).run(args);
    }
}
