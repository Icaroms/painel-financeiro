package com.icaroms.painel.sincronizacao;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.icaroms.painel.dados.categoria.CategoriaDto;
import com.icaroms.painel.dados.categoria.CategoriaService;
import com.icaroms.painel.dados.comum.ConflitoDeVersaoException;
import com.icaroms.painel.dados.comum.DadosInvalidosException;
import com.icaroms.painel.dados.comum.RegistroDto;
import com.icaroms.painel.dados.comum.RegistroNaoEncontradoException;
import com.icaroms.painel.dados.comum.ServicoDeRegistros;
import com.icaroms.painel.dados.configuracao.ConfiguracaoDto;
import com.icaroms.painel.dados.configuracao.ConfiguracaoService;
import com.icaroms.painel.dados.fixo.FixoDto;
import com.icaroms.painel.dados.fixo.FixoService;
import com.icaroms.painel.dados.investimento.InvestimentoDto;
import com.icaroms.painel.dados.investimento.InvestimentoService;
import com.icaroms.painel.dados.lancamento.LancamentoDto;
import com.icaroms.painel.dados.lancamento.LancamentoService;
import com.icaroms.painel.dados.mes.MesDto;
import com.icaroms.painel.dados.mes.MesService;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * Sincronização de um aparelho com o servidor, num pedido só:
 * <ol>
 *   <li>grava os registros que o aparelho mandou, um a um (um registro
 *       inválido não impede os outros);</li>
 *   <li>devolve o que mudou no servidor desde a última sincronização do
 *       aparelho, e um "cursor" novo para a próxima.</li>
 * </ol>
 * As regras de cada gravação são as mesmas do PUT de cada lista: vale o
 * {@code atualizadoEm} mais recente.
 */
@Service
public class SincronizacaoService {

    /** Limite de registros por lista num pedido (a primeira sincronização manda tudo). */
    static final int MAXIMO_POR_LISTA = 5000;

    /** Uma lista sincronizável: nome no JSON, serviço e tipo do registro. */
    private record Lista<D extends RegistroDto>(String nome, ServicoDeRegistros<?, D> servico, Class<D> tipo) {
    }

    private final List<Lista<?>> listas;
    private final ConfiguracaoService configuracoes;
    private final ObjectMapper json;
    private final Validator validador;
    private final Clock relogio;

    public SincronizacaoService(CategoriaService categorias, FixoService fixos, LancamentoService lancamentos,
            MesService meses, InvestimentoService investimentos, ConfiguracaoService configuracoes,
            ObjectMapper json, Validator validador, Clock relogio) {
        // Os meses vêm antes dos lançamentos só por clareza; cada registro é independente.
        this.listas = List.of(
                new Lista<>("categorias", categorias, CategoriaDto.class),
                new Lista<>("fixos", fixos, FixoDto.class),
                new Lista<>("meses", meses, MesDto.class),
                new Lista<>("lancamentos", lancamentos, LancamentoDto.class),
                new Lista<>("investimentos", investimentos, InvestimentoDto.class));
        this.configuracoes = configuracoes;
        this.json = json;
        this.validador = validador;
        this.relogio = relogio;
    }

    /** Nomes aceitos em "listas". */
    public List<String> nomesDasListas() {
        return listas.stream().map(Lista::nome).toList();
    }

    public RespostaSincronizacao sincronizar(UUID usuarioId, PedidoSincronizacao pedido) {
        Map<String, List<Map<String, Object>>> enviadas = pedido.listas() == null ? Map.of() : pedido.listas();
        conferirListas(enviadas);

        // O cursor é marcado ANTES de gravar e ler: o que for gravado depois
        // deste instante (por este ou por outro aparelho) aparece na próxima vez.
        Instant cursor = relogio.instant().truncatedTo(ChronoUnit.MICROS);

        Map<String, List<ResultadoDoItem>> resultados = new LinkedHashMap<>();
        for (Lista<?> lista : listas) {
            List<Map<String, Object>> itens = enviadas.getOrDefault(lista.nome(), List.of());
            resultados.put(lista.nome(), gravarItens(usuarioId, lista, itens));
        }
        ResultadoDoItem resultadoDaConfiguracao = pedido.configuracao() == null
                ? null
                : gravarConfiguracao(usuarioId, pedido.configuracao());

        Map<String, List<?>> mudancas = new LinkedHashMap<>();
        for (Lista<?> lista : listas) {
            mudancas.put(lista.nome(), lista.servico().listar(usuarioId, pedido.desde()));
        }
        ConfiguracaoDto configuracaoAtual = configuracoes.buscarDesde(usuarioId, pedido.desde()).orElse(null);

        return new RespostaSincronizacao(cursor, resultados, resultadoDaConfiguracao, mudancas, configuracaoAtual);
    }

