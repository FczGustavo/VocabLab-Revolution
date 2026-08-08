# VocabLab V8 → VocaLab Classic — ponto de partida

Este pacote descreve o VocabLab V8 observado em 7 de agosto de 2026. Ele permite reconstruir o produto sem este repositório e sem o histórico da conversa. Não é uma especificação para copiar a arquitetura atual literalmente.

## Legenda

- **[Confirmado]** comprovado no código, tipo, armazenamento, configuração ou teste.
- **[Inferido]** conclusão consistente, mas sem teste ou regra explícita.
- **[Problema conhecido]** comportamento defeituoso ou frágil observado na auditoria.
- **[Decisão pendente]** requer escolha de produto/arquitetura antes de implementar.
- **[Preservar]** comportamento valioso do V8 que deve ser mantido.
- **[Redesenhar]** objetivo a manter com implementação nova.

## O que ler

| Tarefa | Leia primeiro |
|---|---|
| Entender o produto | `docs/PRODUCT.md`, depois o Lab em `docs/labs/` |
| Implementar um Lab | `docs/labs/<lab>.md`, `docs/DATA_MODEL.md`, `docs/acceptance/<lab>.md` |
| Implementar Study/Review | `docs/study/STUDY.md`, `REVIEW.md`, `PROGRESS.md` |
| Implementar IA | `docs/AI_SYSTEM.md`, `docs/SETTINGS.md`, `specifications/ai-config.schema.json` |
| Implementar sync/offline | `docs/SYNC_SYSTEM.md`, `docs/MIGRATION.md`, `specifications/sync-snapshot.schema.json` |
| Criar app mobile | `docs/ARCHITECTURE_V2_REQUIREMENTS.md`, `docs/DESIGN_SYSTEM.md` |
| Migrar dados V8 | `docs/MIGRATION.md`, `docs/DATA_MODEL.md`, schemas JSON em `specifications/` |
| Planejar desenvolvimento | `docs/ROADMAP.md`, `docs/DECISIONS.md`, `AGENTS_TEMPLATE.md` |
| Ver evidências e lacunas | `docs/AUDIT_REPORT.md` |
| Implementar ReadLab → VocabLab | `docs/labs/READLAB.md`, `docs/labs/VOCABLAB.md` |
| Implementar QuestionLab | `docs/labs/QUESTIONLAB.md` (confirmar decisão pendente primeiro) |
| Entender persistência local | `docs/DATA_MODEL.md`, `specifications/` |
| Entender segurança | `docs/AI_SYSTEM.md` (seção segurança), `docs/SYNC_SYSTEM.md` |

## Regra de reconstrução

Use `docs/ARCHITECTURE_V2_REQUIREMENTS.md` como contrato do futuro produto e `docs/ARCHITECTURE_CURRENT.md` apenas como evidência do V8. Preserve regras, dados e expectativas; redesenhe infraestrutura, autenticação, segurança, sincronização e testes.

## Estado da auditoria — 7 ago 2026

- **[Confirmado]** `vitest run`: 11 arquivos, 40 testes, todos aprovados.
- **[Problema conhecido]** Os testes emitem dois avisos de `case "idiom"` duplicado em `lib/openai.ts` (linhas 353 e 381).
- **[Problema conhecido]** Comentário em `.env.example` (L38-39) diz que a revisão lexicográfica revisa "cada card gerado"; o código e o teste provam que só ocorre quando derivações estão ligadas.
- **[Decisão pendente]** Nome escolhido é **VocaLab Classic**; identidade visual, package id e domínio ainda não estão definidos.

## Estimativa de tokens

Uma conversa nova que carregue apenas este `START_HERE.md` (≈1100 tokens) pode decidir qual path seguir. Para iniciar qualquer tarefa de implementação, os documentos requeridos totalizam:

| Path típico | Docs a ler | Tokens aprox. |
|---|---|---:|
| Produto + 1 Lab | PRODUCT, labs/X, acceptance/X, DATA_MODEL | ~5 000 |
| Study/Review | study/*, PRODUCT | ~3 500 |
| IA completa | AI_SYSTEM, SETTINGS, ai-config.schema | ~4 000 |
| Sync completa | SYNC_SYSTEM, MIGRATION, schemas sync | ~5 500 |
| Todo o pacote (todas docs) | todos os .md + schemas JSON | ~25 000 |

## Índice de arquivos

```
v2-handoff/
├── START_HERE.md              ← você está aqui
├── AGENTS_TEMPLATE.md         ← regras sugeridas para AGENTS.md do Classic
├── docs/
│   ├── PRODUCT.md             ← produto, mapa funcional, princípios
│   ├── ROADMAP.md             ← fases de transição
│   ├── ARCHITECTURE_CURRENT.md ← evidência do V8: stack, bancos, segurança
│   ├── ARCHITECTURE_V2_REQUIREMENTS.md ← contrato para o Classic
│   ├── DECISIONS.md           ← decisões definidas e pendentes
│   ├── DATA_MODEL.md          ← entidades, campos, identidade, tipos
│   ├── MIGRATION.md           ← exportação V8 e importação Classic
│   ├── DESIGN_SYSTEM.md       ← tokens, paletas, responsividade, mobile
│   ├── AI_SYSTEM.md           ← chamadas, modelos, toggles, fallbacks, segurança
│   ├── SYNC_SYSTEM.md         ← identidade, protocolo, conflitos, requisitos
│   ├── SETTINGS.md            ← configurações por escopo, defaults, portabilidade
│   ├── AUDIT_REPORT.md        ← resultado das duas passagens
│   ├── labs/
│   │   ├── VOCABLAB.md        ← cards lexicais, identidade, criação, catálogos
│   │   ├── REGENCYLAB.md      ← regência/collocations, formulário, Study
│   │   ├── RULELAB.md         ← Cards e Theory, editor, divisórias
│   │   ├── READLAB.md         ← textos, OCR, traduções, integração Vocab
│   │   └── QUESTIONLAB.md     ← questões A–E, tópicos, cache
│   ├── study/
│   │   ├── STUDY.md           ← modos, semântica Again, finalização
│   │   ├── REVIEW.md          ← fila virtual, entrada por limiar, saída
│   │   └── PROGRESS.md        ← sessões, métricas, reset, limitações
│   └── acceptance/
│       ├── VOCABLAB.md        ← critérios de aceite VocabLab
│       ├── REGENCYLAB.md      ← critérios de aceite RegencyLab
│       ├── RULELAB.md         ← critérios de aceite RuleLab
│       ├── READLAB.md         ← critérios de aceite ReadLab
│       ├── QUESTIONLAB.md     ← critérios de aceite QuestionLab
│       └── TRANSVERSAL.md     ← critérios transversais: sync, IA, UI
└── specifications/
    ├── ai-config.schema.json        ← todas as variáveis de modelo
    ├── study-session.schema.json    ← sessão Study persistida
    ├── sync-operation.schema.json   ← operação idempotente
    ├── sync-snapshot.schema.json    ← snapshot V8 para importação
    ├── theory-document.schema.json  ← documento Theory estruturado
    ├── flashcard.schema.json        ← card VocabLab completo
    ├── regency-card.schema.json     ← card RegencyLab
    ├── readlab-text.schema.json     ← texto ReadLab
    └── grammar-question.schema.json ← questão QuestionLab A–E
```
