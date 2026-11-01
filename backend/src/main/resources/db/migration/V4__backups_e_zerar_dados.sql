-- Fase 05, parte 5.4: backups na nuvem e "apagar os dados da conta".
--
-- backups: cópias completas do pacote do app (o mesmo conteúdo do arquivo
-- de backup), guardadas em JSONB. Cada conta guarda só as últimas N
-- (painel.backups.maximo); as mais antigas são apagadas a cada envio.
--
-- usuarios.dados_zerados_em: quando os dados da conta foram apagados (ou
-- substituídos por um backup). Um aparelho que sincronizou antes desse
-- momento recebe "zerados" e pergunta à pessoa o que fazer, em vez de
-- devolver ao servidor os dados que foram apagados.

CREATE TABLE backups (
    id              UUID         PRIMARY KEY,
    usuario_id      UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    criado_em       TIMESTAMPTZ  NOT NULL,           -- hora do servidor
    salvo_em        TIMESTAMPTZ,                     -- "salvoEm" de dentro do pacote
    versao_formato  INTEGER      NOT NULL CHECK (versao_formato >= 1),
    tamanho_bytes   INTEGER      NOT NULL CHECK (tamanho_bytes > 0),
    resumo          JSONB        NOT NULL,           -- quantos meses, lançamentos...
    pacote          JSONB        NOT NULL
);
CREATE INDEX ix_backups_usuario_criado ON backups (usuario_id, criado_em DESC);

ALTER TABLE usuarios ADD COLUMN dados_zerados_em TIMESTAMPTZ;
