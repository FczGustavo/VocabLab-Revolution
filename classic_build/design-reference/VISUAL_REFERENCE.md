# VocabLab V8 — referência visual para o VocaLab Classic

## Finalidade

Este pacote registra a interface real do V8 para orientar uma reconstrução Web + Android sem acesso ao código legado. As imagens são referência de personalidade, hierarquia e densidade; não são uma exigência de cópia pixel-perfect.

O Classic deve parecer uma evolução reconhecível, mas precisa redesenhar responsividade, acessibilidade e componentes para React/Next.js e React Native/Expo.

## Identidade

- Interface minimalista, silenciosa e editorial.
- Fundo quase preto no tema escuro, cards grafite e bordas de baixo contraste.
- Tema claro limpo, com cards claros e acento azul.
- A marca usa um `V` serifado compacto no header e títulos grandes em serif.
- Interface e corpo usam Plus Jakarta Sans.
- Títulos de marca usam Playfair Display.
- Conteúdo permanece centralizado, com largura máxima aproximada de 1150 px.
- Header baixo: aproximadamente 50 px no mobile e 52 px a partir de `sm`.
- Títulos de Lab têm bastante respiro vertical; ações e filtros ficam discretos.

## Tokens confirmados no V8

- `font-sans`: Plus Jakarta Sans.
- `font-serif`: Playfair Display, com fallback Georgia.
- largura máxima de header/main: `1150px`.
- raio-base: `0.75rem`.
- tema claro principal:
  - background `oklch(0.98 0.005 250)`;
  - foreground `oklch(0.15 0.02 250)`;
  - card `oklch(1 0 0)`;
  - primary `oklch(0.58 0.23 250)`.
- tema escuro unificado:
  - background `oklch(0.18 0.003 260)`;
  - foreground `oklch(0.965 0.002 260)`;
  - card `oklch(0.235 0.004 260)`;
  - primary `oklch(0.89 0.004 260)`.
- paletas claras existentes: blue, sage, terracotta e ocean.
- pills/tags escuros usam fundo próximo ao card e cor semântica moderada.
- painéis de estatística usam superfícies `stat-bento`, borda sutil e números tabulares.
- scrollbars longas podem ficar visualmente ocultas, mas o conteúdo deve continuar rolável por mouse, toque e teclado.

Não copie esses valores cegamente para o Android: converta-os em tokens semânticos compartilhados e ajuste contraste/elevação por plataforma.

## Componentes e hierarquia

## Linguagem de movimento e microinterações

O movimento do V8 é curto, funcional e discreto. O Classic deve preservar essa sensação: a interface responde imediatamente, mas nunca parece elástica, chamativa ou "gamificada" em excesso.

### Tempos e curvas confirmados

- Transição comum de controles: `200ms ease-in-out` para cor, borda, fundo, opacidade e pequenos deslocamentos.
- Entrada de página: `320ms ease-out`, iniciando com opacidade zero e `translateY(6px)`.
- Conteúdo que aparece abaixo de outro controle: `280ms ease-out`, vindo de `translateY(-8px)` e opacidade zero.
- Cards de pasta: `300ms cubic-bezier(0.4, 0, 0.2, 1)`.
- Recolhimento do header de Study: `300ms ease-in-out`, animando altura e `translateY`.
- Barra de progresso: largura animada em `300ms`.
- Saída de um card respondido: `260ms cubic-bezier(0.4, 0, 0.7, 0.2)`.
- Respeitar `prefers-reduced-motion`: remover deslocamentos, rotação e flip; manter apenas mudança instantânea ou fade curto.

### Hover, pressão e foco

- Card interativo sobe apenas `2px` no hover e ganha sombra um pouco mais ampla.
- O hover não deve alterar tamanho estrutural, causar reflow ou deslocar cards vizinhos.
- Botões e pills mudam principalmente fundo, borda e cor; escala, quando utilizada, deve ser mínima e exclusiva do estado pressionado.
- Foco por teclado precisa ser mais perceptível que o hover, com anel contínuo e contraste nos dois temas.
- No Android não existe requisito de hover: usar estado pressionado, ripple ou alteração breve de superfície, sem perder a sobriedade.
- Áreas clicáveis devem ter pelo menos 44 × 44 CSS px na Web touch e 48 × 48 dp no Android, ainda que o ícone desenhado seja menor.

