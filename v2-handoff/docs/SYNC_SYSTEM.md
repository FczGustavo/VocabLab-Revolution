# Sincronização do V8

## Identidade e pareamento

**[Confirmado]** O modelo de sincronização permite a múltiplos dispositivos compartilharem o mesmo acervo através de um código de sincronização (`syncCode`) e um token proprietário (`ownerToken`).

### Fluxo de pareamento
1. Dispositivo A cria/reivindica um `syncCode` (ex: `my-deck-1234`) via `/api/sync/claim`. O servidor gera um `ownerToken` mantido em `localStorage` (`vocablab_sync_owner_tokens`).
2. Para conectar o Dispositivo B, Dispositivo A gera um código temporário de 6 dígitos via `/api/sync/pair/start`.
3. Dispositivo B digita o código em `/api/sync/pair/complete`, recebendo autorização e seu próprio `ownerToken`.
4. Cada dispositivo registra seu ID (`deviceId` UUID v4), tipo (`mobile | tablet | desktop | unknown`) e nome amigável do navegador em `vocablab_sync_devices`.

### Multiwriter e papéis legados
**[Confirmado em `lib/sync-device.ts` L54-58]** A função `isSyncStudyOnly()` sempre retorna `false`. Embora os tipos e o backend suportem o papel `"study"`, **todos os dispositivos pareados possuem permissão total de leitura e escrita** (multiwriter). O Classic não deve reintroduzir restrições de "somente leitura" sem decisão explícita.

## Protocolo de operações (Protocolo v3 multiwriter)

O V8 utiliza um protocolo baseado em delta de operações append-only (`lib/sync-operations.ts`):

- **Laboratórios sincronizados**: `general`, `vocab`, `regency`, `rule`, `read`, `question`.
- **Tipos de operação**:
  - `upsert`: inserção ou atualização de entidade em uma store.
  - `delete`: exclusão de entidade em uma store.
  - `preference-set`: definição de preferência em `localStorage`.
  - `preference-delete`: remoção de preferência.

```json
{
  "operationId": "device-uuid-vocab-hash-timestamp",
  "lab": "vocab",
  "kind": "upsert",
  "storeName": "flashcards",
  "entityId": "id:card-123",
  "value": { "id": "card-123", "word": "example", "updatedAt": 1770000000000 },
  "occurredAt": 1770000000000
}
```

### Resolução de conflitos e Last-Write-Wins
1. **Entidades distintas**: Preservadas e mescladas.
2. **Mesma entidade modificada em dois dispositivos**: O registro com maior timestamp (`updatedAt` ou `occurredAt`) substitui o mais antigo.
3. **Exclusão vs Edição**: Exclusões geram um `SyncTombstone` em `localStorage` (`vocablab_sync_tombstones`). **A exclusão com `deletedAt` mais recente sempre vence a edição**, mesmo se a edição tiver chegado depois na rede.
4. **Relógios de preferência**: Cada preferência mantém um relógio numérico isolado para evitar que preferências antigas sobrescrevam escolhas mais recentes.
5. **Conflito de unicidade de VocabLab**: Se dois dispositivos criarem simultaneamente um card com a mesma combinação `word + partOfSpeech`, o importador (`auto-sync-client.ts` L304-326) retém a versão com timestamp mais recente para evitar a quebra do índice único IndexedDB `word_pos`.

## Disparo e ciclo de vida

- O provider `AutoSyncProvider` escuta eventos de dados (`FLASHCARDS_UPDATED_EVENT`, etc.).
- Um debounce de 900 ms é aplicado antes de iniciar o push/pull.
- Também sincroniza no foco da janela (`window.onfocus`), reconexão de rede (`window.ononline`) e periodicamente.
- Para evitar condições de corrida entre abas do mesmo navegador, o cliente usa `navigator.locks.request("vocablab-sync:code:lab", ...)` quando disponível.

## Estados da sincronização

Exibidos no indicador de status da UI (`AutoSyncState`):
- `idle`: Sem alterações pendentes.
- `connecting`: Negociando com o servidor.
- `synced`: Dados sincronizados com sucesso.
- `offline`: Dispositivo sem conexão de rede.
- `conflict`: Conflito detectado e resolvido automaticamente por Last-Write-Wins.
- `error`: Falha de autenticação, erro de schema ou servidor indisponível.

## Deficiências e riscos no V8

- **Dependência do relógio do cliente**: Se um dispositivo estiver com a data/hora incorreta no SO, pode sobrescrever edições legítimas ou ter suas alterações ignoradas.
- **Payload inicial pesado**: Em novas conexões sem baseline, a migração inicial puxa snapshots inteiros legados antes de alternar para o modo de operações.
