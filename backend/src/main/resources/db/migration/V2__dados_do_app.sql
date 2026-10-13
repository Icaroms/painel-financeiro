-- Fase 05, parte 5.2: os dados do app em tabelas próprias.
--
-- Cada tabela espelha uma lista do pacote do app (src/persistencia.js):
--   categorias, fixos, lancamentos, meses e investimentos (com as operações
--   de ações e FIIs em "operacoes"). Formas de pagamento, cartões, destino
--   da sobra e data do último backup ficam em "configuracoes" (uma linha por conta).
--
-- Colunas de controle, iguais em todas as listas:
--   id            UUID gerado no aparelho (o mesmo do app);
--   usuario_id    dono do registro (cada conta só vê os seus);
--   criado_em, atualizado_em, excluido_em
--                 vindos do app; excluido_em preenchido = exclusão suave;
--   recebido_em   hora do SERVIDOR na última gravação: é por ela que a
--                 sincronização (parte 5.3) pergunta "o que mudou desde...",
--                 sem depender do relógio de cada aparelho;
--   extras        campos que o app tiver e esta tabela ainda não conhecer:
--                 são guardados e devolvidos sem perda.
--
-- Valores em centavos (BIGINT), como no app. Meses no formato "AAAA-MM".

CREATE TABLE categorias (
    id                  UUID         PRIMARY KEY,
    usuario_id          UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    nome                VARCHAR(80)  NOT NULL,
    orcamento_centavos  BIGINT       NOT NULL CHECK (orcamento_centavos >= 0),
    criado_em           TIMESTAMPTZ  NOT NULL,
    atualizado_em       TIMESTAMPTZ  NOT NULL,
    excluido_em         TIMESTAMPTZ,
    recebido_em         TIMESTAMPTZ  NOT NULL,
    extras              JSONB        NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_categorias_usuario_recebido ON categorias (usuario_id, recebido_em);

CREATE TABLE fixos (
    id                    UUID         PRIMARY KEY,
    usuario_id            UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    nome                  VARCHAR(80)  NOT NULL,
    valor_centavos        BIGINT       NOT NULL CHECK (valor_centavos >= 0),
    dia_vencimento        INTEGER      NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
    forma_pagamento       VARCHAR(40)  NOT NULL,
    mes_inicial           VARCHAR(7)   NOT NULL CHECK (mes_inicial ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    mes_final             VARCHAR(7)   CHECK (mes_final ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    pagamento_automatico  BOOLEAN      NOT NULL,
    criado_em             TIMESTAMPTZ  NOT NULL,
    atualizado_em         TIMESTAMPTZ  NOT NULL,
    excluido_em           TIMESTAMPTZ,
    recebido_em           TIMESTAMPTZ  NOT NULL,
    extras                JSONB        NOT NULL DEFAULT '{}',
    CONSTRAINT ck_fixos_meses CHECK (mes_final IS NULL OR mes_final >= mes_inicial)
);
CREATE INDEX ix_fixos_usuario_recebido ON fixos (usuario_id, recebido_em);

CREATE TABLE lancamentos (
    id               UUID          PRIMARY KEY,
    usuario_id       UUID          NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    valor_centavos   BIGINT        NOT NULL CHECK (valor_centavos > 0),
    -- Texto, e não UUID: as compras convertidas de conta fixa usam o valor
    -- especial "conversao-de-conta-fixa" (src/conversao.js).
    categoria_id     VARCHAR(80)   NOT NULL,
    forma_pagamento  VARCHAR(40)   NOT NULL,
    data             DATE          NOT NULL,
    descricao        VARCHAR(500)  NOT NULL DEFAULT '',
    parcelas         INTEGER       NOT NULL CHECK (parcelas BETWEEN 1 AND 24),
    conversao        JSONB,
    criado_em        TIMESTAMPTZ   NOT NULL,
    atualizado_em    TIMESTAMPTZ   NOT NULL,
    excluido_em      TIMESTAMPTZ,
    recebido_em      TIMESTAMPTZ   NOT NULL,
    extras           JSONB         NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_lancamentos_usuario_recebido ON lancamentos (usuario_id, recebido_em);
CREATE INDEX ix_lancamentos_usuario_data ON lancamentos (usuario_id, data);

CREATE TABLE meses (
    id                       UUID         PRIMARY KEY,
    usuario_id               UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    mes                      VARCHAR(7)   NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- Pode ser negativo: o mês pode começar no vermelho.
    saldo_inicial_centavos   BIGINT       NOT NULL,
    renda_prevista_centavos  BIGINT       NOT NULL CHECK (renda_prevista_centavos >= 0),
    saldo_confirmado         BOOLEAN      NOT NULL,
    ajustes_fixos            JSONB        NOT NULL DEFAULT '{}',
    status_fixos             JSONB        NOT NULL DEFAULT '{}',
    criado_em                TIMESTAMPTZ  NOT NULL,
    atualizado_em            TIMESTAMPTZ  NOT NULL,
    excluido_em              TIMESTAMPTZ,
    recebido_em              TIMESTAMPTZ  NOT NULL,
    extras                   JSONB        NOT NULL DEFAULT '{}',
    -- Um registro por mês em cada conta: dois aparelhos não podem criar
    -- dois "2026-11" diferentes (o segundo recebe 409 e adota o primeiro).
    CONSTRAINT uk_meses_usuario_mes UNIQUE (usuario_id, mes)
);
CREATE INDEX ix_meses_usuario_recebido ON meses (usuario_id, recebido_em);

CREATE TABLE investimentos (
    id                       UUID         PRIMARY KEY,
    usuario_id               UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    tipo                     VARCHAR(20)  NOT NULL,
    nome                     VARCHAR(40)  NOT NULL,
    -- Renda fixa, fundos e imóveis (por valor aplicado e valor atual):
    data_aplicacao           DATE,
    valor_aplicado_centavos  BIGINT       CHECK (valor_aplicado_centavos > 0),
    valor_atual_centavos     BIGINT       CHECK (valor_atual_centavos >= 0),
    valor_atual_em           DATE,
    reserva                  BOOLEAN      NOT NULL DEFAULT FALSE,
    taxa                     JSONB,
    -- Ações e FIIs (por operação, em "operacoes"):
    cotacao_centavos         BIGINT       CHECK (cotacao_centavos > 0),
    cotacao_em               DATE,
    criado_em                TIMESTAMPTZ  NOT NULL,
    atualizado_em            TIMESTAMPTZ  NOT NULL,
    excluido_em              TIMESTAMPTZ,
    recebido_em              TIMESTAMPTZ  NOT NULL,
    extras                   JSONB        NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_investimentos_usuario_recebido ON investimentos (usuario_id, recebido_em);

-- Compras e vendas de uma ação ou FII, na ordem do app (posicao).
-- Gravadas junto com o investimento: a lista inteira é trocada a cada gravação.
CREATE TABLE operacoes (
    investimento_id  UUID         NOT NULL REFERENCES investimentos (id) ON DELETE CASCADE,
    posicao          INTEGER      NOT NULL,
    id               UUID         NOT NULL,
    tipo             VARCHAR(10)  NOT NULL CHECK (tipo IN ('compra', 'venda')),
    data             DATE         NOT NULL,
    quantidade       BIGINT       NOT NULL CHECK (quantidade > 0),
    preco_centavos   BIGINT       NOT NULL CHECK (preco_centavos > 0),
    custos_centavos  BIGINT       NOT NULL CHECK (custos_centavos >= 0),
    extras           JSONB        NOT NULL DEFAULT '{}',
    PRIMARY KEY (investimento_id, posicao)
);

-- Configuração do app: uma linha por conta.
CREATE TABLE configuracoes (
    usuario_id        UUID         PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
    formas_pagamento  JSONB        NOT NULL,
    cartoes           JSONB        NOT NULL DEFAULT '[]',
    destino_sobra     JSONB,
    ultimo_backup_em  TIMESTAMPTZ,
    atualizado_em     TIMESTAMPTZ  NOT NULL,
    recebido_em       TIMESTAMPTZ  NOT NULL,
    extras            JSONB        NOT NULL DEFAULT '{}'
);
