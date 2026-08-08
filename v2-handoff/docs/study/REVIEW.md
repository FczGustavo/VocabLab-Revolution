# Review

## Modelo

**[Confirmado]** Review é uma fila virtual da pasta de origem. O card original recebe estado/associação de Review; não há cópia independente. Excluir um item da fila ou apagar a “pasta Review” visual nunca deve apagar o original.

## Entrada

Preferência global `Erros para enviar ao Review`: inteiro 0–10, padrão 2. Zero desativa. O contador considera `Again` dentro da sessão e deve funcionar em todos os modos dos Labs pertinentes. Ao atingir o limiar, a entrada ocorre imediatamente e não é cancelada por acerto posterior na mesma sessão.

## Saída

Estudar a fila Review e marcar como aprendido remove apenas a associação de Review. Dismissals podem ocultar itens sugeridos no painel; o V8 limita histórico de dismissals a 500.

## Integridade

- Review pessoal e Review Essentials só aparecem se não vazios.
- Contagem é derivada dos mesmos cards sincronizados, evitando PC mostrar 4 e celular 1.
- Exclusão de pasta de origem requer regra explícita para seus cards; a fila Review não possui ownership separado.
- Tombstones se aplicam ao card somente quando o usuário realmente exclui o conteúdo original.