### Movimento dos cards de Study

- O flip é uma rotação 3D de `180deg` no eixo Y, com perspectiva de `1000px` e faces com `backface-visibility: hidden`.
- Ao marcar que sabia, o card sai para a direita: aproximadamente `translateX(42%)`, `translateY(-2%)`, rotação de `7deg`, escala final `0.96` e fade-out.
- Ao marcar `Again`, sai para a esquerda: aproximadamente `translateX(-42%)`, `translateY(2%)`, rotação de `-7deg`, escala final `0.96` e fade-out.
- O próximo card deve ocupar a mesma posição, sem salto de layout.
- Feedback de resposta e avanço não podem depender apenas da cor.

### Header e progresso durante Study

- O header tem 65px no V8 e pode ser recolhido verticalmente.
- Um pequeno controle circular fica centralizado no topo e acompanha a posição do header durante a animação.
- A barra é neutra/azul durante navegação, verde após acerto e vermelho suavizado após `Again`.
- O contador usa `atual/total`; nome da pasta e subtítulo quebram linha quando necessário, sem sobrepor o progresso.

## Temas grafite

### Tema escuro

- Não é preto absoluto. O fundo é grafite profundo, próximo de `oklch(0.18 0.003 260)`.
- Cards são um degrau acima do fundo, próximos de `oklch(0.235 0.004 260)`, frequentemente com gradiente quase imperceptível de grafite para grafite.
- Popovers, dialogs, selects e dropdowns usam a mesma família de superfície para parecerem partes do mesmo material.
- Bordas usam branco com aproximadamente 6–8% de mistura; no hover podem chegar perto de 15%.
- Sombras são profundas e difusas, acompanhadas por uma linha interna branca extremamente sutil. Não usar brilho neon.
- Texto principal é branco quebrado; texto secundário é cinza frio. O contraste é obtido por luminosidade, não por muitas cores.
- O título serifado do Lab é propositalmente mais apagado que o texto principal e possui sombra ampla muito discreta.
- Balões de contexto usam cerca de 5% de branco sobre o card e borda de cerca de 6%, sem parecer um card independente.
- Azul, verde, âmbar e vermelho aparecem apenas como acentos semânticos.

### Tema claro

- O fundo é branco levemente frio/azulado, não cinza neutro pesado.
- Cards são brancos e se separam do fundo por borda suave e sombra curta.
- Texto principal é azul-grafite muito escuro, não preto puro.
- O azul é o acento principal; cores semânticas mantêm saturação moderada.
- A hierarquia e o espaçamento devem permanecer idênticos ao tema escuro. Não criar dois layouts.

### Regras comuns aos temas

- Implementar tokens semânticos: `background`, `surface`, `surface-raised`, `surface-inset`, `border-subtle`, `text`, `text-muted`, `accent`, `success`, `warning` e `danger`.
- Evitar valores de cor isolados nos componentes. Web e Android devem consumir a mesma intenção semântica, ainda que tenham arquivos de tokens próprios.
- Mudança de tema não deve piscar nem reconstruir a tela; deve preservar posição, modal aberto e navegação atual.

## Detalhes do botão Study

- Ele fica alinhado à barra de busca, no lado direito da toolbar da pasta.
- É uma pill de contorno, altura aproximada de 36px, cantos completamente arredondados, ícone de graduação com 14px e texto de aproximadamente 13px.
- A frase é contextual e deve ser lida como uma única sentença: `Study in {pasta} as {N} words/cards`.
- O nome da pasta é o único trecho colorido: azul mais escuro no tema claro e azul mais luminoso no escuro, com peso médio.
- A quantidade vem do conjunto efetivamente elegível depois dos filtros, não necessariamente da contagem bruta da pasta.
- Se houver filtro ativo, o chip/indicador correspondente integra o final do botão sem esconder a contagem.
- O botão só aparece quando há conteúdo estudável. Não renderizar uma pill desabilitada com zero cards.
- Nomes longos devem truncar apenas em telas estreitas, mantendo nome completo em tooltip/acessibilidade. No mobile, pode virar um CTA compacto ou bottom action, mas deve continuar exibindo pasta e quantidade antes de iniciar.
- Ao tocar, abre o seletor de Study; não começa automaticamente um modo arbitrário.
- O seletor apresenta cada modo como linha ampla: nome forte e explicação curta abaixo. Um modo indisponível explica a condição, como mínimo de cards/respostas distintas.

