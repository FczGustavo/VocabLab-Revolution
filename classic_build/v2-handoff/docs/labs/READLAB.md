# ReadLab

## Unidade e organização

Texto com título, conteúdo, pasta, status/tag, highlights e traduções globais/contextuais. Home possui pastas e cards de texto; o card mostra título menor, preview legível sem corte abrupto, data, tag entre data e quantidade de termos, e exclusão. Adicionar tag não deve esticar o card.

Folder manager segue o visual dos demais Labs, com largura suficiente e transferência somente dos itens selecionados ou por tag. Pastas e nomes devem ser legíveis em uma coluna no celular.

## Entrada

**[Confirmado]** Texto colado e imagem/clipboard com OCR fazem parte do fluxo auditado. O tipo também admite `pdf`, mas a UI direta precisa ser confirmada antes de prometer paridade.

Ao salvar, o backend processa texto e monta mapa de traduções. Falha de IA deve preservar o texto e permitir retry, não causar perda.

## Leitura

Seleção abre lookup contextual. O cache por ocorrência evita chamadas repetidas; mapas podem ser completados. Highlights e tags persistem. Narração é sob demanda e tem voz/regeneração configurável.

## Integração com VocabLab

Antes de gerar/adicionar uma seleção, consultar o deck local e sinalizar existência. Se ausente, gerar usando a frase/ocorrência como contexto e `preserveSourceForm` quando aplicável. Não criar duplicata silenciosa; permitir escolha consciente quando a mesma grafia existir em classe diferente.

ReadLab não possui Study/Review próprio no V8.

