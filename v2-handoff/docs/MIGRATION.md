# Exportação e migração V8 → VocaLab Classic

## Formato de exportação do V8

**[Confirmado]** O VocabLab V8 gera backups em arquivo `.json` com a estrutura `SyncSnapshot` (versão 2 do schema).

```json
{
  "version": 2,
  "exportedAt": 1770000000000,
  "databases": {
    "vocab-lab-db": {
      "flashcards": [ /* array de Flashcard */ ],
      "folders": [ /* array de Folder */ ],
      "catalogMeta": [ /* metadados dos catálogos */ ]
    },
    "regencylab-db": { "cards": [], "folders": [], "catalogMeta": [] },
    "rulelab-db": { "cards": [], "folders": [], "theoryDocuments": [], "catalogMeta": [] },
    "readlab-db": { "texts": [], "folders": [] },
    "vocab-lab-grammar-db": { "questions": [], "answered": [], "grammarFolders": [], "grammarLists": [] }
  },
  "preferences": {
    "vocablab_include_synonyms_antonyms": "true",
    "vocablab_study_review_mistake_threshold": "2",
    "vocablab_color_palette": "blue"
  },
  "syncTombstones": {
    "vocab": [ { "id": "flashcards:card-1", "storeName": "flashcards", "entityId": "card-1", "deletedAt": 1769000000000 } ],
    "regency": [],
    "rule": [],
    "read": [],
    "question": []
  }
}
```

## Dados EXCLUÍDOS da exportação comum

Por razões de privacidade e segurança, o backup V8 **não** inclui:
- Segredos ou chaves de API (`OPENROUTER_API_KEY`).
- Tokens proprietários de sincronização (`vocablab_sync_owner_tokens`).
- Identificadores de dispositivo (`vocablab_sync_device_id`).
- Blobs binários de áudio ou caches temporários de fala (apenas a propriedade `audioSrc` se for URL/caminho).

## Pipeline de importação no VocaLab Classic

O futuro aplicativo VocaLab Classic deve seguir este algoritmo de migração ao carregar um backup do V8:

```
[ Seleção do arquivo JSON V8 ]
              │
              ▼
[ Validação de Envelope e Schemas Zod ] ──(inválido)──► [ Rejeição com erro detalhado ]
              │
              ▼
[ Análise de Dados e Relatório de Prévia ]
 (Exibe contagem de cards, pastas, fichas teóricas, órfãos e conflitos esperados)
              │
              ▼
[ Confirmação do Usuário + Backup Automático Classic ]
              │
              ▼
[ Normalização de Registros Legados ]
  ├─ RuleFolder sem 'kind' → define kind = "cards"
  ├─ Timestamps ausentes → atribui timestamp de migração (preserva ordem)
  └─ Preservar campos desconhecidos em 'legacyPayload' ou arquivo de quarentena
              │
              ▼
[ Reconciliação de Entidades ]
  ├─ Aplica Tombstones primeiro (impede ressurreição de excluídos)
  ├─ Conciliação VocabLab por ID e por 'word + partOfSpeech'
  └─ Reconciliação de Catálogos por 'catalogId' e versão
              │
              ▼
[ Gravação Transacional no Banco Classic ]
              │
              ▼
[ Emissão de Relatório de Migração ]
```

## Garantias de preservação de dados

1. **Sem perda de campos desconhecidos**: Se o V8 tiver campos de versões futuras ou customizados, o Classic deve mantê-los em um objeto genérico de quarentena ou anexados à entidade.
2. **Sem alteração de natureza**: Fichas teóricas (Theory) **nunca** devem ser convertidas em cards de flashcard e vice-versa.
3. **Sem chamadas externas**: A importação é uma operação 100% offline e local; nenhuma API de IA ou rede deve ser invocada.
4. **Sem duplicação de Review**: O estado de Review é uma propriedade virtual do card (`isReviewFolder: true`); a importação não deve criar cópias físicas de cards para representar o Review.
