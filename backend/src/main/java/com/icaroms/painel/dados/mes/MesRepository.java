package com.icaroms.painel.dados.mes;

import com.icaroms.painel.dados.comum.RegistroRepository;
import java.util.Optional;
import java.util.UUID;

/** Acesso à tabela "meses". */
public interface MesRepository extends RegistroRepository<Mes> {

    /** O registro de um mês ("AAAA-MM") da conta, se houver. */
    Optional<Mes> findByUsuarioIdAndMes(UUID usuarioId, String mes);
}
