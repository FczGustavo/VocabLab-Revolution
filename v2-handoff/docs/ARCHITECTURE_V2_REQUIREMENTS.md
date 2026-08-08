# Requisitos de arquitetura do VocaLab Classic

## Visão geral e metas

O **VocaLab Classic** será a evolução do VocabLab V8, reestruturado para operar como um produto multiplataforma (Web + Android nativo), com arquitetura offline-first rigorosa, sincronização incremental confiável e backend autenticado com controle de custos de IA.

## Princípios de arquitetura

1. **Separação em Camadas Limpas (Clean Architecture)**:
   - `core-domain`: Contém todas as regras de negócio lexicais, cálculo de streaks, lógica de Study/Review, gerenciamento de tombstones e parsers. **Não possui dependências de React, Next.js, Android UI ou plataformas de banco de dados.**
   - `storage-adapter`: Implementações de persistência local (SQLite/Room no Android, IndexedDB/OPFS na Web).
   - `sync-engine`: Motor de sincronização de operações incremental com outbox durável.
   - `ai-gateway`: Cliente de chamadas de IA do servidor com controle de orçamento, quotas e suporte a fallback.
2. **Offline-First Garantido**: Toda criação, edição, exclusão e sessão de estudo é executada e gravada primariamente no banco de dados local. A conectividade de rede é necessária apenas para sincronização remota, chamadas de IA e narração em áudio.
3. **Persistência Local Unificada**: Substituir a fragmentação dos 6 IndexedDBs e do `localStorage` do V8 por um único banco de dados transacional local com migrações de schema tipadas e versionadas.
4. **Relógios Lógicos (Hybrid Logical Clocks - HLC)**: Substituir a dependência do relógio físico do dispositivo por HLCs ou revisões ordenadas pelo servidor para evitar que erros de data no dispositivo destruam alterações recentes.
5. **Acessibilidade e Usabilidade Mobile**:
   - Alvos de toque (touch targets) mínimos de **44 × 44 dp**.
   - Integração com navegação por gestos do Android, barras de sistema (Edge-to-Edge) e teclado virtual (IME avoidance).
   - Suporte completo a leitor de tela (TalkBack / VoiceOver) com descrições semânticas de todos os botões e estados.
