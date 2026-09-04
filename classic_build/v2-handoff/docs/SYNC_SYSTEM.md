# Sincronização do V8

> **[Problema conhecido crítico — 8 ago 2026]** A sincronização continua quebrada no uso real. Esta página descreve a implementação e a intenção encontradas no código; não certifica convergência em produção. O VocaLab Classic deve reconstruir e testar o mecanismo, não portar este cliente como solução pronta.

## Identidade e pareamento

**[Confirmado como desenho do código]** O modelo de sincronização foi criado para múltiplos dispositivos compartilharem o mesmo acervo através de um código (`syncCode`) e um token proprietário (`ownerToken`). O funcionamento ponta a ponta não está confirmado.

### Fluxo de pareamento
1. Dispositivo A cria/reivindica um `syncCode` (ex: `my-deck-1234`) via `/api/sync/claim`. O servidor gera um `ownerToken` mantido em `localStorage` (`vocablab_sync_owner_tokens`).
2. Para conectar o Dispositivo B, Dispositivo A gera um código temporário de 6 dígitos via `/api/sync/pair/start`.
3. Dispositivo B digita o código em `/api/sync/pair/complete`, recebendo autorização e seu próprio `ownerToken`.
4. Cada dispositivo registra seu ID (`deviceId` UUID v4), tipo (`mobile | tablet | desktop | unknown`) e nome amigável do navegador em `vocablab_sync_devices`.

### Multiwriter e papéis legados
**[Confirmado no código]** A função `isSyncStudyOnly()` sempre retorna `false`. Embora os tipos e o backend suportem o papel `"study"`, o cliente pretende permitir leitura e escrita em todos os dispositivos. **[Não confirmado no produto]** Essa permissão não significa que os dados sincronizem corretamente; a convergência segue quebrada no uso real.

## Protocolo de operações

Há três versões diferentes: snapshot completo versão `2`, payload individual de Lab versão `1` e baseline/protocolo operacional do cliente `OPERATION_PROTOCOL = 4`.

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
- `synced`: O cliente acredita ter concluído o ciclo; devido ao problema atual, esse estado não garante igualdade dos dados entre dispositivos.
- `offline`: Dispositivo sem conexão de rede.
- `conflict`: Estado de atenção/conflito reportado pelo cliente; não comprova que houve resolução correta.
- `error`: Falha de autenticação, erro de schema ou servidor indisponível.

## Deficiências e riscos no V8

- **Falha funcional observada**: Mesmo com poucos dispositivos, o produto pode repetir alertas, divergir contagens e não convergir. A causa final não está certificada por teste E2E.
- **Dependência do relógio do cliente**: Se um dispositivo estiver com a data/hora incorreta no SO, pode sobrescrever edições legítimas ou ter suas alterações ignoradas.
- **Payload inicial pesado**: Em novas conexões sem baseline, a migração inicial puxa snapshots inteiros legados antes de alternar para o modo de operações.

## Preservar como objetivo, não como implementação

- IDs estáveis por entidade, operações pequenas e idempotentes, tombstones, identificação/revogação de dispositivos e exportação independente do transporte.

## Redesenhar e provar no Classic

- Backend canônico autenticado e cursor ordenado pelo servidor.
- Revisões/HLC que não dependam apenas do relógio local.
- Outbox durável com estados pending, sent, acknowledged e failed.
- Pull incremental paginado, retomável e idempotente.
- Compactação e retenção de operações/tombstones.
- Diagnóstico com último push, pull, cursor, pendências e erro real.
- Testes com clientes reais: offline, reconexão, edição concorrente, exclusão, revogação e igualdade da contagem de Review.

A sincronização só poderá ser marcada como concluída quando testes automatizados multi-dispositivo provarem convergência das entidades e métricas derivadas. Testes unitários de merge, isoladamente, não bastam.
