@echo off
rem ==================================================================
rem  Painel Financeiro API - testes
rem
rem  Compila o backend e roda todos os testes (PostgreSQL embutido).
rem  Resultado esperado no fim: BUILD SUCCESS
rem
rem  Como usar: dentro da pasta backend, digite  testar
rem ==================================================================
cd /d "%~dp0"
call mvnw.cmd verify
