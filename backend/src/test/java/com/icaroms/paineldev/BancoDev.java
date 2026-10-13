package com.icaroms.paineldev;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.File;
import java.io.IOException;
import javax.sql.DataSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * PostgreSQL embutido para o modo dev.
 *
 * <p>Os dados ficam em backend/.banco-dev e continuam lá entre uma execução e
 * outra (para começar do zero, apague essa pasta com a API parada).
 * Porta 54329, para não brigar com um PostgreSQL instalado (5432).
 */
@TestConfiguration(proxyBeanMethods = false)
public class BancoDev {

    static final int PORTA = 54329;

    @Bean(destroyMethod = "close")
    public EmbeddedPostgres bancoEmbutidoDev() throws IOException {
        File pasta = new File(".banco-dev").getAbsoluteFile();
        return EmbeddedPostgres.builder()
                .setDataDirectory(pasta)
                .setCleanDataDirectory(false)
                .setPort(PORTA)
                .start();
    }

    @Bean
    public DataSource dataSource(EmbeddedPostgres bancoEmbutidoDev) {
        return bancoEmbutidoDev.getPostgresDatabase();
    }
}
