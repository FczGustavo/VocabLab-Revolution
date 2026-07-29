# prompt-engineering
- AI-generated word contexts/definitions must use strictly neutral, explanatory dictionary-style tone — no informal phrases like "Cuidado com essa palavra!" or conversational warnings. Confidence: 0.85
- Use all-in-one generation architecture: the AI prompt must instruct the model to generate all fields (word, EN definition, PT definition, EN example, PT example, synonyms, antonyms) in a single response, with frontend/backend filtering what to display based on user config. Confidence: 0.85
- Bilingual context is mandatory: definitions must always include both English and Portuguese — the English definition is primary, with Portuguese translation included using the same pattern as example sentence translations. Confidence: 0.85
- Remove any revision/validation step from the flashcard AI generation pipeline — generate all fields in a single pass without post-hoc review stages that could interfere with field completion. Confidence: 0.70
- usageNoteEn must be concise and dictionary-like — direct, to the point, without irrelevant or rambling information. Confidence: 0.70
- The PT usageNote translation must correspond exactly to the English usageNoteEn content — no mismatched or diverging information between the two versions. Confidence: 0.70
