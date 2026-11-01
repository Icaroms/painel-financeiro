package com.icaroms.painel.backup;

import java.util.List;

/**
 * Resposta do GET /api/backups.
 *
 * @param backups           do mais novo para o mais antigo
 * @param maximo            quantos backups a conta guarda
 * @param tamanhoMaximoBytes o app confere o tamanho antes de enviar
 */
public record ListaDeBackups(List<BackupResumo> backups, int maximo, long tamanhoMaximoBytes) {
}
