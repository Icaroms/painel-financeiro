package com.icaroms.painel.erro;

import com.icaroms.painel.dados.comum.ConflitoDeVersaoException;
import com.icaroms.painel.dados.comum.DadosInvalidosException;
import com.icaroms.painel.dados.comum.RegistroNaoEncontradoException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Transforma erros em respostas padronizadas no formato "problem+json"
 * (RFC 9457), sempre em português e sem detalhes internos (pilha, SQL).
 *
 * <p>Exemplo de resposta:
 * <pre>
 * { "type": "about:blank", "title": "Dados inválidos", "status": 400,
 *   "detail": "Confira os campos destacados.",
 *   "campos": { "email": "Informe um e-mail válido." } }
 * </pre>
 */
@RestControllerAdvice
public class TratadorDeErros extends ResponseEntityExceptionHandler {

    private static final Logger LOG = LoggerFactory.getLogger(TratadorDeErros.class);

    /** Campos que não passaram na validação (@NotBlank, @Email...). */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException erro, HttpHeaders cabecalhos, HttpStatusCode status, WebRequest pedido) {
        Map<String, String> campos = new LinkedHashMap<>();
        erro.getBindingResult().getFieldErrors()
                .forEach(campo -> campos.putIfAbsent(campo.getField(), campo.getDefaultMessage()));

        ProblemDetail problema = problema(HttpStatus.BAD_REQUEST, "Dados inválidos", "Confira os campos destacados.");
        problema.setProperty("campos", campos);
        return ResponseEntity.badRequest().body(problema);
    }

    /** Corpo do pedido que não é um JSON válido. */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException erro, HttpHeaders cabecalhos, HttpStatusCode status, WebRequest pedido) {
        return ResponseEntity.badRequest()
                .body(problema(HttpStatus.BAD_REQUEST, "Pedido inválido", "O corpo do pedido não é um JSON válido."));
    }

    /** Parâmetro em formato errado (ex.: id que não é UUID, "desde" que não é data). */
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException erro, HttpHeaders cabecalhos, HttpStatusCode status, WebRequest pedido) {
        return ResponseEntity.badRequest().body(problema(HttpStatus.BAD_REQUEST, "Pedido inválido",
                "O valor \"" + erro.getValue() + "\" não está no formato esperado."));
    }

    /** Regras de integridade conferidas nos serviços (ex.: mês final antes do inicial). */
    @ExceptionHandler(DadosInvalidosException.class)
    public ResponseEntity<ProblemDetail> dadosInvalidos(DadosInvalidosException erro) {
        ProblemDetail problema = problema(HttpStatus.BAD_REQUEST, "Dados inválidos", erro.getMessage());
        problema.setProperty("campos", erro.getCampos());
        return ResponseEntity.badRequest().body(problema);
    }

    @ExceptionHandler(RegistroNaoEncontradoException.class)
    public ResponseEntity<ProblemDetail> naoEncontrado(RegistroNaoEncontradoException erro) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(problema(HttpStatus.NOT_FOUND, "Não encontrado", erro.getMessage()));
    }

    /** O servidor tem uma versão mais nova: a resposta leva essa versão em "atual". */
    @ExceptionHandler(ConflitoDeVersaoException.class)
    public ResponseEntity<ProblemDetail> conflitoDeVersao(ConflitoDeVersaoException erro) {
        ProblemDetail problema = problema(HttpStatus.CONFLICT, "Conflito", erro.getMessage());
        problema.setProperty("atual", erro.getAtual());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problema);
    }

    /** Regra do banco violada (ex.: dois registros para o mesmo mês gravados ao mesmo tempo). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ProblemDetail> integridade(DataIntegrityViolationException erro) {
        LOG.warn("Gravação recusada pelo banco: {}", erro.getMostSpecificCause().getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problema(HttpStatus.CONFLICT, "Conflito",
                "Esta gravação conflita com um dado que já está no servidor. Atualize e tente de novo."));
    }

    @ExceptionHandler(CredenciaisInvalidasException.class)
    public ResponseEntity<ProblemDetail> credenciaisInvalidas(CredenciaisInvalidasException erro) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(problema(HttpStatus.UNAUTHORIZED, "Não autenticado", erro.getMessage()));
    }

    @ExceptionHandler(TentativasExcedidasException.class)
    public ResponseEntity<ProblemDetail> tentativasExcedidas(TentativasExcedidasException erro) {
        long segundos = Math.max(1, erro.getEsperar().toSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(segundos))
                .body(problema(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas", erro.getMessage()));
    }

    /** Qualquer erro não previsto: registra no log e responde sem detalhes. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> erroInesperado(Exception erro) {
        LOG.error("Erro inesperado", erro);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(problema(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno",
                        "Algo deu errado no servidor. Tente de novo em instantes."));
    }

    private static ProblemDetail problema(HttpStatus status, String titulo, String detalhe) {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(status, detalhe);
        problema.setTitle(titulo);
        problema.setType(URI.create("about:blank"));
        return problema;
    }
}
