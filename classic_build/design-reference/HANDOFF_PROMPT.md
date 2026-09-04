# Prompt ideal para reconstruir a identidade visual

Depois de copiar a pasta `design-reference/` para a raiz do VocaLab Classic, cole integralmente o bloco abaixo na tarefa responsável pelo design system e pelo primeiro corte vertical:

```text
Você está construindo o VocaLab Classic para Web e Android. Sua tarefa é reproduzir a identidade e as interações essenciais do VocabLab V8, adaptando-as corretamente a cada plataforma, sem copiar a arquitetura ou os problemas do legado.

Antes de criar ou alterar qualquer interface, leia integralmente, nesta ordem:

- AGENTS.md;
- v2-handoff/START_HERE.md;
- v2-handoff/docs/DESIGN_SYSTEM.md;
- v2-handoff/docs/labs/VOCABLAB.md;
- v2-handoff/docs/labs/READLAB.md;
- design-reference/VISUAL_REFERENCE.md.

Inspecione também todos os arquivos em:

- design-reference/screenshots/desktop/;
- design-reference/screenshots/mobile/;
- design-reference/screenshots/light/;
- design-reference/assets/.

Crie primeiro um inventário curto das telas, componentes, tokens e estados encontrados. Para cada decisão visual, classifique-a como: preservar, adaptar por plataforma ou redesenhar. Não comece telas isoladas antes de estabelecer tokens e componentes base.

Os screenshots são referências obrigatórias de identidade, hierarquia e densidade, mas não exigem cópia pixel-perfect. O documento VISUAL_REFERENCE.md é a fonte principal para movimentos, estados e detalhes que uma imagem estática não consegue mostrar.

Preserve:

- personalidade minimalista;
- combinação de tipografia serif e sans;
- títulos e marca;
- linguagem de cards, pastas, pills, superfícies e divisórias;
- separação entre conteúdo pessoal, Review e Essentials;
- foco visual dos modos Study;
- coerência dos temas claro e escuro.
- tema escuro grafite, sem preto puro, neon ou contraste agressivo;
- tema claro frio, limpo e editorial, sem ser uma simples inversão;
- microinterações curtas e discretas;
- comportamento contextual do botão `Study in {pasta} as {N} words/cards`;
- flip 3D e direções semânticas de saída dos cards;
- nome da pasta, quantidade efetivamente elegível e progresso sempre legíveis.

Redesenhe:

- responsividade;
- navegação Android;
- acessibilidade e touch targets;
- header mobile comprimido;
- textos e nomes cortados;
- cards deformados por tags;
- modais longos;
- scrolls difíceis de perceber ou alcançar;
- controles dependentes de hover/drag;
- qualquer workaround específico do V8.

Não copie componentes React, CSS, persistência ou arquitetura do V8. Não porte a sincronização do V8, pois ela está quebrada. Use os tokens e imagens para criar um design system semântico compartilhado por Web e Android, com implementações próprias para cada plataforma e versões estáveis compatíveis obtidas pelos scaffolds oficiais no momento da criação.

Implemente no mínimo estes tokens semânticos: background, surface, surface-raised, surface-inset, border-subtle, text, text-muted, accent, success, warning, danger, radius, spacing, typography, shadow e motion. Nenhum componente de produto deve depender diretamente de um valor hexadecimal isolado.

Implemente e documente estados de todos os componentes: default, hover quando aplicável, pressed, focus-visible, selected, loading, disabled, success, error e empty. Garanta alvos de toque adequados, navegação por teclado na Web, leitores de tela, contraste e `prefers-reduced-motion`.

Primeiro corte vertical obrigatório:

1. shell responsivo com marca, navegação e troca de tema;
2. home do VocabLab com pastas pessoais, divisórias, Essentials e estados condicionais de Review;
3. pasta do VocabLab com busca, cards e botão Study contextual;
4. seletor de Study e um fluxo completo de flip, incluindo progresso e animações;
5. home, pasta e leitor do ReadLab;
6. versões equivalentes no Android, usando padrões nativos quando necessários.

Não use conteúdo fixo para simular contexto. O nome destacado e a contagem do botão Study devem vir do estado real da pasta e dos filtros. Pastas e Reviews condicionais também devem refletir dados reais.

Antes de implementar cada tela, registre quais screenshots serviram de referência. Depois, valide em 1440 × 900 e 390 × 844, nos temas claro e escuro. No Android, valide pelo menos um aparelho compacto e um aparelho alto, incluindo teclado aberto, safe areas e tamanho de fonte ampliado.

Para considerar o trabalho concluído:

- apresente capturas comparativas Web desktop, Web mobile e Android;
- confirme que o tema não pisca e preserva a tela atual;
- confirme que textos longos não colidem nem são cortados sem alternativa;
- confirme que animações seguem os tempos e intenções documentados e respeitam redução de movimento;
- confirme que Study mostra a pasta correta, a quantidade elegível correta e abre o seletor;
- confirme que o layout mobile usa uma coluna de pastas;
- execute lint, tipos, testes e build;
- liste divergências conscientes em relação ao V8 e justifique cada uma.

Se alguma informação estiver ausente, não invente silenciosamente. Registre a lacuna como decisão pendente e escolha a solução mais simples, acessível, econômica e coerente com o material de referência.
```
