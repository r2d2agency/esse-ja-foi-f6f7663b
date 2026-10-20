---
title: Cadastro Completo do Vendedor
description: Implementação do fluxo de onboarding de 5 etapas para validação de identidade, endereço e documentos do vendedor.
---

## Objetivos
Coletar dados pessoais, endereço e documentos para compliance, permitindo que o vendedor anuncie veículos após a aprovação.

## Arquitetura e Fluxo
- **Wizard de 5 Etapas**: Dados Pessoais -> Endereço -> Documentos -> Selfie -> Revisão.
- **Salvamento Automático**: Progresso salvo no banco de dados a cada etapa concluída ou ao "Salvar e sair".
- **Componente Reutilizável de Upload**: Gerencia miniaturas, estados (enviado, análise, etc.) e integração com câmera.
- **Integração ViaCEP**: Preenchimento automático de endereço.
- **Estados de Compliance**: Preparado para exibir pendências específicas solicitadas pelo admin.

## Detalhes Técnicos
- **Rota**: `/vendedor/onboarding` (reestruturada).
- **Componentes**: `FileUpload.tsx` para uploads, `EtapaProgresso.tsx` para indicador visual.
- **Validações**: CPF real, CEP, obrigatoriedade de documentos básicos.
- **Banco de Dados**: Atualização da tabela `profiles` via `atualizarDocumentosVendedorFn`.

## O que não será feito (fora de escopo)
- Painel administrativo para análise.
- Cadastro detalhado de veículos (apenas CRLV inicial).
- Integração real de processamento de imagem/OCR (serão simulados/placeholders).
- Assinatura digital de contratos.
