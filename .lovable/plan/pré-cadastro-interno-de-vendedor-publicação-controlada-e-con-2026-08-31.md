# Pré-cadastro interno de vendedor, publicação controlada e consulta de laudo

Dois blocos de trabalho: (1) cadastro de vendedor feito pela administração com senha temporária, troca obrigatória de senha, termo de aceite digital e publicação controlada do veículo; (2) módulo de consulta veicular (Company Conferi) configurável, com resultado anexado à ficha do carro.

## Bloco 1 — Pré-cadastro interno e publicação

### 1.1 Cadastro pela administração
- Nova tela em `/admin/vendedores` → botão "Novo vendedor (interno)".
- Formulário: dados pessoais, contato, endereço e (opcional) o veículo inicial.
- Ao salvar: cria o perfil com `role = vendedor`, `origem_cadastro = INTERNO`, gera senha temporária forte, grava hash, marca `senha_temporaria = true` e dispensa as etapas de compliance (`status_compliance = DISPENSADO`, `verificado = true`).
- Envia e-mail com a senha temporária e o link de acesso. Admin também vê a senha uma única vez na tela, com opção de reenviar.

### 1.2 Primeiro acesso obrigatório
- Login com senha temporária redireciona para `/primeiro-acesso`:
  1. Troca de senha obrigatória (não permite reutilizar a temporária).
  2. Termo de aceite exibido na sequência, com o texto vigente do termo.
- O aceite registra: data/hora, nome digitado como assinatura, hash do texto do termo, versão, IP e user agent. Sem aceite, o vendedor não acessa o restante do portal.
- Texto do termo é editável em `/admin/configuracoes` (versão + conteúdo). Você poderá colar o termo definitivo lá.

### 1.3 Termo na ficha do veículo
- Na aba **Publicação** da ficha do carro aparece o bloco "Termo de aceite do vendedor": status, data/hora, IP, navegador, assinatura e link para visualizar o texto assinado.
- Veículo de cadastro interno entra direto no fluxo de publicação/leilão, sem passar pelas etapas de aprovação/avaliação do onboarding.

### 1.4 Publicação seletiva e link com token
- Canais por veículo passam a ser: `VITRINE`, `LEILAO`, `WHATSAPP (link privado)`.
- Nada vai para a vitrine automaticamente — só com o canal `VITRINE` ativo.
- Canal `WHATSAPP` gera um token de acesso único: `/v/{token}` abre a ficha pública do carro mesmo sem ele estar na vitrine. Token pode ser revogado/regenerado e tem contador de visualizações.
- Botão "Gerar mensagem WhatsApp": monta texto com emojis, dados principais, 1 foto de capa e o link com token, pronto para envio via Meta API ou cópia manual.

### 1.5 Laudo cautelar anexado
- Nova seção "Laudos e consultas" na ficha do veículo: upload de PDF/imagem de laudo cautelar externo (feito em qualquer loja), com data, fornecedor e observação, disponível para download/visualização.

## Bloco 2 — Consulta de laudo (Company Conferi)

- Em `/admin/configuracoes` → aba "Integrações": cadastro do provedor de consulta com nome, URL base do webservice, chave/token de acesso e liga/desliga do módulo. A chave é guardada como segredo no servidor, nunca exposta ao navegador.
- Botão "Testar conexão" valida as credenciais antes de ativar.
- Com o módulo ativo, cada veículo ganha o botão "Consultar laudo (Gold)". A consulta é feita pelo servidor usando placa/chassi do veículo.
- O retorno é gravado junto ao veículo: status, data, protocolo, resumo dos indicadores (roubo/furto, restrições, leilão, sinistro, débitos) e o documento/PDF quando disponível — com visualização e download.
- Falhas de comunicação e créditos insuficientes aparecem com mensagem clara e permitem nova tentativa; todo histórico de consultas fica registrado.

**Observação sobre a documentação:** o link da documentação da Company Conferi exige login, então o módulo será construído com endpoint e chave configuráveis e um mapeamento de resposta tolerante. Se você colar aqui um exemplo de requisição/resposta do painel deles, eu ajusto o mapeamento para os campos exatos.

## Detalhes técnicos

- Backend: novos módulos `src/db/pre-cadastro.server.ts`, `src/db/termos.server.ts`, `src/db/consulta-veicular.server.ts`, `src/db/laudos-externos.server.ts`, com `ensure*Schema` no padrão atual do projeto.
- Tabelas novas: `termos_versoes`, `termos_aceites`, `veiculo_laudos_externos`, `consulta_provedores`, `veiculo_consultas`. Colunas novas em `profiles` (`senha_temporaria`, `origem_cadastro`, `termo_aceito_em`) e em `publicacao_canais` (`token_acesso`, `token_ativo`, `visualizacoes`).
- Server functions correspondentes em `src/lib/*.functions.ts`; nenhuma chave de API chega ao cliente.
- Rotas novas: `src/routes/primeiro-acesso.tsx` e `src/routes/v.$token.tsx`; ajustes em `admin/vendedores.tsx`, `admin/veiculo.$id.tsx`, `admin/configuracoes.tsx` e `components/publicacao/CanaisPublicacao.tsx`.
