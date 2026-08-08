# VocabLab

## Conteúdo e pastas

Card lexical com palavra, classe, forma, tradução(ões), contexto bilíngue, exemplo, relações lexicais, flexões e áudio. Pastas pessoais aparecem primeiro; Review pessoal apenas quando houver itens; divisória; Essentials; Review de Essentials apenas quando houver. Toggle geral oculta Essentials sem apagar.

Essentials: Phrasal Verbs, Idioms e False Cognates. Usuário pode criar pasta pessoal, editar/mover/excluir cards e importar conteúdo. General recebe itens sem pasta explícita, mas **[problema histórico importante]** ações “Add here” precisam carregar atomicamente o `folderId` selecionado para não criar General indevidamente.

## Identidade lexical

- Mesma grafia em classes diferentes cria cards distintos.
- Mesma grafia e mesma classe não cria um card por sentido.
- Até duas traduções podem representar sentidos; o contexto explica quando usar cada uma.
- A forma gramatical é subcategoria, não identidade primária.

## Criação e edição

Criação pode ser IA ou manual. Toggles controlam campos. Editor padrão altera tradução, forma e contextos sem regenerar todo o card. Trocar classe primária com recalculo por IA foi discutido, mas **[decisão pendente]** não faz parte do comportamento consolidado.

False Cognates Essentials usa um único balão com seções `CONTEXT` e `FALSE COGNATE`, exclusivo do catálogo; a IA não deve criar cards comuns nesse formato. Cards desse catálogo alinham o balão na mesma posição/altura visual.

## ReadLab

Seleção de texto pode consultar cards existentes e criar card Vocab contextualizado. A verificação deve ocorrer antes da geração e considerar normalização + classe quando conhecida.

## Aceitação resumida

Ver `docs/acceptance/VOCABLAB.md`. Preservar edição, áudio sob demanda, catálogos versionados, Review virtual e Study por pasta.

