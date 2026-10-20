# Simplificação de Formulários e Experiência do Usuário (UX)

O objetivo é reduzir a digitação manual, priorizando a seleção e preenchimento automático em todos os formulários da plataforma **Esse Já Foi**.

## Ações Prioritárias

### 1. Cadastro de Veículo (Prioridade Máxima)
- **Local:** `src/routes/vendedor.cadastrar.tsx`
- **Marcas/Modelos:** Implementar `ComboboxSearch` (select pesquisável) para Marcas. Carregar modelos dinamicamente com base na marca selecionada.
- **Campos de Seleção:** Converter campos de texto (Cor, Combustível, Câmbio, Portas) para `OpcaoBotoes` (chips/botões) para facilitar o toque no mobile.
- **Lógica Condicional:** Mostrar campos como "Qual sua relação com o proprietário?" ou "Dados do Financiamento" apenas se a opção negativa/positiva for selecionada.
- **Histórico:** Usar botões Sim/Não/Não Sei para Acidente, Leilão, Sinistro e Restrições.
- **Acessórios:** Usar switches ou botões para itens binários (Chave reserva, Manual, Estepe).
- **Quilometragem:** Ajustar para teclado numérico com sufixo "km".

### 2. Cadastro de Vendedor e Comprador
- **Locais:** `src/routes/cadastro.tsx`, `src/routes/comprador.cadastro.tsx`, `src/routes/vendedor.onboarding.tsx`.
- **Estado Civil e Profissão:** Trocar inputs de texto por seletores pré-definidos com opção "Outro".
- **Tipo de Pessoa:** No cadastro de comprador, usar botões grandes para PF/PJ em vez de dropdown.
- **CNPJ:** Implementar preenchimento automático (mocked/simulado por enquanto, com campos editáveis).

### 3. Sistema de Endereço (Global)
- **Local:** `src/components/FormCep.tsx` (a ser criado) ou integração nos formulários existentes.
- **Fluxo:** Digitar CEP -> Preencher Rua, Bairro, Cidade, Estado.
- **UF:** Mudar para select com todas as UFs brasileiras (sem digitação livre).

### 4. Componentes de UI
- **ComboboxSearch:** Criar componente reutilizável para listas longas com busca (Marcas, Modelos, Profissões).
- **OpcaoBotoes:** Atualizar para suportar melhor o layout mobile e estados condicionais.

## Detalhes Técnicos
- Utilizar `src/lib/constants-veiculos.ts` para centralizar as listas de opções.
- Garantir que a regra "Outro" -> "Digite qual" seja consistente em todos os seletores.
- Manter o salvamento automático via `localStorage` e `useServerFn`.
- Respeitar a regra de não alterar regras de negócio ou compliance, apenas a interface de entrada.
