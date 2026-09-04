# Aceitação — sistemas transversais

## Sync e migração

- A implementação V8 quebrada não é baseline de aceitação; o Classic deve demonstrar convergência própria.
- Duas criações offline simultâneas sobrevivem; edições do mesmo item convergem; exclusão não ressurge.
- Todos os dispositivos têm escrita e exibem a mesma contagem de Review após convergência.
- Revogar dispositivo bloqueia novos pulls/pushes.
- Importação V8 é idempotente, sem IA/rede, com prévia, quarentena e rollback.
- Testes E2E usam pelo menos dois bancos locais independentes e um servidor real de teste, incluindo reinício durante o envio.

## Configurações e IA

- Preferências têm escopo/default/schema; segredo nunca é exportado.
- Cada capability registra modelo, tokens, custo, latência, fallback e erro seguro.
- Offline mantém criação manual, leitura e Study; ações de IA ficam retryable.

## UI e qualidade

- 360 px, tablet e desktop; claro/escuro; fonte 200%; reduced motion; teclado e screen reader.
- Sem overflow horizontal; scroll longo alcançável mesmo com scrollbar oculta.
- Typecheck, unit, integração de banco, contrato API, E2E e build passam.
