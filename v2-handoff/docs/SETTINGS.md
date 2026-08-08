# Configurações do V8

## Mapeamento completo de preferências

### Geral e interface
- `vocablab_color_palette`: Paleta de cor ativa (`"blue" | "sage" | "terracotta" | "ocean"`, default: `"blue"`).
- `theme`: Tema visual (`"light" | "dark" | "system"`, default: `"system"`).
- `card_shape`: Forma dos cards (`"rounded" | "square"`, default: `"rounded"`).
- `animations_enabled`: Animações ativas na interface (`boolean`, default: `true`).

### Experiência de estudo (Study)
- `vocablab_study_review_mistake_threshold`: Quantidade de erros para enviar o card ao Review (inteiro 0–10, default: `2`). Zero desativa a entrada automática.
- `vocablab_study_header_start_collapsed`: Iniciar a barra de progresso do estudo recolhida (`boolean`, default: `false`).
- `vocablab_study_shortcut_coach_dismissed`: Ocultar caixa de dicas de atalhos de teclado (`boolean`, default: `false`).

### VocabLab
- `vocablab_include_synonyms_antonyms`: Incluir sinônimos e antônimos ao gerar card (`boolean`, default: `true`).
- `vocablab_synonyms_display_count`: Nível/quantidade de sinônimos (`0 | 1 | 2 | 3`, default: `0`).
- `vocablab_include_conjugations`: Incluir tabela de conjugações em verbos (`boolean`, default: `true`).
- `vocablab_include_alternative_forms`: Incluir outras formas/derivações lexicais (`boolean`, default: `false`). **[Confirmado]** Quando `false`, desativa geração, revisão e validação de derivações.
- `vocablab_include_usage_note`: Incluir nota de uso no contexto (`boolean`, default: `true`).
- `vocablab_show_context`: Exibir balão de contexto nos cards (`boolean`, default: `true`).
- `vocablab_context_in_portuguese`: Exibir contexto em português (`boolean`, default: `true`).
- `vocablab_show_ipa`: Exibir transcrição fonética IPA (`boolean`, default: `false`).
- `vocablab_show_grammatical_form`: Exibir badge de forma gramatical (`boolean`, default: `true`).
- `vocablab_efomm_mode`: Ativar modo de alta precisão técnica/gramatical (`boolean`, default: `true`).
- `vocablab_include_multiple_translations`: Permitir até duas traduções para uma mesma classe (`boolean`, default: `true`).
- `vocablab_show_manual_optional_fields`: Exibir campos opcionais no formulário de criação manual (`boolean`, default: `false`).
- `vocablab_show_regenerate_audio_button`: Exibir botão de forçar regeneração de áudio (`boolean`, default: `false`).
- `vocablab_use_ai_predictions`: Usar previsão/autocomplete da IA ao digitar palavra (`boolean`, default: `true`).
- `vocablab_pronunciation_voice`: Voz para pronúncia em áudio (`"alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"`, default: `"alloy"`).

### RegencyLab
- `regencylab_preferences`: Exibição de significado em português, contraste, exemplos e traduções.

### ReadLab
- `readlab_audio_voice`: Voz preferida para leitura de textos longos.

## Requisitos de arquitetura para o Classic

1. **Schema tipado e versionado**: Substituir o acesso direto ao `localStorage` por um repositório centralizado com validação Zod.
2. **Escopamento transparente**:
   - `Device`: Configurações de hardware/UI local (ex: animações, voz nativa).
   - `Account`: Preferências sincronizáveis entre dispositivos (ex: limiar de erros do Review, paleta de cor).
   - `Lab`: Opções específicas por módulo.
3. **Segurança de exportação**: Preferências exportadas nunca contêm segredos, tokens de dispositivo ou chaves de API.
