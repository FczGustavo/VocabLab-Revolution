# Design system e responsividade

## Identidade visual e tokens

- **Tipografia**: Interface utiliza **Plus Jakarta Sans** (sans-serif) para legibilidade; títulos de marca e cabeçalhos em estilo editorial utilizam **Playfair Display**.
- **Modos de Tema**: Suporte completo a tema Claro (Light), Escuro (Dark) e Sistema (System) gerenciados via `next-themes`.
- **Paletas de Cor (Modo Claro)**:
  1. `blue` (Azul, padrão): Glassmorphism moderno com contrastes em tom azul profundo (`#0E1722`, `#267EDC`).
  2. `sage` (Sálvia): Tons naturais de verde herbal (`#183226`, `#78A386`).
  3. `terracotta` (Terracota): Tons quentes e argilosos (`#38201B`, `#C4694F`).
  4. `ocean` (Oceano): Tons de azul-petróleo profundo (`#123138`, `#3194A5`).
- **Forma dos Cards**: Preferência do usuário entre cards arredondados (`rounded-xl` / `rounded-2xl`) ou cards quadrados (`rounded-none`).

## Padrões de Layout e Interface

1. **Header Global**: Marca, atalhos para os cinco Labs, barra de pesquisa rápida (`global-search.tsx`), indicador de sincronização (`ai-status-panel.tsx`) e modal de configurações (`settings-dialog.tsx`).
2. **Navegação por Labs**:
   - Cada Lab possui sua cor temática para badges e destaques (Vocab: azul/sky, Regency: violeta/rosa, Rule: âmbar/laranja, Read: esmeralda/azul, Question: índigo).
   - Divisórias visuais separam **Pastas Pessoais**, **Fila de Review** e **Catálogos Essentials**.
3. **Cards de Estudo (Study Shell)**:
   - Superfície centralizada com controle de atalhos de teclado.
   - Painel de progresso superior recolhível (`StudyHeader`).
   - Modal/Gaveta de estatísticas da sessão ao concluir (`study-progress-sheet.tsx`).

## Responsividade e comportamento Mobile

**[Confirmado]** Padrões responsivos implementados:
- **Grades flexíveis**: Adaptam-se de 3-4 colunas em desktop para 1 coluna em dispositivos móveis (breakpoint `< 640px`).
- **Nomes de Pastas e Títulos Longos**: Configurados com `break-words` para evitar estouro horizontal em telas estreitas (mínimo testado: 360 px).
- **Editores e Modais**:
  - Modais com rolagem interna oculta visualmente (`scrollbar-width: none`), mas mantendo o scroll via toque/gesture.
  - Editor de fichas teóricas (Theory) adapta a barra de ferramentas para botões com alvos de toque de tamanho adequado.
- **Gavetas vs Modais**: Em dispositivos móveis, diálogos usam gavetas inferiores (Vaul/Drawer) para facilitarem o manuseio com o polegar.

## Requisitos para o VocaLab Classic (Android + Web)

- **Alvos de Toque (Touch Targets)**: Todos os elementos interativos no app Android e web mobile devem possuir área clicável mínima de **44 × 44 dp/px**.
- **Navegação Nativa Android**: Suporte ao gesto de voltar do sistema (Back gesture/button), safe areas (status bar e navigation bar) e ajuste dinâmico ao abrir o teclado virtual (IME padding).
- **Respeito a preferências do SO**: Suporte a `prefers-reduced-motion` (desativar animações de flip de cards se ativado) e tamanho de fonte ampliado do sistema sem quebrar layouts.
