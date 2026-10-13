package com.icaroms.painel.dados.comum;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;

/**
 * Regras comuns a toda lista de registros (listar, buscar, gravar, excluir).
 * Cada lista tem um serviço filho que só diz como converter os campos
 * próprios e quais regras extras conferir.
 *
 * <p>Regras da gravação (PUT /api/{lista}/{id}):
 * <ol>
 *   <li>O id do endereço manda; se o corpo trouxer outro id, é recusado (400).</li>
 *   <li>Registro de outra conta responde como inexistente (404).</li>
 *   <li>Se o servidor já tem um {@code atualizadoEm} mais novo, a gravação é
 *       recusada (409) e a resposta traz a versão do servidor.</li>
 *   <li>Senão, grava (cria ou substitui) e marca {@code recebidoEm} com a hora
 *       do servidor.</li>
 * </ol>
 *
 * @param <E> a entidade
 * @param <D> o JSON do registro
 */
public abstract class ServicoDeRegistros<E extends Registro, D extends RegistroDto> {

    private final RegistroRepository<E> repositorio;
    private final Clock relogio;

    protected ServicoDeRegistros(RegistroRepository<E> repositorio, Clock relogio) {
        this.repositorio = repositorio;
        this.relogio = relogio;
    }

    /** Cria a entidade vazia de um registro novo. */
    protected abstract E novaEntidade(UUID id, UUID usuarioId);

    /** Cria o JSON vazio da resposta. */
    protected abstract D novoDto();

    /** Copia os campos próprios do JSON para a entidade. */
    protected abstract void copiarParaEntidade(D dto, E entidade);

    /** Copia os campos próprios da entidade para o JSON. */
    protected abstract void copiarParaDto(E entidade, D dto);

    /**
     * Regras que as anotações não cobrem (ex.: mês final depois do inicial).
     * Por padrão, nenhuma.
     */
    protected void validar(D dto, Erros erros) {
    }

    /**
     * Conflitos próprios da lista, conferidos antes de gravar (ex.: dois
     * registros para o mesmo mês). Para recusar, lance
     * {@link ConflitoDeVersaoException} com a versão do servidor. Por padrão, nenhum.
     */
    protected void conferirConflitos(UUID usuarioId, UUID id, D dto) {
    }

    /**
     * Lista os registros da conta.
     *
     * @param desde se informado, só os gravados no servidor a partir deste momento
     */
    @Transactional(readOnly = true)
    public List<D> listar(UUID usuarioId, Instant desde) {
        List<E> registros = desde == null
                ? repositorio.findByUsuarioIdOrderByCriadoEmAscIdAsc(usuarioId)
                : repositorio.findByUsuarioIdAndRecebidoEmGreaterThanEqualOrderByRecebidoEmAscIdAsc(usuarioId, desde);
        return registros.stream().map(this::paraDto).toList();
    }

    @Transactional(readOnly = true)
    public D buscar(UUID usuarioId, UUID id) {
        return paraDto(daConta(usuarioId, id));
    }

    @Transactional
    public Gravacao<D> gravar(UUID usuarioId, UUID id, D dto) {
        if (dto.getId() != null && !dto.getId().equals(id)) {
            throw new DadosInvalidosException("id", "O id do corpo é diferente do id do endereço.");
        }
        Erros erros = new Erros();
        validar(dto, erros);
        erros.lancarSeHouver();

        Optional<E> existente = repositorio.findById(id);
        if (existente.isPresent() && !existente.get().getUsuarioId().equals(usuarioId)) {
            throw new RegistroNaoEncontradoException();
        }
        if (existente.isPresent() && dto.getAtualizadoEm().isBefore(existente.get().getAtualizadoEm())) {
            throw new ConflitoDeVersaoException(paraDto(existente.get()));
        }
        conferirConflitos(usuarioId, id, dto);

        E entidade = existente.orElseGet(() -> novaEntidade(id, usuarioId));
        copiarParaEntidade(dto, entidade);
        entidade.aplicarControle(dto, agora());
        E salvo = repositorio.saveAndFlush(entidade);
        return new Gravacao<>(paraDto(salvo), existente.isEmpty());
    }

    /** Exclusão suave: o registro fica marcado com excluidoEm e continua sincronizando. */
    @Transactional
    public D excluir(UUID usuarioId, UUID id) {
        E entidade = daConta(usuarioId, id);
        entidade.excluir(agora());
        return paraDto(repositorio.saveAndFlush(entidade));
    }

    /**
     * Hora do servidor em microssegundos, a mesma precisão do PostgreSQL:
     * assim o "desde" que o app devolve compara exatamente com o banco.
     */
    private Instant agora() {
        return relogio.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private E daConta(UUID usuarioId, UUID id) {
        return repositorio.findById(id)
                .filter(registro -> registro.getUsuarioId().equals(usuarioId))
                .orElseThrow(RegistroNaoEncontradoException::new);
    }

    /** Monta o JSON de resposta de uma entidade. */
    protected D paraDto(E entidade) {
        D dto = novoDto();
        entidade.preencherControle(dto);
        copiarParaDto(entidade, dto);
        return dto;
    }
}
