# AGENTS.md sugerido para o VocaLab Classic

## Missão

Construir o VocaLab Classic como produto web e aplicativo Android nativo, offline-first, compatível com a importação do VocabLab V8.

## Fonte de verdade

1. Leia `START_HERE.md`.
2. Para regras de produto, prefira `docs/PRODUCT.md`, `docs/labs/` e `docs/study/`.
3. Para arquitetura futura, prefira `docs/ARCHITECTURE_V2_REQUIREMENTS.md`; não replique automaticamente `ARCHITECTURE_CURRENT.md`.
4. Consulte `docs/DECISIONS.md` antes de assumir uma decisão pendente.
5. Consulte `docs/DATA_MODEL.md` e `specifications/` antes de criar ou alterar schemas.

## Restrições

- Não misture entidades de Labs diferentes.
- Não duplique o card original para formar Review: Review é uma fila/relação virtual.
- Não faça chamadas de derivação quando o toggle estiver desligado.
- Nunca persista HTML arbitrário em Theory; o modelo é JSON de blocos com segmentos tipados.
- Toda mutação sincronizável precisa de ID estável, relógio de conflito e tombstone.
- O app deve funcionar offline; IA e sync podem degradar sem bloquear leitura e estudo.
- Não descarte dados desconhecidos de uma exportação V8: preserve-os em quarentena para diagnóstico.
- Unicidade técnica de Flashcard usa `word` (case-insensitive) + `partOfSpeech`; não crie card duplicado da mesma classe.
- Tombstone mais recente sempre vence em qualquer resolução de conflito.
- Catálogos Essentials são atualizados por `catalogId + catalogRevision`; edições do usuário não devem ser sobrescritas.

## Qualidade mínima por mudança

- Atualizar tipos/schema e migração juntos.
- Testar regra pura e integração de persistência.
- Verificar desktop, 360 px e Android.
- Rodar typecheck, testes e build de produção.
- Registrar decisões arquiteturais novas em `docs/DECISIONS.md`.

## Padrões de nomenclatura

- Entidades: português nos docs, inglês no código.
- Keys localStorage: prefixo `vocablab_` ou `regencylab_` ou `rulelab_`.
- Eventos: `CustomEvent` com nomes descritivos (ex: `vocablab-flashcards-updated`).
- IDs: UUID v4 gerados no cliente via `crypto.randomUUID()`.
