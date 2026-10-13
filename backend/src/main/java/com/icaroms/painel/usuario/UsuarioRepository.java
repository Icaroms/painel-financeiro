package com.icaroms.painel.usuario;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Acesso à tabela "usuarios". */
public interface UsuarioRepository extends JpaRepository<Usuario, UUID> {

    /** Busca pelo e-mail já normalizado (minúsculas). */
    Optional<Usuario> findByEmail(String email);
}
