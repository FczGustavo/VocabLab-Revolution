# Modelo de dados do V8

Os schemas JSON em `specifications/` são a definição independente de código. Durante qualquer migração ou sincronização, campos não reconhecidos devem ser preservados sem alteração.

## Entidades e tipos por Lab

### VocabLab (`Flashcard`)

**[Confirmado]** Definição em `lib/types.ts`:
- `id`: string (UUID v4)
- `word`: string
- `partOfSpeech`: `"verb" | "phrasal-verb" | "noun" | "adjective" | "adverb" | "preposition" | "conjunction" | "interjection" | "acronym" | "idiom"`
- `grammaticalForm`?: `"base-form" | "comparative" | "superlative" | "plural" | "past" | "past-participle" | "present-participle" | "third-person-singular"`
- `translation`: string
- `ipa`?: string
- `usageNote`?: string (PT-BR)
- `usageNoteEn`?: string (EN)
- `synonyms`: `ClassifiedWord[]` (`{ word: string, type: "literal" | "figurative" | "slang" | "abstract" }`)
- `antonyms`: `ClassifiedWord[]`
- `example`: string (EN)
- `exampleTranslation`?: string (PT-BR)
- `alternativeForms`: `AlternativeForm[]` (`{ word, partOfSpeech, grammaticalForm?, translation, example, usageNote?, usageNoteEn?, ipa? }`)
- `conjugations`?: `{ simplePresent, simplePast, presentContinuous, pastContinuous, presentPerfect, pastPerfect }`
- `verbType`?: `"regular" | "irregular"`
- `falseCognate`?: `{ isFalseCognate: boolean, warning: string, warningEn?: string }`
- `aiEnriching`?: boolean
- `folderId`: string | null
- `isReviewFolder`?: boolean
- `studyStreak`?: number
- `audioSrc`?: string
- `familyKey`?: string
- `usageStatus`?: `"current" | "rare" | "archaic"`
- `catalogId`?: string
- `catalogRevision`?: number
- `catalogContentHash`?: string
- `createdAt`: number (timestamp ms)
- `updatedAt`?: number (timestamp ms)

**[Preservar]** A unicidade técnica no IndexedDB usa o índice `word_pos` (`[word.toLowerCase(), partOfSpeech]`). Grafias iguais em classes distintas geram cards distintos. Sentidos diferentes da mesma classe ficam no mesmo card.

### RegencyLab (`RegencyCard`)

- `id`: string (UUID v4)
- `term`: string (palavra-chave, ex: "depend")
- `category`: `"verb" | "adjective" | "noun"`
- `grammaticalForm`?: `GrammaticalForm`
- `pattern`: string (ex: "depend on + noun/gerund")
- `complement`: `"infinitive" | "gerund" | "noun" | "clause" | "prepositional-phrase" | "other"`
- `example`: string (EN)
- `exampleTranslation`?: string (PT-BR)
- `meaningPt`?: string (explicação do uso em PT-BR)
- `contrastPt`?: string (contraste com regências similares do mesmo termo)
- `isReviewFolder`?: boolean
- `studyStreak`?: number
- `catalogId`?: string
- `catalogRevision`?: number
- `catalogContentHash`?: string
- `folderId`: string | null
- `createdAt`: number
- `updatedAt`: number

### RuleLab

#### Pastas (`RuleFolder`)
- `id`: string
- `name`: string
- `kind`: `"cards" | "theory"` (**[Confirmado]** Registros antigos sem `kind` devem ser interpretados como `"cards"`)
- `createdAt`: number
- `updatedAt`?: number

#### Cards Manuais (`RuleCard`)
- `id`: string
- `front`: string
- `back`: string
- `folderId`: string
- `isReviewFolder`?: boolean
- `studyStreak`?: number
- `createdAt`: number
- `updatedAt`: number

#### Fichas Teóricas (`RuleTheoryDocument`)
- `id`: string
- `folderId`: string
- `title`: string (máx 200 caracteres)
- `blocks`: `RuleTheoryBlock[]` (máx 500 blocos)
  - `id`: string
  - `type`: `"title" | "subtitle" | "paragraph" | "rule" | "example" | "exception" | "tip" | "bulleted-list" | "numbered-list" | "divider"`
  - `align`?: `"left" | "center" | "right"`
  - `fontFamily`?: `"sans" | "serif" | "mono"`
  - `fontSize`?: `"small" | "normal" | "large"`
  - `segments`?: `RuleTheoryTextRun[]` (`text`, `bold?`, `italic?`, `underline?`, `fontFamily?`, `fontSize?`, `color?`, `highlight?`)
  - `items`?: `RuleTheoryTextRun[][]` (para listas)
- `createdAt`: number
- `updatedAt`: number

### ReadLab (`ReadLabText`)

- `id`: string
- `title`: string
- `content`: string
- `sourceType`: `"paste" | "image" | "pdf"`
- `folderId`: string | null
- `tags`: `("reading" | "read" | "pending")[]`
- `highlights`: `{ id: string, text: string, color: string }[]`
- `translationMap`: `Record<string, string>` (palavra isolada → tradução)
- `contextualTranslationMap`?: `Record<string, string>` (ocorrência no contexto → tradução)
- `createdAt`: number
- `updatedAt`?: number

### QuestionLab (`GrammarQuestion`)

- `id`: string
- `topic`: string
- `subtopic`?: string
- `questionText`: string
- `contextPassage`?: string
- `questionType`: `"correct" | "incorrect"`
- `options`: `{ letter: "A"|"B"|"C"|"D"|"E", text: string, isAnswer: boolean, explanation: string }[]`
- `createdAt`: number
- `updatedAt`?: number

### Progresso de Estudo (`StudySession`)

- `id`: string
- `date`: number
- `lab`: `"vocab" | "regency" | "rule"`
- `mode`: `"flip" | "multiple-choice" | "active-recall" | "writing"`
- `folderId`: string | null
- `folderName`: string
- `totalCards`: number
- `correctFirstTry`: number
- `wordsToReview`: string[]
- `mistakeCards`: number
- `totalMistakes`: number
- `cardIds`: string[]
- `durationSeconds`: number

### Tombstones (`SyncTombstone`)

- `id`: string (`"operation:storeName:entityId:deletedAt"`)
- `storeName`: string
- `entityId`: string
- `deletedAt`: number (timestamp ms)
