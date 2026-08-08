# Arquitetura atual do V8

## Stack

**[Confirmado]** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind 4, Radix/shadcn, Zod, Supabase JS, Vitest e Vercel Analytics. A aplicação é uma web app renderizada por Next, não um app Android nativo.

## Camadas

1. Páginas Next selecionam o Lab (`/`, `/regency`, `/rules`, `/read`, `/grammar`).
2. Componentes e hooks mantêm o estado de UI e acessam IndexedDB/localStorage.
3. Rotas `/api` validam payload, origem, tamanho e limite por IP, chamando OpenRouter ou Supabase.
4. A sincronização gera operações pontuais idempotentes (protocolo multiwriter v3) e as envia à tabela `vocablab_sync_operations` no Supabase.

## Persistência local

| Banco IndexedDB | Versão | Stores principais | Índices principais |
|---|---:|---|---|
| `vocab-lab-db` | 6 | `flashcards`, `folders`, `catalogMeta` | `word_pos` (unique: word + partOfSpeech), `createdAt`, `folderId`, `catalogId` |
| `regencylab-db` | 2 | `cards`, `folders`, `catalogMeta` | `term`, `createdAt`, `folderId`, `catalogId` |
| `rulelab-db` | 3 | `cards`, `folders`, `theoryDocuments`, `catalogMeta` | `createdAt`, `folderId`, `kind` |
| `readlab-db` | 1 | `texts`, `folders` | `createdAt`, `folderId` |
| `vocab-lab-grammar-db` | 2 | `questions`, `answered`, `grammarFolders`, `grammarLists` | `topic`, `createdAt`, `folderId` |
| `vocablab-auto-sync-db` | 1 | `baselines` | `key` (`syncCode:lab`) |

### Chaves de `localStorage` observadas

- **Global**: `vocablab_sync_code`, `vocablab_sync_status`, `vocablab_color_palette`, `theme`
- **Identity & Devices**: `vocablab_sync_owner_tokens`, `vocablab_sync_device_id`, `vocablab_sync_device_role`
- **Sync & Tombstones**: `vocablab_sync_tombstones`
- **IA & Voz**: `vocablab_include_synonyms_antonyms`, `vocablab_synonyms_display_count`, `vocablab_include_conjugations`, `vocablab_include_alternative_forms`, `vocablab_include_usage_note`, `vocablab_show_context`, `vocablab_context_in_portuguese`, `vocablab_show_ipa`, `vocablab_show_grammatical_form`, `vocablab_efomm_mode`, `vocablab_include_multiple_translations`, `vocablab_show_manual_optional_fields`, `vocablab_show_regenerate_audio_button`, `vocablab_use_ai_predictions`, `vocablab_pronunciation_voice`
- **Study & Review**: `vocablab_study_review_mistake_threshold`, `vocablab_study_header_start_collapsed`, `vocablab_study_shortcut_coach_dismissed`
- **Por Lab**: `vocablab_folder_colors`, `regencylab_folder_colors`, `rulelab_folder_colors`, `readlab_folder_colors`

**[Problema conhecido]** O estado está fragmentado entre seis IndexedDBs e mais de 25 chaves de `localStorage`, o que dificulta transações atômicas, testes integrados e sincronização unificada.

## Segurança e limites

- **[Confirmado]** Rotas de IA têm validação de origem (`Origin` header contra `NEXT_PUBLIC_SITE_URL` e `localhost`), tamanho do payload (máx 10 MB geral, 1 MB em JSON parse), modelo permitido (whitelist em `api-security.ts`) e rate limit em memória por IP (30 req/min padrão).
- **[Problema conhecido]** Rate limit em memória não é distribuído (inútil em ambiente serverless multi-instância).
- **[Problema conhecido]** Não há autenticação real de usuário para chamadas de IA; a proteção depende apenas da origem e do segredo mantido no servidor.
- **[Redesenhar]** Classic deve usar autenticação JWT/OAuth, quotas centralizadas por conta, rate limit distribuído (Redis/Upstash) e auditoria de consumo.

## Catálogos instalados

- **VocabLab**: `Phrasal Verbs Essentials` (v6), `Idioms Essentials` (v3), `False Cognates Essentials` (v3).
- **RegencyLab**: `Regency Essentials` (v4).

Os catálogos usam hash de conteúdo (`vocabCatalogContentHash`, etc.) para permitir atualizações sem sobrescrever edições feitas pelo usuário.

## Testes automatizados no V8

**[Confirmado]** Suíte em Vitest: 11 arquivos de teste, 40 testes unitários cobrindo:
- Lógica de failover do Granite
- Validação do toggle de derivações da IA
- Normalização e parsing de schemas de sync
- Operações de diff/apply e resolução de conflitos
- Validação de catálogos locais (False Cognates, Regency)
- Regras de formatação de títulos de Review e preferências de estudo
