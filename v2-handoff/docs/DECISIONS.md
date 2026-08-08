# Registro de decisões

## Decisões definidas

1. **Nome do produto**: **VocaLab Classic**.
2. **Separação do RuleLab Theory**: A biblioteca teórica (Theory) é puramente de referência. Não possui modos de estudo (Study), não possui estatísticas de progresso, não entra na fila de Review e não realiza chamadas de IA.
3. **Identidade Lexical no VocabLab**: Um card é identificado pela combinação da grafia normalizada da palavra (`word`) + classe gramatical (`partOfSpeech`). Significados múltiplos para a mesma classe gramatical residem no mesmo card (com até duas traduções e contexto desambiguador).
4. **Semântica do `Again` no Study**: Pressionar `Again` marca um erro na sessão, zera/ajusta o streak do card e re-insere o card no final da fila da sessão. Se o número de erros atingir o limiar configurado (`vocablab_study_review_mistake_threshold`), o card entra na fila de Review imediatamente.
5. **Review Virtual**: O Review não clona cards. É uma propriedade/relação virtual (`isReviewFolder: true`) sobre o card existente na pasta de origem. Excluir o card da fila de Review apenas limpa essa propriedade; apagar a pasta de origem exclui o card original.
6. **Sincronização Multiwriter**: Todos os dispositivos pareados possuem capacidade total de leitura e escrita. As funções de verificação de papel "somente estudo" foram configuradas para permitir escrita universal (`isSyncStudyOnly() === false`).
7. **Tratamento de Catálogos Essentials**: Catálogos curados aparecem separados visualmente das pastas pessoais por divisórias. Podem ser ocultados via preferência sem que seus dados sejam apagados. Atualizações de catálogo usam hash de conteúdo para preservar edições feitas pelo usuário.

## Decisões pendentes (Requerem definição antes da implementação do Classic)

1. **Stack Tecnológica do Classic**: Definir se a base compartilhada usará React Native/Expo para mobile + Web, ou Kotlin Multiplatform / Compose Native com lógica TypeScript compartilhada.
2. **Arquitetura de Backend e Autenticação**: Escolha do serviço de identidade (Supabase Auth, Firebase Auth ou OAuth próprio) e modelo de persistência remota (PostgreSQL relacional canônico vs log de eventos).
3. **Tratamento de Desvio de Relógio (Clock Drift)**: Definir se a sincronização exigirá timestamps emitidos/validados pelo servidor (HLC - Hybrid Logical Clocks) para evitar que relógios locais incorretos sobrescrevam alterações mais recentes.
4. **Destino do QuestionLab**: Decidir se o QuestionLab será mantido como módulo integrado no Classic, simplificado ou movido para um produto/extensão independente.
5. **Recurso de Aprender por Música**: A inclusão de letras e áudios de músicas requer definição prévia sobre direitos autorais, fontes de licenciamento de letras e estrutura pedagógica de exercícios antes de ser incorporado.
6. **Formatos de Mídia e Caches de Áudio**: Definir se o cache de pronúncia será exportável como arquivo zip/blob ou se continuará sendo baixado sob demanda.
7. **Branding e Domínios**: Definir o repositório, identificador de pacote Android (`com.vocalab.classic`), logo final e domínio de produção.

## Tabela: Preservar vs Redesenhar

| O que PRESERVAR do V8 | O que REDESENHAR no Classic |
|---|---|
| Regras lexicais (word + POS) e contextos EN/PT-BR | Armazenamento local fragmentado em 6 bancos IndexedDB |
| Fila virtual de Review e limiar de erros configurável | Sincronização dependente de snapshots inteiros legados |
| Funcionamento 100% offline para leitura e estudo | Falta de autenticação e proteção frágil nas rotas de IA |
| Separação estruturada por Labs e pastas | Dependência do relógio do SO do cliente para conflitos |
| Estrutura JSON segura para fichas teóricas (Theory) | Histórico de sessões Study truncado em apenas 50 registros |
| Catálogos Essentials curados com preservação de edições | Interface web embrulhada; substituir por app Android nativo real |
