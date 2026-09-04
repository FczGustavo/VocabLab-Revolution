# Sistema de IA

## Transporte, segurança e modelos

**[Confirmado]** Todas as chamadas do cliente passam por rotas serverless Next.js (`/api/ai/*`) e são encaminhadas à API OpenRouter. A chave `OPENROUTER_API_KEY` reside exclusivamente no servidor.

### Proteções das rotas API (`lib/api-security.ts`)
- **Origem**: Valida o cabeçalho `Origin` contra `NEXT_PUBLIC_SITE_URL` e `localhost` em dev (status 403 se inválido).
- **Tamanho**: Limite global de 10 MB no header `content-length` e 1 MB para payloads JSON em rotas especificas (status 413 se violado).
- **Rate limit**: Limite de 30 solicitações por minuto por IP em memória (status 429 com `Retry-After`).
- **Whitelist de modelos**: A função `resolveAllowedAiModel` valida se o modelo solicitado pelo cliente está na lista de permitidos (`BUILTIN_ALLOWED_MODELS` + variáveis de ambiente `*_AI_MODEL`).

## Tabela de modelos e capacidades

| Função | Variável de Ambiente | Model Default Auditado | Fallback / Observações |
|---|---|---|---|
| Fallback geral | `DEFAULT_AI_MODEL` / `NEXT_PUBLIC_DEFAULT_AI_MODEL` | `google/gemini-3.1-flash-lite` | — |
| VocabLab: Autocomplete/previsão | `PREDICT_AI_MODEL` | `google/gemini-3.1-flash-lite` | Opcional |
| VocabLab: Revisão lexicográfica | `LEXICOGRAPHER_REVIEW_AI_MODEL` | `google/gemini-3.1-flash-lite` | **[Confirmado por teste]** Só roda se `includeAlternativeForms === true` |
| VocabLab: Geração de derivações | `DERIVATION_AI_MODEL` | `google/gemini-3.1-flash-lite` | Só roda com toggle de derivações ligado |
| VocabLab: Validação de derivações | `VALIDATE_DERIVATIONS_AI_MODEL` | `google/gemini-3.1-flash-lite` | `validateFamilyMembers` em fail-open |
| RegencyLab: Gerador principal | `REGENCY_AI_MODEL` | `google/gemini-3.1-flash-lite` | — |
| RegencyLab: Fallback gerador | `REGENCY_GENERATOR_FALLBACK_MODEL` | `google/gemini-3.1-flash-lite` | Usado em timeout ou rate limit do principal |
| RegencyLab: Revisor estrito | `REGENCY_REVIEW_AI_MODEL` | `google/gemini-3.1-flash-lite` | Sanitiza categoria, pattern e exemplo |
| ReadLab: Processamento de texto | `READLAB_AI_MODEL` | `google/gemini-3.1-flash-lite` | Textos até 20 mil caracteres em lotes |
| ReadLab: Lookup por ocorrência | `READLAB_LOOKUP_AI_MODEL` | `google/gemini-3.1-flash-lite` | Fallback: READLAB_AI_MODEL → DEFAULT_AI_MODEL |
| ReadLab: OCR de imagens | `READLAB_OCR_MODEL` | `google/gemini-3.1-flash-lite` | **Obrigatório modelo com visão** |
| QuestionLab: Gerador de questões | `GRAMMAR_AI_MODEL` | `google/gemini-3.1-flash-lite` | Gera 5 opções A–E |
| QuestionLab: Revisor de questões | `REVISOR_AI_MODEL` | `google/gemini-3.1-flash-lite` | Repete geração 1x se fraca/similar |
| Quizlet PDF Import: OCR | `QUIZLET_IMPORT_OCR_MODEL` | `google/gemini-3.1-flash-lite` | Exige suporte a visão |
| Quizlet PDF Import: Revisão | `QUIZLET_IMPORT_REVIEW_AI_MODEL` | `google/gemini-3.1-flash-lite` | Apenas texto |
| Pronúncia (VocabLab) | `PRONUNCIATION_AI_MODEL` | `openai/gpt-audio-mini` | Voz: `alloy` (pcm16/mp3) |
| Leitura em áudio (ReadLab) | `READLAB_AUDIO_AI_MODEL` | `openai/gpt-audio-mini` | Voz configurável |
| Circuit Breaker Granite | `GRANITE_BACKUP_MODEL` | `sao10k/l3-lunaris-8b` | Ativa após 2 amostras com latência >8s e <8 tok/s. **Inativo em Gemini** (exige prefixo `ibm-granite/`) |

## Pipelines detalhados

### VocabLab
1. Geração central (`/api/ai/flashcard`): recebe `word`, `partOfSpeech` desejada e preferências.
2. Produz tradução, IPA, contextos EN/PT-BR, exemplo/tradução, conjugações, tipo verbal e falso cognato.
3. **[Confirmado por teste `openai-derivation-toggle.test.ts`]**: Se `includeAlternativeForms !== true`, o pipeline ignora a geração de família, revisão lexicográfica (`/api/ai/lexicographer-review`) e validação de derivações (`/api/ai/validate-derivations`), retornando imediatamente.
4. Se o toggle estiver ativo: enriquece família lexical e submete o card à revisão lexicográfica e validação de parentesco.

### RegencyLab
Pipeline em 3 etapas:
1. Tenta o gerador principal (`REGENCY_AI_MODEL`).
2. Se falhar ou atingir timeout/rate limit, usa `REGENCY_GENERATOR_FALLBACK_MODEL`.
3. Submete o resultado ao `REGENCY_REVIEW_AI_MODEL` para garantir que `pattern` e `complement` pertençam à taxonomia válida.

### ReadLab
- Recebe texto colado ou imagem/clipboard (OCR via `READLAB_OCR_MODEL`).
- Processa em lotes de até 20.000 caracteres produzindo `translationMap` e `contextualTranslationMap`.
- Lookup pontual consulta primeiro o cache contextual da sessão; se ausente, faz fallback via IA.
- Áudio de narração usa modelo de áudio sob demanda com cache local.

## Ausência de chamadas de IA (Ações puramente locais)

As seguintes ações **nunca** realizam chamadas de IA e funcionam 100% offline:
- Navegação entre Labs, pastas e visões.
- Edição manual de cards, regras, pastas ou fichas teóricas.
- Criação e edição de fichas teóricas no RuleLab (Theory).
- Sessões de estudo (Study) em todos os modos (flip, choice, recall, writing).
- Filtros, pesquisas globais e organização de Review.
- Exportação e importação de backups V8.
- Operações de sincronização entre dispositivos.
