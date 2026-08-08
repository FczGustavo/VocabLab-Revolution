# Relatório da auditoria em duas passagens

## Passagem 1 — Inventário
Foram auditados no repositório do V8:
- **Rotas de aplicação**: 5 módulos funcionais (`/`, `/regency`, `/rules`, `/read`, `/grammar`).
- **Rotas de API**: 13 subdiretórios em `/api/ai`, 6 em `/api/sync`, 2 em `/api/grammar` e 5 em `/api/readlab`.
- **Armazenamento local**: 6 bancos IndexedDB (`vocab-lab-db` v6, `regencylab-db` v2, `rulelab-db` v3, `readlab-db` v1, `vocab-lab-grammar-db` v2, `vocablab-auto-sync-db` v1) e mais de 25 chaves em `localStorage`.
- **Persistência remota**: Migrações Supabase SQL (`vocablab_sync_operations`, `vocablab_sync_vocab`, etc.).
- **Suíte de testes**: Vitest rodando 11 arquivos de teste com 40 testes unitários.

## Passagem 2 — Confronto e Verificação

As afirmações da documentação inicial foram diretamente confrontadas com o código-fonte TypeScript:
1. **Toggle de derivações da IA**: **Confirmado**. O teste `lib/openai-derivation-toggle.test.ts` e o código em `lib/flashcard-create.ts` comprovam que, se `includeAlternativeForms !== true`, as chamadas de revisão lexicográfica e validação de derivações são omitidas.
2. **Review Virtual**: **Confirmado**. O código em `hooks/use-flashcards-db.ts` e `components/flashcards-page.tsx` demonstra que o Review é uma tag/propriedade (`isReviewFolder: true`) aplicada ao card original na sua pasta de origem.
3. **Multiwriter vs "Somente Estudo"**: **Confirmado**. Em `lib/sync-device.ts` (L54-58), a função `isSyncStudyOnly()` retorna incondicionalmente `false`. A sincronização trata todos os dispositivos pareados como leitores e escritores.
4. **Resolução de Conflitos em VocabLab**: **Confirmado**. O código em `lib/auto-sync-client.ts` (L304-326) trata conflitos entre cards criados simultaneamente com a mesma combinação `word + partOfSpeech`, mantendo o mais recente para não violar o índice único do IndexedDB.

## Execução da suíte de testes

Comando executado: `npx vitest run`
- **Resultado**: 11 arquivos de teste aprovados, 40 testes passando.
- **Avisos detectados (Warnings)**: Foram identificados dois avisos do compilador Vite/Esbuild apontando um `case "idiom"` duplicado/inatingível no arquivo `lib/openai.ts` (linhas 353 e 381).

## Lacunas de cobertura de testes no V8

- Sem testes automatizados de ponta a ponta (E2E) simulando navegadores reais.
- Sem testes integrados de IndexedDB rodando em ambiente de browser sintético.
- Sem testes automatizados para chamadas de IA reais no OpenRouter (todos utilizam mocks).
- Sem testes de sincronização em tempo real entre dois navegadores distintos.
