# Plano: Persistência e Recuperação de Dados no Cadastro do Vendedor

O objetivo é garantir que os dados preenchidos pelo vendedor durante o onboarding sejam salvos a cada passo e recuperados caso ele saia e volte à página, evitando perdas e garantindo a conclusão correta do cadastro.

## Alterações

### Backend (`src/lib/vendedor.functions.ts`)
- Ajustar `atualizarDocumentosVendedorFn` para aceitar campos adicionais de dados pessoais (data de nascimento, estado civil, profissão, nome da mãe) se necessário, ou garantir que os campos existentes cubram a necessidade.
- Validar se o esquema do banco de dados (`profiles`) comporta todos os campos novos.

### Frontend (`src/routes/vendedor.onboarding.tsx`)
- Implementar `useEffect` para carregar dados existentes usando `obterMeuPerfilFn` ao montar o componente.
- Garantir que o estado local (`personalData`, `addressData`, `files`) seja populado com os dados vindos do banco.
- Verificar se cada `handleNext` e `saveProgress` está enviando o payload correto.
- Adicionar feedbacks visuais de carregamento e sucesso ao salvar.

### Banco de Dados (`src/db/perfil.server.ts` e `src/db/auth.server.ts`)
- Adicionar colunas faltantes na tabela `profiles`:
  - `data_nascimento` (date)
  - `estado_civil` (text)
  - `profissao` (text)
  - `nome_mae` (text)
- Garantir que `ensurePerfilSchema` inclua essas colunas.

## Detalhes Técnicos
- Utilizar o `profileId` do usuário logado para buscar e atualizar os dados.
- O campo `cadastro_completo` continuará sendo o gatilho final para a análise administrativa.
- A cada clique em "Continuar", uma chamada assíncrona ao servidor garantirá que o progresso não seja perdido.
