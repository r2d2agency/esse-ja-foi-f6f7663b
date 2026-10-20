# Plano de Correção: Fluxo de Autenticação e Onboarding

O usuário relatou que, após realizar o login, a tela fica em branco e apresenta erros de desserialização/validação (Zod). Isso geralmente ocorre por incompatibilidade entre os dados retornados pelo servidor e o que o cliente espera, ou falha no carregamento da rota protegida.

## Problemas Identificados
1. **Erro de Validação (Zod):** A mensagem "Invalid input" no `path: ["data"]` sugere que um `createServerFn` está recebendo ou retornando dados que não condizem com seu schema.
2. **Tela Branca:** Indica falha crítica na renderização da rota após o login, possivelmente devido a um loop de redirecionamento ou erro não tratado no loader/componente.
3. **Inconsistência de Dados:** O campo `cadastro_completo` e colunas de documentos podem não estar sendo tratados corretamente em todas as funções.

## Etapas de Implementação

### 1. Backend e Segurança (src/db)
- Revisar `ensureSuperAdmin` em `src/db/auth.server.ts` para garantir que todas as colunas necessárias (`documento_cnh_url`, `cadastro_completo`, etc.) existam.
- Ajustar `authenticate` para retornar o objeto completo esperado pelo frontend.

### 2. Funções de Servidor (src/lib)
- Ajustar `cadastrarVendedorFn` em `src/lib/vendedor.functions.ts` para garantir que o schema de entrada coincida com o que é enviado pelo formulário (removendo campos desnecessários no passo inicial).
- Validar o retorno de `loginWithPassword` em `src/lib/auth.functions.ts`.

### 3. Frontend e Roteamento (src/routes)
- Corrigir o redirecionamento no `handleLogin` e `handleCadastro` da landing page (`src/routes/index.tsx`).
- Adicionar verificações de hidratação e guards de erro em `src/routes/vendedor.tsx` e `src/routes/vendedor.onboarding.tsx` para evitar tela branca.
- Garantir que o `useAuth` armazene corretamente o token e o perfil.

### 4. Validação Técnica
- Testar o fluxo completo: Cadastro -> Login Automático -> Onboarding -> Dashboard.
- Verificar logs do console para garantir a ausência de erros de desserialização.

## Detalhes Técnicos
- Utilização de `createServerFn` do TanStack Start.
- Persistência de estado com Zustand (`useAuthStore`).
- Comunicação segura sem Supabase, usando PostgreSQL direto.
