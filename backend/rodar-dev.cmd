@echo off
rem ==================================================================
rem  Painel Financeiro API - modo dev
rem
rem  Sobe a API em http://localhost:8081 com um PostgreSQL embutido
rem  (nao precisa instalar banco). Os dados ficam em backend\.banco-dev
rem
rem  Como usar: dentro da pasta backend, digite  rodar-dev
rem  Para parar: Ctrl + C (e responda S se perguntar)
rem
rem  Conta de desenvolvimento: dev@painel.local / senha-dev-123456
rem  Swagger: http://localhost:8081/swagger-ui.html
rem ==================================================================
cd /d "%~dp0"
call mvnw.cmd spring-boot:test-run -Dspring-boot.run.main-class=com.icaroms.paineldev.PainelApiDev
