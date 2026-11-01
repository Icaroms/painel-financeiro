package com.icaroms.painel.backup;

import com.icaroms.painel.dados.comum.Formatos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Backups na nuvem.
 *
 * <ul>
 *   <li>POST /api/backups: o pacote do app no corpo → 201 com o resumo (413 se grande demais);</li>
 *   <li>GET /api/backups: a lista (sem o conteúdo), o máximo guardado e o tamanho máximo;</li>
 *   <li>GET /api/backups/{id}: o pacote, para restaurar;</li>
 *   <li>DELETE /api/backups/{id}: apaga um backup (204).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/backups")
@Tag(name = "Backups na nuvem")
public class BackupController {

    private final BackupService servico;

    public BackupController(BackupService servico) {
        this.servico = servico;
    }

    /**
     * O corpo é lido direto do pedido (e não com @RequestBody) para medir o
     * tamanho e recusar um backup grande demais sem ler tudo.
     */
    @PostMapping
    @Operation(summary = "Enviar backup", description = "Corpo: o pacote do app (formato, versao, salvoEm, dados).")
    public ResponseEntity<BackupResumo> enviar(@AuthenticationPrincipal Jwt token, HttpServletRequest pedido)
            throws IOException {
        byte[] corpo = servico.lerCorpo(pedido.getInputStream());
        return ResponseEntity.status(HttpStatus.CREATED).body(servico.guardar(Formatos.usuarioDo(token), corpo));
    }

    @GetMapping
    @Operation(summary = "Listar backups")
    public ListaDeBackups listar(@AuthenticationPrincipal Jwt token) {
        return servico.listar(Formatos.usuarioDo(token));
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Baixar um backup", description = "Devolve o pacote, como o app enviou.")
    public ResponseEntity<String> baixar(@AuthenticationPrincipal Jwt token, @PathVariable UUID id) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .body(servico.pacote(Formatos.usuarioDo(token), id));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Apagar um backup")
    public ResponseEntity<Void> apagar(@AuthenticationPrincipal Jwt token, @PathVariable UUID id) {
        servico.apagar(Formatos.usuarioDo(token), id);
        return ResponseEntity.noContent().build();
    }
}
