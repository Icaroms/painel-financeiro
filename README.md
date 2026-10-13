# Painel Financeiro

App pessoal que avalia cada gasto no momento do registro e responde na hora se ainda há margem no mês.

## Tecnologias

**App (front)**
- HTML, CSS e JavaScript puro
- IndexedDB (dados salvos no próprio aparelho, funciona sem internet)
- PWA instalável no iPhone
- Testes com o executor nativo do Node (`node --test`)

**API (backend, pasta [`backend/`](backend/README.md))**
- Java 21 e Spring Boot
- PostgreSQL com migrações Flyway
- Login com BCrypt e token JWT
- Testes com JUnit 5 e PostgreSQL embutido

**Automação**
- GitHub Actions: robô diário do Radar de opções e testes do backend

## Como rodar

| O quê | Pasta | Comando |
|---|---|---|
| App em modo dev | raiz | `npm run dev` → http://localhost:8080 |
| Testes do app | raiz | `npm test` |
| API em modo dev | `backend` | `rodar-dev` → http://localhost:8081 |
| Testes da API | `backend` | `testar` |

Detalhes da API (rotas, variáveis de ambiente, segurança): [backend/README.md](backend/README.md).

## Fases

| Fase | Assunto | Situação |
|---|---|---|
| 01 | MVP: gastos, categorias, fixos e veredito | Concluída |
| 02 | Cartões de crédito e faturas | Concluída |
| 03 | IA (Gemini) que explica os números | Concluída |
| 04 | Investimentos, Radar de opções e alertas da Receita | Concluída |
| 05 | Backend (Spring Boot + PostgreSQL), sincronização e hospedagem | Em andamento |

## Regras do projeto

- As regras do app calculam; a IA só explica.
- Dados financeiros reais nunca vão para o GitHub.
- Segredos (chaves, senhas) ficam só em variáveis de ambiente, nunca no código.