### Header

- Marca à esquerda.
- Navegação de Labs em pill central no desktop.
- Busca e engrenagem à direita.
- Dentro de uma pasta, o logo vira ação de voltar e aparecem controles contextuais de layout/progresso.
- No mobile, textos das guias somem e os ícones permanecem; o Classic pode substituir isso por navegação inferior nativa se preservar reconhecimento e acesso rápido.

### Home e pastas

- Título grande centralizado.
- Entrada/criação logo abaixo do título no VocabLab.
- Pastas pessoais primeiro.
- Review pessoal somente quando houver conteúdo.
- Divisória clara antes de Essentials.
- Essentials abaixo da divisória.
- Review de Essentials somente quando houver conteúdo.
- Card de pasta possui linhas decorativas superiores, ícone, nome e contagem.
- Mobile usa uma única coluna e permite quebra completa do nome.

### Cards do VocabLab

- Grade de três colunas no desktop e uma coluna no mobile.
- Categoria e forma gramatical em pills pequenas.
- Palavra é o foco visual.
- Tradução, exemplo e contexto têm hierarquia progressiva.
- Contexto usa balão interno discreto.
- Áudio, edição e exclusão ficam em ações compactas.
- Cards incompletos não devem ser usados como referência de conteúdo; servem apenas para demonstrar estado degradado.

### Study

- Tela limpa e centralizada, com o card como foco.
- Cabeçalho informa pasta, modo, restantes, progresso e cronômetro.
- Flip usa `Again` à esquerda e `I knew it` à direita.
- Multiple Choice mantém a palavra central e alternativas amplas.
- Active Recall mostra palavra, instrução, campo opcional e botão Reveal.
- No Android, ações principais devem ficar acessíveis ao polegar e respeitar safe areas.

### Study Progress

- Sheet lateral no desktop.
- Grid de métricas em duas colunas.
- Ícone, número forte e label uppercase pequena.
- Header e fechar permanecem fixos; corpo rola.
- No mobile, o Classic deve usar uma tela/modal full-screen ou bottom sheet alto, não comprimir o sheet lateral.

### Settings

- Modal amplo, com navegação por áreas e conteúdo rolável.
- Configurações agrupadas por título, descrição e controles à direita.
- Diagnóstico de IA é informativo e denso; no Classic deve ficar em seção avançada, não dominar as preferências comuns.

### ReadLab

- Home segue a linguagem de pastas do VocabLab.
- Dentro da pasta, cards de texto têm título, origem/quantidade, preview, data, status e contagem de termos.
- O preview precisa ser legível e não pode sofrer corte abrupto sem indicação.
- O gerenciador de pasta usa o mesmo modal estrutural dos demais Labs.
- Criação diferencia texto colado e imagem OCR.
- Leitor prioriza título, metadados e uma coluna confortável de leitura.
- O Classic adicionará PDF, mas deve manter essa simplicidade e mostrar progresso por página fora do texto final.

## Screenshots desktop — viewport 1440 × 900

