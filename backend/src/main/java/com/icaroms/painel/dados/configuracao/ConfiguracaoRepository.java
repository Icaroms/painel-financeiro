package com.icaroms.painel.dados.configuracao;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Acesso à tabela "configuracoes" (a chave é o id da conta). */
public interface ConfiguracaoRepository extends JpaRepository<Configuracao, UUID> {
}
