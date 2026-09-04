# Study

## Escopo

Disponível em VocabLab, RegencyLab e RuleLab Cards. Sempre inicia a partir de uma pasta/fila concreta. Theory, ReadLab e QuestionLab não usam este motor.

## Modos

- Vocab: flip, multiple choice e writing/active recall.
- Regency: flip, recall e multiple choice.
- Rule Cards: flip e recall.

Cards são embaralhados. Atalhos: direita acerta, esquerda `Again`, cima revela e baixo oculta, exceto quando foco está em input/controle. Cronômetro, animação, dicas e cabeçalho recolhido obedecem configurações.

## Semântica da resposta

Ao acertar, incrementa streak e remove da fila da sessão. Ao usar `Again`, registra erro, zera/ajusta streak conforme o Lab, avalia limiar de Review e recoloca o card no fim da fila. Se o usuário errar uma vez e acertar na reaparição, o erro continua contado: não vira acerto de primeira tentativa e, se o limiar já foi atingido, permanece em Review.

**[Preservar]** Esta memória de erro precisa pertencer à sessão/card, não à ocorrência visual, para funcionar em todos os modos.

## Finalização

Uma `StudySession` é persistida uma única vez ao concluir, com pasta, Lab, modo, IDs, total, first-try, erros e duração. Sair antecipadamente e retomar não têm contrato robusto confirmado; **[decisão pendente]** definir checkpoint no Classic.

## Distratores e áudio

Multiple choice exige alternativas distintas e deve evitar respostas ambíguas. Vocab favorece família/categoria; Regency, mesma família/termo/categoria. Áudio Vocab é sob demanda, com cache e fallback de speech synthesis.

