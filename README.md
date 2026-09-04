# VocabLab Revolution

Aplicação web para estudo de inglês com flashcards gerados por IA, exercícios, leitura assistida e sincronização entre dispositivos.

## Panorama geral

O VocabLab organiza o aprendizado em Labs independentes, com armazenamento local no navegador e recursos de inteligência artificial para criação, revisão, tradução, pronúncia e processamento de textos.

### Labs disponíveis

- **VocabLab** — criação e gerenciamento de flashcards de vocabulário, incluindo tradução, classe gramatical, formas alternativas, exemplos, IPA, sinônimos e antônimos.
- **RegencyLab** — estudo de regência verbal e collocations, com padrões de uso, exemplos e significado em português.
- **RuleLab** — cartões de gramática e documentos teóricos com blocos de conteúdo.
- **ReadLab** — leitura de textos, processamento de imagens/OCR, consulta de vocabulário e áudio.
- **Grammar/QuestionLab** — tópicos gramaticais, questões de múltipla escolha e progresso de estudo.
- **Study/Review** — modos de estudo como flip, múltipla escolha, active recall e escrita, com acompanhamento de progresso e revisão de erros.

## Principais recursos

- Geração e revisão de conteúdo com modelos de IA.
- Autocomplete e previsão de palavras.
- Validação de classe gramatical e derivações.
- Geração de pronúncia e áudio sob demanda.
- Importação e revisão de pares do Quizlet via PDF.
- Pastas para organizar cards e documentos.
- Tema claro/escuro e preferências persistidas.
- Busca global pelo conteúdo dos Labs.
- Sincronização multi-dispositivo por código, usando Supabase.
- Suporte a operações offline, conflitos e tombstones no protocolo de sincronização.

## Stack

- **Next.js 16** com App Router.
- **React 19** e **TypeScript**.
- **Tailwind CSS** e componentes Radix UI.
- **Supabase** para backend e sincronização.
- **IndexedDB** para dados locais dos Labs.
- **OpenRouter** para acesso aos modelos de IA.
- **Vitest** para testes automatizados.
- **pnpm** para gerenciamento de dependências.

## Requisitos

- Node.js compatível com Next.js 16.
- pnpm instalado.
- Uma chave da OpenRouter para os recursos de IA.
- Projeto Supabase configurado caso a sincronização seja usada.

## Instalação

```bash
pnpm install
```

Copie o arquivo de exemplo de variáveis de ambiente:

```bash
cp .env.example .env.local
```

No Windows PowerShell, use:

```powershell
Copy-Item .env.example .env.local
```

Preencha pelo menos `OPENROUTER_API_KEY` para utilizar as funções de IA. Não compartilhe nem versione `.env.local`.

## Configuração

As variáveis estão documentadas em `.env.example`. Os grupos principais são:

- **OpenRouter e IA** — chave de API, modelos padrão, modelos por Lab e fallback Granite.
- **Supabase** — URL, service role key, pepper de sincronização e nomes das tabelas.
- **Áudio** — modelo, voz e formato da pronúncia e do ReadLab.
- **URL pública** — endereço usado pelo navegador e pela aplicação publicada.

Variáveis com `NEXT_PUBLIC_` podem ser expostas ao navegador. Chaves de serviço, segredos e pepper devem permanecer somente no servidor.

## Desenvolvimento

Inicie o servidor local:

```bash
pnpm dev
```

A aplicação ficará disponível em `http://localhost:3000`.

Comandos disponíveis:

```bash
pnpm dev       # inicia o ambiente de desenvolvimento
pnpm build     # gera a build de produção
pnpm start     # inicia a aplicação de produção
pnpm lint      # executa o ESLint
pnpm test      # executa os testes com Vitest
```

## Rotas principais

- `/` — VocabLab e flashcards.
- `/regency` — RegencyLab.
- `/rules` — RuleLab.
- `/read` — ReadLab.
- `/grammar` — Grammar/QuestionLab.

As APIs ficam em `app/api/` e estão agrupadas por domínio: IA, gramática, ReadLab e sincronização.

## Sincronização com Supabase

A sincronização é opcional. Para habilitá-la:

1. Configure as variáveis do Supabase em `.env.local`.
2. Execute as migrações de `supabase/migrations/` na ordem cronológica.
3. Inicie a aplicação e use o fluxo de pareamento entre dispositivos.

O protocolo transforma alterações em operações idempotentes, permitindo sincronização incremental e trabalho offline. Os dados de conteúdo permanecem armazenados localmente no navegador; o Supabase mantém o estado compartilhado necessário para sincronização.

A documentação operacional está em [`docs/sync.md`](docs/sync.md).

## Estrutura do projeto

```text
app/                 páginas e rotas de API do Next.js
components/          componentes React e componentes de interface
hooks/               hooks para estado, preferências e bancos locais
lib/                 regras de negócio, tipos, IA e sincronização
public/              ícones e recursos públicos usados pela aplicação
scripts/             scripts auxiliares, incluindo calibração de IA
styles/              estilos globais adicionais
supabase/migrations/ migrações do banco de sincronização
docs/                documentação operacional do V8
```

Materiais de construção do VocaLab Classic ficam localmente em `Classic Build/` e arquivos temporários ficam em `temp/`; essas pastas são ignoradas pelo Git.

## Testes

Os testes unitários ficam principalmente em `lib/` e cobrem sincronização, schemas, preferências de estudo, teoria, catálogos e fallbacks de IA:

```bash
pnpm test
```

Para validar a calibração integrada da IA, inicie a aplicação e execute:

```bash
node scripts/qa-ai-calibration.mjs
```

O script usa `QA_BASE_URL` quando fornecida e gera relatórios locais em `qa-reports/`.

## Segurança e operação

- Nunca versione `.env.local` ou chaves de API.
- Não exponha `SUPABASE_SERVICE_ROLE_KEY` no cliente.
- Use um `SYNC_CODE_PEPPER` aleatório com pelo menos 32 caracteres.
- Revise limites, custos e modelos configurados antes de executar testes de calibração em escala.
- Valide as migrações antes de usar a sincronização em produção.

## Status

Este repositório contém a implementação atual do VocabLab V8. O material de planejamento e reconstrução do VocaLab Classic está separado em `Classic Build/` e não faz parte do código executado por esta aplicação.
