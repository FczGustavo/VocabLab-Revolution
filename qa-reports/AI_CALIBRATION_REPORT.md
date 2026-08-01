# Relatório final de calibração das IAs

Data: 29/07/2026

## Configuração testada

- Geração central do VocabLab: `google/gemini-3.1-flash-lite`
- Revisão do VocabLab: `google/gemini-3.1-flash-lite`
- Geração do RegencyLab: `google/gemini-3.1-flash-lite`
- Revisão do RegencyLab: `google/gemini-3.1-flash-lite`
- Processamento e lookup do ReadLab: `google/gemini-3.1-flash-lite`
- Áudio do VocabLab e ReadLab: `openai/gpt-audio-mini`

## Resultado consolidado

### VocabLab

- 20/20 entradas aprovadas.
- Cobertura: noun, verb, adjective, adverb, preposition, conjunction, interjection, acronym, idiom, phrasal verb, plural, comparative, superlative, past, past participle, present participle e third-person singular.
- Foram validados tradução, segunda tradução, exemplo, tradução do exemplo, contexto PT/EN, IPA, conjugações, sinônimos, antônimos e formas lexicais.
- Casos sensíveis aprovados: `wrote`, `written`, `greatest`, `better`, `children`, `mice`, `across`, `scarcely`, `take for granted` e `run into`.

### RegencyLab

- 20/20 famílias aprovadas na rodada consolidada.
- Validados: padrão, objeto obrigatório, complemento, categoria, forma gramatical, exemplo, tradução, significado e contraste.
- Respostas vazias ou JSON inválido agora acionam novas tentativas.
- Casos sensíveis confirmados: `accuse`, `depend`, `prevent`, `remind`, `provide`, `belong`, `consist`, `succeed` e `aim`.
- Os exemplos são modernos e neutros; “Regency” não é mais interpretado como a era histórica.

### ReadLab

- Texto testado: 107 palavras.
- Cobertura das palavras significativas: 100%.
- Lookup contextual: 20/20.
- Polissemia confirmada:
  - `bank of fog` → `banco de neblina`;
  - `bank` em `river bank` → `margem`.
- `across` retornou `por toda a extensão de`.
- A tradução visível e o valor armazenado no patch contextual agora são sempre iguais.

### Áudio

- VocabLab: aprovado; WAV válido com 80.060 caracteres base64 em aproximadamente 1,8 s.
- ReadLab: aprovado; WAV válido com 153.660 caracteres base64 em aproximadamente 1,3 s.
- Modelo confirmado no ReadLab: `openai/gpt-audio-mini`.

## Correções aplicadas durante a auditoria

- Proteção contra revisão secundária sobrescrever uma classe gramatical correta.
- Traduções múltiplas normalizadas com ` / `.
- Contextos limitados a um tamanho didático.
- Descarte de exemplos não ingleses e derivações inválidas.
- Valência completa e construção central no RegencyLab.
- Rejeição de sujeito inserido no padrão e de adjuntos tratados como regência.
- Retentativas para 5xx, conteúdo vazio e JSON inválido.
- Recuperação por revisor independente quando o gerador econômico não entrega uma família utilizável.
- Backfill de cobertura do ReadLab sem regenerar o dicionário inteiro.
- Consistência entre `translation` e o patch contextual do ReadLab.
- Erro específico `AI_PROVIDER_BUDGET_EXCEEDED` para limites do provedor.

## Engenharia

- `npx tsc --noEmit`: aprovado.
- `npm test`: 6 arquivos e 16 testes aprovados.
- `npm run build`: aprovado; 32 páginas/rotas geradas.
- `npm run lint`: 0 erros; 121 avisos de dívida técnica permanecem.

## Conclusão

A combinação econômica de geração com modelos superiores de revisão passou integralmente na suíte funcional. Não restou bloqueio externo de chave ou áudio nesta rodada.