    private void conferirListas(Map<String, List<Map<String, Object>>> enviadas) {
        List<String> nomes = nomesDasListas();
        for (Map.Entry<String, List<Map<String, Object>>> lista : enviadas.entrySet()) {
            if (!nomes.contains(lista.getKey())) {
                throw new DadosInvalidosException("listas", "Lista desconhecida: \"" + lista.getKey() + "\".");
            }
            if (lista.getValue() != null && lista.getValue().size() > MAXIMO_POR_LISTA) {
                throw new DadosInvalidosException("listas",
                        "Registros demais em \"" + lista.getKey() + "\" (máximo " + MAXIMO_POR_LISTA + " por vez).");
            }
        }
    }

    private <D extends RegistroDto> List<ResultadoDoItem> gravarItens(UUID usuarioId, Lista<D> lista,
            List<Map<String, Object>> itens) {
        List<ResultadoDoItem> resultados = new ArrayList<>();
        if (itens != null) {
            for (Map<String, Object> item : itens) {
                resultados.add(gravarItem(usuarioId, lista, item));
            }
        }
        return resultados;
    }

    private <D extends RegistroDto> ResultadoDoItem gravarItem(UUID usuarioId, Lista<D> lista,
            Map<String, Object> item) {
        String idTexto = item == null ? null : String.valueOf(item.get("id"));
        UUID id;
        try {
            id = UUID.fromString(idTexto);
        } catch (IllegalArgumentException | NullPointerException erro) {
            return ResultadoDoItem.recusado(idTexto, Map.of("id", "Id inválido."));
        }

        D dto;
        try {
            dto = json.convertValue(item, lista.tipo());
        } catch (IllegalArgumentException erro) {
            return ResultadoDoItem.recusado(idTexto, Map.of("registro", "Algum campo está num formato inválido."));
        }
        Map<String, String> campos = mensagens(validador.validate(dto));
        if (!campos.isEmpty()) {
            return ResultadoDoItem.recusado(idTexto, campos);
        }

        try {
            lista.servico().gravar(usuarioId, id, dto);
            return ResultadoDoItem.gravado(idTexto);
        } catch (ConflitoDeVersaoException erro) {
            return ResultadoDoItem.conflito(idTexto, erro.getAtual());
        } catch (DadosInvalidosException erro) {
            return ResultadoDoItem.recusado(idTexto, erro.getCampos());
        } catch (RegistroNaoEncontradoException erro) {
            return ResultadoDoItem.recusado(idTexto, Map.of("id", "Este id já é usado por outro registro."));
        } catch (DataIntegrityViolationException erro) {
            return ResultadoDoItem.recusado(idTexto, Map.of("registro", "Conflita com um dado que já está no servidor."));
        }
    }

    private ResultadoDoItem gravarConfiguracao(UUID usuarioId, Map<String, Object> corpo) {
        ConfiguracaoDto dto;
        try {
            dto = json.convertValue(corpo, ConfiguracaoDto.class);
        } catch (IllegalArgumentException erro) {
            return ResultadoDoItem.recusado(null, Map.of("configuracao", "Algum campo está num formato inválido."));
        }
        Map<String, String> campos = mensagens(validador.validate(dto));
        if (!campos.isEmpty()) {
            return ResultadoDoItem.recusado(null, campos);
        }
        try {
            configuracoes.gravar(usuarioId, dto);
            return ResultadoDoItem.gravado(null);
        } catch (ConflitoDeVersaoException erro) {
            return ResultadoDoItem.conflito(null, erro.getAtual());
        } catch (DadosInvalidosException erro) {
            return ResultadoDoItem.recusado(null, erro.getCampos());
        }
    }

    /** Violações de validação → campo → mensagem (a primeira de cada campo). */
    private static <T> Map<String, String> mensagens(Set<ConstraintViolation<T>> violacoes) {
        Map<String, String> campos = new LinkedHashMap<>();
        for (ConstraintViolation<T> violacao : violacoes) {
            campos.putIfAbsent(violacao.getPropertyPath().toString(), violacao.getMessage());
        }
        return campos;
    }
}