| Arquivo | Estado | Preservar | Redesenhar |
|---|---|---|---|
| `screenshots/desktop/vocab-home-dark.png` | Home Vocab dark | título, pastas, divisórias, Essentials | espaçamento responsivo e ação de criação |
| `screenshots/desktop/vocab-folder-cards-dark.png` | Grade de cards | hierarquia lexical, pills, contexto | consistência de altura e cards incompletos |
| `screenshots/desktop/vocab-edit-card-dark.png` | Editor | campos simples e modal direto | mobile full-screen e validação |
| `screenshots/desktop/vocab-study-selector-dark.png` | Seletor Study | três modos e explicações | apresentação mobile |
| `screenshots/desktop/vocab-study-flip-dark.png` | Flip | foco, atalhos, Again/known | touch e safe areas |
| `screenshots/desktop/vocab-study-multiple-choice-dark.png` | Multiple Choice | foco e alternativas | estados de seleção/feedback acessíveis |
| `screenshots/desktop/vocab-study-active-recall-dark.png` | Active Recall | campo opcional e Reveal | teclado mobile e submissão |
| `screenshots/desktop/vocab-study-progress-dark.png` | Progresso vazio | métricas bento e escopo por pasta | full-screen mobile e gráficos futuros |
| `screenshots/desktop/settings-general-dark.png` | Settings geral | agrupamento e tom visual | separar avançado/diagnóstico |
| `screenshots/desktop/settings-vocab-dark.png` | Preferências Vocab | toggles e descrições | navegação mobile |
| `screenshots/desktop/read-home-dark.png` | Home ReadLab | mesma família visual de pastas | ação de importar PDF |
| `screenshots/desktop/read-folder-text-cards-dark.png` | Cards de texto | metadados e preview | truncamento e status |
| `screenshots/desktop/read-new-text-dark.png` | Criar texto/imagem | alternância de origem | incorporar PDF e progresso |
| `screenshots/desktop/read-reader-dark.png` | Leitor | simplicidade e largura de leitura | toolbar contextual, áudio e progresso |
| `screenshots/desktop/read-folder-manager-dark.png` | Manager ReadLab | consistência com outros Labs | seleção/movimentação mobile |

## Screenshots mobile — viewport 390 × 844

| Arquivo | Estado | Observação |
|---|---|---|
| `screenshots/mobile/vocab-home-dark.png` | Home Vocab | referência de uma coluna e header compacto |
| `screenshots/mobile/vocab-folder-cards-dark.png` | Cards Vocab | densidade, largura e quebra de conteúdo |
| `screenshots/mobile/vocab-study-selector-dark.png` | Seletor Study | modal estreito atual; Classic pode usar bottom sheet |
| `screenshots/mobile/vocab-study-active-recall-dark.png` | Active Recall | referência para teclado e CTA inferior |
| `screenshots/mobile/read-home-dark.png` | Home ReadLab | uma coluna de pastas |
| `screenshots/mobile/read-folder-text-cards-dark.png` | Cards de texto | preview e metadados em largura pequena |
| `screenshots/mobile/read-reader-dark.png` | Leitor | largura de leitura e respiro |

## Tema claro

- `screenshots/light/vocab-home-light.png`.
- `screenshots/light/read-home-light.png`.

O tema claro não deve ser uma inversão literal: preserve fundos levemente azulados, cards brancos e bordas suaves.

## O que preservar no Classic

- Identidade serif + sans.
- Minimalismo e baixo ruído visual.
- Marca compacta.
- Títulos grandes dos Labs.
- Cards e pastas como objetos centrais.
- Divisórias semânticas entre pessoal, Review e Essentials.
- Pills pequenas para metadados, sem dominar a palavra.
- Contextos em superfícies internas.
- Study focado e sem distração.
- Temas claro e escuro coerentes.

## O que não reproduzir

- Header mobile excessivamente comprimido.
- Ícones desalinhados ou com áreas de toque pequenas.
- Duas colunas de pasta no celular.
- Nomes e previews cortados sem alternativa acessível.
- Modais longos sem experiência mobile dedicada.
- Scroll invisível que impeça descobrir ou alcançar conteúdo.
- Cards com altura/posição inconsistentes por causa de tags.
- Controles dependentes apenas de hover, drag ou teclado.
- Status de sync que diga `synced` sem comprovar convergência.
- Diagnóstico técnico misturado às opções cotidianas.

## Assets

O V8 não usa um arquivo de logo próprio nas telas auditadas; a marca é renderizada tipograficamente como `V`. Não foram copiados ícones de bibliotecas nem fontes binárias. O Classic deve usar sua própria composição de marca e dependências oficiais de ícones/fontes.

## Cobertura e limitações

- Capturas feitas com dados reais já existentes, sem criar, editar ou excluir conteúdo.
- Tema foi alternado pela interface apenas durante as capturas e restaurado para escuro.
- Não foi capturado o popover contextual de seleção do ReadLab porque a automação semântica não abriu esse estado de forma confiável.
- Não foram capturados estados de erro de IA, OCR ou sync para evitar chamadas e mutações externas.
- PDF não existe como fluxo visual completo no V8; deverá ser desenhado no Classic a partir dos requisitos funcionais.
- O pacote prioriza VocabLab e ReadLab porque são o escopo inicial do Classic.
