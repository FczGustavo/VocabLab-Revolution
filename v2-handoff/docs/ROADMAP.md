# Roadmap de transição para o VocaLab Classic

## Fase 0: Alinhamento e Contratos (Sprints 1–2)
- **Decisões arquiteturais**: Finalizar escolhas de stack mobile (React Native vs Kotlin Multiplatform) e fornecedor de autenticação.
- **Congelamento de Schemas**: Fixar os schemas JSON v2 em `specifications/` como contrato imutável de leitura do V8.
- **Fixtures de Teste**: Anonimizar e exportar backups reais do V8 contendo todas as combinações de dados para suíte de testes de migração.

## Fase 1: Fundação do Classic (Sprints 3–5)
- **Core Domain**: Construir o pacote `core-domain` em TypeScript/Kotlin contendo entidades, regras de validação e gerenciador de conflitos offline-first.
- **Módulo de Importação V8**: Implementar o parser, prévia de importação, normalização de registros legados e quarentena de campos desconhecidos.
- **Autenticação e Dispositivos**: Implementar fluxo de login de usuário, gerenciamento de tokens e gerenciador de dispositivos pareados.

## Fase 2: VocabLab Vertical (Sprints 6–9)
- **Interface e Banco**: Implementar armazenamento unificado e telas do VocabLab (Pastas Pessoais, Essentials e Fila Review).
- **Motor de IA & Gateway**: Conectar gateway de IA do servidor com controle de orçamento, quotas e suporte a fallback.
- **Motor de Estudo (Study Engine)**: Implementar os 4 modos de estudo (flip, multiple-choice, active-recall, writing), cálculo de streaks e gatilho de Review.
- **App Android Nativo**: Compilar e validar a experiência mobile no Android com suporte a navegação por gestos e safe areas.

## Fase 3: Transposição dos Demais Labs (Sprints 10–13)
- **RegencyLab**: Transferência do catálogo `Regency Essentials`, formulário manual e modos de estudo.
- **RuleLab**: Implementação do módulo Cards (com Study) e do editor e leitor do módulo Theory (JSON tipado).
- **ReadLab**: Importação de textos, mapa de traduções contextuais, leitor com lookup por toque e integração transacional com o VocabLab.
- **QuestionLab**: Se aprovado na Fase 0, implementar a geração de questões A–E e Quiz de gramática.

## Fase 4: Garantia de Qualidade e Lançamento (Sprints 14–15)
- **Testes de Paridade**: Garantir 100% de paridade entre os resultados do V8 e do Classic na importação dos dados e contagens de Review.
- **Testes E2E e Acessibilidade**: Validação em leitores de tela (TalkBack/Screen Readers), leitor de gestos, acessibilidade por teclado e telas de 360 px.
- **Lançamento Piloto**: Distribuição da versão beta para usuários atuais do V8.

## Fase 5: Expansões Futuras (Pós-Lançamento)
- **Módulo de Aprendizado por Música**: Iniciar pesquisa e prototipação de estudo de inglês por letras de música **somente após** o encerramento da Fase 4 e a obtenção de licenças e direitos autorais adequados.
