package com.icaroms.painel.dados.mes;

import com.icaroms.painel.dados.comum.ConflitoDeVersaoException;
import com.icaroms.painel.dados.comum.Erros;
import com.icaroms.painel.dados.comum.Formatos;
import com.icaroms.painel.dados.comum.ServicoDeRegistros;
import java.time.Clock;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Meses: um registro por mês em cada conta.
 *
 * <p>Se dois aparelhos criarem o mesmo mês com ids diferentes, o segundo
 * recebe 409 com o registro que já está no servidor, para adotar.
 */
@Service
public class MesService extends ServicoDeRegistros<Mes, MesDto> {

    /** Situações aceitas de uma conta fixa no mês (src/modelo.js, STATUS_FIXO). */
    static final Set<String> STATUS_ACEITOS = Set.of("previsto", "pago", "dispensado");

    private final MesRepository meses;

    public MesService(MesRepository repositorio, Clock relogio) {
        super(repositorio, relogio);
        this.meses = repositorio;
    }

    @Override
    protected void validar(MesDto dto, Erros erros) {
        erros.se(dto.getAjustesFixos().values().stream().anyMatch(valor -> valor == null || valor < 0),
                "ajustesFixos", "Os valores ajustados devem ser zero ou mais.");
        erros.se(dto.getStatusFixos().values().stream().anyMatch(status -> !STATUS_ACEITOS.contains(status)),
                "statusFixos", "A situação de cada conta deve ser previsto, pago ou dispensado.");
    }

    @Override
    protected void conferirConflitos(UUID usuarioId, UUID id, MesDto dto) {
        meses.findByUsuarioIdAndMes(usuarioId, dto.getMes())
                .filter(outro -> !outro.getId().equals(id))
                .ifPresent(outro -> {
                    throw new ConflitoDeVersaoException(paraDto(outro));
                });
    }

    @Override
    protected Mes novaEntidade(UUID id, UUID usuarioId) {
        return new Mes(id, usuarioId);
    }

    @Override
    protected MesDto novoDto() {
        return new MesDto();
    }

    @Override
    protected void copiarParaEntidade(MesDto dto, Mes entidade) {
        entidade.setMes(dto.getMes());
        entidade.setSaldoInicialCentavos(dto.getSaldoInicialCentavos());
        entidade.setRendaPrevistaCentavos(dto.getRendaPrevistaCentavos());
        entidade.setSaldoConfirmado(dto.getSaldoConfirmado());
        entidade.setAjustesFixos(Formatos.copiar(dto.getAjustesFixos()));
        entidade.setStatusFixos(Formatos.copiar(dto.getStatusFixos()));
    }

    @Override
    protected void copiarParaDto(Mes entidade, MesDto dto) {
        dto.setMes(entidade.getMes());
        dto.setSaldoInicialCentavos(entidade.getSaldoInicialCentavos());
        dto.setRendaPrevistaCentavos(entidade.getRendaPrevistaCentavos());
        dto.setSaldoConfirmado(entidade.isSaldoConfirmado());
        dto.setAjustesFixos(Formatos.comoCentavos(entidade.getAjustesFixos()));
        dto.setStatusFixos(Formatos.comoTexto(entidade.getStatusFixos()));
    }
}
