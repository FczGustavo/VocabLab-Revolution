# Sincronização multi-dispositivo com Supabase

## Configuração do banco

Execute, nesta ordem, as migrações em `supabase/migrations/`:

1. `202607290002_per_lab_autosync.sql`
2. `202607290003_sync_identity_claims.sql`
3. `202608020001_sync_devices.sql`
4. `202608030001_multiwriter_sync_operations.sql`

A última migração cria `vocablab_sync_operations`, o log compartilhado de
alterações. Os snapshots antigos por Lab permanecem no banco apenas como ponte
de migração; não são mais regravados pelo aplicativo atualizado.

## Variáveis de ambiente

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
SYNC_CODE_PEPPER=UM_SEGREDO_ALEATORIO_COM_PELO_MENOS_32_CARACTERES

SUPABASE_SYNC_CLAIMS_TABLE=vocablab_sync_claims
SUPABASE_SYNC_OPERATIONS_TABLE=vocablab_sync_operations
```

Os nomes das tabelas legadas por Lab continuam configuráveis para permitir a
importação automática do estado anterior na primeira sincronização.

## Como funciona

Todos os dispositivos pareados podem criar, editar, mover, apagar e estudar.
Não existe mais dispositivo primário nem modo somente estudo.

Cada mudança vira uma operação pequena e idempotente: criar/editar um card,
mover de pasta, excluir, alterar uma preferência ou registrar uma exclusão.
Ela tem um ID único, data, Lab e entidade afetada. O servidor somente acrescenta
operações; ele não aceita mais que um dispositivo substitua o Lab inteiro.

- Criações simultâneas são preservadas.
- Alterações concorrentes no mesmo registro usam a versão mais recente.
- Exclusões geram tombstones para impedir que um navegador antigo recrie o item.
- Alterações offline aguardam localmente até a conexão voltar.
- O painel de dispositivos identifica e permite desconectar navegadores, sem
  limitar a escrita de nenhum deles.

Na primeira execução do protocolo novo, o navegador lê o snapshot legado, mescla
com seus dados locais e publica o resultado em operações. Isso mantém os dados
já sincronizados durante a atualização.
