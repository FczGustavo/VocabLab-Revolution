# Sincronização automática com Supabase

## 1. Criar as tabelas

Abra **Supabase → SQL Editor → New query**, cole todo o conteúdo de
`supabase/migrations/202607290002_per_lab_autosync.sql` e execute uma vez.
Em seguida, execute
`supabase/migrations/202607290003_sync_identity_claims.sql`.
Por fim, execute `supabase/migrations/202608020001_sync_devices.sql` para
ativar o painel de dispositivos pareados e a desconexão individual.

O script cria seis tabelas independentes:

- `vocablab_sync_general`
- `vocablab_sync_vocab`
- `vocablab_sync_regency`
- `vocablab_sync_rule`
- `vocablab_sync_read`
- `vocablab_sync_question`
- `vocablab_sync_claims`

Todas usam RLS sem políticas públicas. O navegador não acessa o Supabase:
somente as rotas do servidor Next.js usam a `service_role`.

## 2. Configurar `.env.local`

Crie ou atualize `.env.local` na raiz:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
SYNC_CODE_PEPPER=UM_SEGREDO_ALEATORIO_COM_PELO_MENOS_32_CARACTERES

SUPABASE_SYNC_GENERAL_TABLE=vocablab_sync_general
SUPABASE_SYNC_CLAIMS_TABLE=vocablab_sync_claims
SUPABASE_SYNC_VOCAB_TABLE=vocablab_sync_vocab
SUPABASE_SYNC_REGENCY_TABLE=vocablab_sync_regency
SUPABASE_SYNC_RULE_TABLE=vocablab_sync_rule
SUPABASE_SYNC_READ_TABLE=vocablab_sync_read
SUPABASE_SYNC_QUESTION_TABLE=vocablab_sync_question
```

`SUPABASE_SERVICE_ROLE_KEY` e `SYNC_CODE_PEPPER` são segredos de servidor:
nunca use o prefixo `NEXT_PUBLIC_`, nunca os envie ao Git e nunca os coloque no
navegador. Depois de alterar `.env.local`, reinicie `pnpm dev`.

Você pode mudar a URL e os nomes das tabelas pelo `.env.local`; não é necessário
alterar o código.

## 3. Como funciona

Na guia **Configurações → Sincronização**, o navegador gera um PIN de quatro
dígitos uma única vez. O usuário escolhe uma palavra. Ao confirmar, o servidor
tenta reivindicar essa combinação de maneira atômica. Se estiver livre, o
navegador cria uma chave proprietária aleatória de 256 bits e somente o hash
dessa chave é guardado no Supabase.

Se palavra + PIN já pertencerem a outra chave, nenhuma informação é baixada ou
enviada. O app mostra que a identificação está ocupada.

Para conectar um segundo dispositivo legítimo, o navegador já autorizado gera
um código descartável de seis dígitos. O código expira em cinco minutos e pode
ser usado apenas uma vez. O novo navegador recebe sua própria chave proprietária
de 256 bits; a chave original nunca atravessa a rede.

Para consultar outro conjunto de dados, clique em **Desbloquear e trocar
dados**. A sincronização é pausada imediatamente enquanto os campos estiverem
editáveis.

Ao criar, editar, mover ou excluir conteúdo, o app aguarda um pequeno intervalo
e sincroniza somente o Lab afetado. A cada 30 segundos, ao recuperar a conexão
ou ao voltar para a janela, também procura atualizações.

Antes de enviar, o cliente:

1. recebe a revisão remota;
2. compara o estado remoto, local e a última base sincronizada;
3. mescla registros pelo identificador;
4. envia com `expectedRevision`;
5. repete a operação se outro dispositivo tiver atualizado a mesma revisão.

Isso impede tanto a colisão acidental de palavra + PIN quanto a sobrescrita de
um Lab inteiro. Em uma colisão de edição entre dispositivos autorizados, vence
o registro com data de atualização mais recente; sem data, o conteúdo local é
preservado. Para recuperação de conta quando todos os dispositivos forem
perdidos, a evolução recomendada continua sendo Supabase Auth.

### Dispositivos pareados

Em **Configurações → Sincronização**, o bloco **Dispositivos pareados** mostra
quantos navegadores estão autorizados, o tipo de aparelho e a última atividade.
O botão de desconectar revoga somente o token daquele aparelho. Cards, textos,
pastas e revisões remotas permanecem intactos; o aparelho desconectado precisará
ser pareado novamente para voltar a sincronizar. O servidor armazena apenas um
identificador técnico, rótulo, datas e hashes das chaves — nunca a chave privada
do navegador.

Cada dispositivo também possui um papel de conexão:

- **Primária · envia**: recebe dados e pode publicar alterações. Ao escolher
  outra conexão como primária, a anterior passa automaticamente para estudo.
- **Somente estudo**: recebe o estado da conexão primária, mas não publica
  alterações. Os comandos de criação, edição estrutural, exclusão e organização
  ficam bloqueados; respostas de estudo continuam funcionando localmente. Se
  alguma alteração local ocorrer por uma ação de estudo, ela não é enviada e
  pode ser substituída pela próxima atualização recebida.

## 4. Áudio

Áudio não é sincronizado. O VocabLab e o ReadLab continuam usando
`openai/gpt-audio-mini` como modelo primário e guardam os arquivos gerados no
Cache Storage de cada navegador.
