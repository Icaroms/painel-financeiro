package com.icaroms.painel.dados.comum;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * Rotas comuns a toda lista de registros. Cada lista tem um controlador
 * filho que só define o endereço (ex.: /api/categorias).
 *
 * <ul>
 *   <li>GET /api/{lista}?desde=...: registros da conta (com os excluídos);</li>
 *   <li>GET /api/{lista}/{id}: um registro;</li>
 *   <li>PUT /api/{lista}/{id}: cria (201) ou atualiza (200); 409 se o servidor tem versão mais nova;</li>
 *   <li>DELETE /api/{lista}/{id}: exclusão suave (o registro volta com excluidoEm).</li>
 * </ul>
 *
 * @param <D> o JSON do registro
 */
public abstract class ControladorDeRegistros<D extends RegistroDto> {

    private final ServicoDeRegistros<?, D> servico;

    protected ControladorDeRegistros(ServicoDeRegistros<?, D> servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Listar", description = "Todos os registros da conta, inclusive os excluídos.")
    public List<D> listar(
            @AuthenticationPrincipal Jwt token,
            @Parameter(description = "Só os gravados no servidor a partir deste momento (ISO 8601).")
            @RequestParam(required = false) Instant desde) {
        return servico.listar(Formatos.usuarioDo(token), desde);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Buscar um")
    public D buscar(@AuthenticationPrincipal Jwt token, @PathVariable UUID id) {
        return servico.buscar(Formatos.usuarioDo(token), id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Gravar", description = "Cria (201) ou atualiza (200). Vale o atualizadoEm mais recente (senão, 409).")
    public ResponseEntity<D> gravar(@AuthenticationPrincipal Jwt token, @PathVariable UUID id,
            @Valid @RequestBody D corpo) {
        Gravacao<D> gravacao = servico.gravar(Formatos.usuarioDo(token), id, corpo);
        return ResponseEntity.status(gravacao.criado() ? HttpStatus.CREATED : HttpStatus.OK).body(gravacao.registro());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Excluir", description = "Exclusão suave: o registro volta com excluidoEm preenchido.")
    public D excluir(@AuthenticationPrincipal Jwt token, @PathVariable UUID id) {
        return servico.excluir(Formatos.usuarioDo(token), id);
    }
}
