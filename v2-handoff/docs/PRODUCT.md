# Produto atual e visão do VocaLab Classic

## Proposta

**[Confirmado]** O V8 é uma suíte pessoal para aprender inglês, organizada em cinco áreas: VocabLab, RegencyLab, RuleLab, ReadLab e QuestionLab. O núcleo combina conteúdo criado pelo usuário, catálogos Essentials, geração assistida por IA, estudo ativo, Review e uso offline no navegador.

**[Preservar]** Separação por Labs, pastas, edição manual, funcionamento local, contexto bilíngue (EN/PT-BR), Study com `Again`, Review por erro e catálogos curados.

**[Redesenhar]** O Classic deve transformar essa suíte em um produto multiplataforma coerente, econômico em IA, com armazenamento tipado compartilhado, sincronização confiável, autenticação real e UI mobile de primeira classe.

## Mapa funcional

| Lab | Unidade principal | Study | Review | IA | Offline |
|---|---|:---:|:---:|---|:---:|
| VocabLab | card lexical | sim (flip, choice, writing) | sim | geração, revisão condicional, previsão, áudio | sim |
| RegencyLab | padrão de regência/collocation | sim (flip, recall, choice) | sim | geração, fallback, revisão | sim |
| RuleLab Cards | regra frente/verso | sim (flip, recall) | sim | não no fluxo básico | sim |
| RuleLab Theory | ficha teórica JSON | não | não | não | sim |
| ReadLab | texto com traduções contextuais | não | não | processamento, lookup, OCR, áudio | parcial¹ |
| QuestionLab | questão A–E | quiz próprio | não | geração, revisão | parcial¹ |

¹ ReadLab e QuestionLab funcionam offline para leitura/quiz, mas criação depende de IA.

## Princípios observados

- **[Confirmado]** Dados de conteúdo ficam no dispositivo, em IndexedDB (6 bancos separados); preferências e histórico ficam majoritariamente em `localStorage`.
- **[Confirmado]** IA é mediada por rotas servidoras (`/api/ai/*`) via OpenRouter; a chave de API nunca vai ao cliente.
- **[Confirmado]** Conteúdo pode ser criado e alterado em qualquer dispositivo pareado no protocolo multiwriter.
- **[Preservar]** Uma mesma grafia pode existir em classes gramaticais diferentes como cards distintos.
- **[Preservar]** Sentidos diferentes da mesma grafia e mesma classe ficam no mesmo card, com até duas traduções e contexto que as distingue; `bank` noun não vira dois cards só por significar banco/margem.
- **[Confirmado]** Review é associado à pasta de origem e ao card existente, não uma cópia independente.
- **[Confirmado]** Study Progress é calculado por pasta e Lab, usando filtro `lab + folderId`.

## Idioma da interface

**[Confirmado]** Interface usa mistura: labels de produto e tooltips em português (ex: "Pronúncia", "Erros para enviar ao Review"), categorias técnicas e conteúdo pedagógico em inglês (ex: "Verb", "Simple Present"). A IA gera conteúdo em inglês com traduções e contexto em português.

## Fora do escopo confirmado

- O V8 não oferece música/letras como fluxo implementado.
- Theory não possui imagens nem Study.
- Não há backend relacional canônico de conteúdo; Supabase serve principalmente à sincronização e cache de questões.
- **[Decisão pendente]** Letras de música exigem fonte licenciada, política autoral e definição pedagógica antes de entrar no roadmap.
- **[Confirmado]** O V8 suporta apenas o par EN → PT-BR. Suporte a outros idiomas é decisão pendente.
