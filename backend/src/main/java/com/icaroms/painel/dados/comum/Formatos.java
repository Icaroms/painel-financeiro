package com.icaroms.painel.dados.comum;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.security.oauth2.jwt.Jwt;

/** Formatos e conversões usados em várias listas. */
public final class Formatos {

    /** Mês no formato do app: "AAAA-MM". */
    public static final String MES = "^[0-9]{4}-(0[1-9]|1[0-2])$";

    private static final Pattern PADRAO_MES = Pattern.compile(MES);

    private Formatos() {
    }

    public static boolean ehMes(String texto) {
        return texto != null && PADRAO_MES.matcher(texto).matches();
    }

    /** Id da conta logada (o "sub" do token). */
    public static UUID usuarioDo(Jwt token) {
        return UUID.fromString(token.getSubject());
    }

    /** Cópia de um mapa para gravar como JSON (null vira vazio). */
    public static Map<String, Object> copiar(Map<String, ?> origem) {
        return origem == null ? new LinkedHashMap<>() : new LinkedHashMap<>(origem);
    }

    /** Cópia de um mapa lido do JSON, com valores numéricos como long. */
    public static Map<String, Long> comoCentavos(Map<String, Object> origem) {
        Map<String, Long> destino = new LinkedHashMap<>();
        if (origem != null) {
            origem.forEach((chave, valor) -> {
                if (valor instanceof Number numero) {
                    destino.put(chave, numero.longValue());
                }
            });
        }
        return destino;
    }

    /** Cópia de um mapa lido do JSON, com valores em texto. */
    public static Map<String, String> comoTexto(Map<String, Object> origem) {
        Map<String, String> destino = new LinkedHashMap<>();
        if (origem != null) {
            origem.forEach((chave, valor) -> {
                if (valor != null) {
                    destino.put(chave, valor.toString());
                }
            });
        }
        return destino;
    }
}
