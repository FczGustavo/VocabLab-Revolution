# Study Progress

## Escopo por pasta

**[Confirmado]** O painel deve ser individual por pasta e Lab. O filtro usa `lab + folderId`; sessões antigas sem ID podem usar `folderName` como fallback. Não somar todas as pastas quando o painel foi aberto em uma pasta específica.

## Métricas derivadas

- total no deck/pasta;
- itens em Review;
- mastered e cobertura;
- sessões;
- cards estudados e cards únicos;
- acertos na primeira tentativa;
- precisão média e melhor precisão;
- `Again`, erros totais e cards com erro;
- tamanho médio de sessão;
- minutos totais, dias distintos e sessões nos últimos 7 dias;
- distribuição por modo/Lab;
- última sessão e sugestões recentes de Review.

Mastered/cobertura dependem de streak/definição vigente. **[Decisão pendente]** Formalizar fórmula no Classic e versioná-la para métricas históricas não mudarem silenciosamente.

## Persistência e reset

O V8 mantém 50 sessões. Reset apaga histórico e dismissals e zera streaks em Vocab, Regency e Rule; conteúdo, pastas, textos e Review não são apagados. O painel longo tem scroll interno invisível, ícones/textos alinhados e fechamento acessível.

## Limitações

Histórico truncado impede métricas vitalícias exatas. Datas vêm do cliente. Sessões incompletas não possuem contrato consolidado. **[Redesenhar]** Classic deve separar métricas deriváveis de eventos brutos e definir retenção/exportação.

