# 03 — Referência de funções

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

Catálogo das ~400 server functions do sistema, agrupadas por domínio. Todas ficam em
`src/lib/*.functions.ts` e sigam o mesmo padrão:

```ts
export const minhaFuncaoFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ... }))   // Zod
  .handler(async ({ data }) => {
    const usuario = await usuarioDaSessao();
    if (!usuario) throw new Error("Não autorizado.");
    return await minhaRegraDb(data, usuario);
  });
```

**Convenções de nome:** o nome exportado termina em `Fn` (as de query, `get`/`listar`) ou
não (as de ação). Os arquivos `.server.ts`aisy outsidem o `Fn` porque não são server functions
e sim a camada de regra.

---

## 1. Autenticação e sessão — `src/lib/auth.functions.ts`

| Função | O que faz |
|---|---|
| `seedSuperAdmin` | Cria/garante o superadmin inicial |
| `loginWithPassword` | Autentica e-mail+senha, emite token HMAC (12h), grava cookie |
| `getSessaoAtualFn` | Perfil do dono do cookie (inclui `pode_ver_valores`) |
| `logoutFn` | Apaga o cookie |
| `solicitarResetSenha` | Envia OTP por e-mail |
| `validarOTPResetFn` | Valida o OTP |
| `resetarSenhaFinalFn` | Aplica a nova senha |

Helpers (não são server functions) em `src/lib/sessao.server.ts`:
`usuarioDaSessao()`, `perfilDaSessao()`, `superadminDaSessao()`, `definirSessao()`, `encerrarSessao()`.

## 2. Superadmin e ações críticas — `src/lib/superadmin.functions.ts`

| Função | O que faz |
|---|---|
| `solicitarCodigoSuperadminFn` | Envia OTP por e-mail para ação sensível |
| `confirmarAcaoSuperadminFn` | Confirma e executa |

Ações liberadas (exatamente 4): `PROMOVER_SUPERADMIN`, `EXCLUIR_VEICULO_FORCADO`,
`EXCLUIR_PERFIL_FORCADO`, `RESET_BASE_OPERACIONAL`.

> Regra do módulo: `superadminDaSessao()` exige `role='admin' AND ativo AND protegido`. Não
> contorne isso.

## 3. Onboarding e primeiro acesso — `src/lib/pre-cadastro.functions.ts`, `onboarding.functions.ts`

| Função | O que faz |
|---|---|
| `criarVendedorInternoFn` | Admin cria vendedor com senha provisória |
| `reenviarSenhaTemporariaFn` | Reenvia a senha provisória |
| `getStatusPrimeiroAcessoFn` | Situação do primeiro acesso |
| `trocarSenhaPrimeiroAcessoFn` | Troca a senha provisória |
| `getResumoTermoFn` | Resumo do termo vigente |
| `getOnboardingStatusFn` | Etapa atual do onboarding do vendedor |

## 4. Vendedor — `src/lib/vendedor.functions.ts`

| Função | O que faz |
|---|---|
| `cadastrarVendedorFn` | Cadastro com OTP por e-mail |
| `validarOTPCadastroFn` / `resenderOTPCadastroFn` | Valida e reenvia o OTP do cadastro |
| `listarMeusVeiculosFn` / `cadastrarMeuVeiculoFn` | CRUD de veículos do vendedor |
| `obterMeuPerfilFn` / `atualizarMeuPerfilFn` / `alterarMinhaSenhaFn` | Perfil do vendedor |

## 5. Compliance do vendedor — `src/lib/vendedores-compliance.functions.ts`, `admin-compliance.functions.ts`

| Função | O que faz |
|---|---|
| `listarVendedoresFn` | Fila com filtros de status e busca |
| `obterDetalheVendedorFn` | Dossiê (documentos + histórico + IA) |
| `assumirAnaliseFn` | Admin assume o caso → `EM_ANALISE` |
| `atualizarStatusDocumentoFn` | Status de um documento |
| `aprovarVendedorComplianceFn` | Aprova (exige onboarding completo + 5 docs APROVADOS) |
| `solicitarPendenciaComplianceFn` | Marca pendência com motivo |
| `getComplianceVendedorFn` | Dossiê de compliance |
| `atualizarComplianceFn` | Status de documento; se reprovado → força `PENDENCIA` + `cadastro_completo=false` |

## 6. Compliance e cadastro do comprador — `src/lib/admin-compradores.functions.ts`, `comprador.functions.ts`, `comprador-pre-cadastro.functions.ts`

| Função | O que faz |
|---|---|
| `listarCompradoresFn` / `obterDetalheCompradorFn` | Fila e dossiê |
| `aprovarCompradorFn` | Aprova → liga `pode_ver_valores` + `pode_dar_lances` |
| `reprovarCompradorFn` | Reprova → zera as duas flags + `REPROVADO` |
| `solicitarPendenciaCompradorFn` | Pendência com motivo |
| `preCadastrarCompradorFn` | Pré-cadastro feito pelo admin, um a um |
| `criarPreCadastroPublicoFn` | **Pré-cadastro público** (link de campanha) |
| `cadastrarCompradorFn` | Cadastro PJ (wizard de 5 etapas) |
| `getPerfilCompradorFn` | Perfil + progresso |
| `salvarEtapaCompradorFn` | Salva etapa parcial (nunca regride o `etapa_cadastro`) |
| `enviarCadastroCompradorFn` | Envia para análise → `AGUARDANDO_ANALISE` |
| `enviarDocumentoCompradorFn` | Upload de documento |

## 7. Clientes e veículos — `src/lib/cadastro.functions.ts`, `admin-veiculos.functions.ts`, `admin-veiculo-detalhe.functions.ts`

| Função | O que faz |
|---|---|
| `listarClientesFn` / `salvarClienteFn` / `removerClienteFn` | CRUD de clientes |
| `listarVeiculosFn` / `salvarVeiculoFn` / `alterarStatusVeiculoFn` / `removerVeiculoFn` | CRUD de veículos |
| `timelineVeiculoFn` | Timeline de eventos do veículo |
| `getVeiculosAdminFn` / `assumirAnaliseVeiculoFn` | Fila de veículos |
| `getVeiculoDetalheAdminFn` | Dossiê do veículo |
| `atualizarStatusAnaliseFn` | Muda `status_analise` |
| `aprovarParaPublicacaoFn` | → `PRONTO_PARA_ANUNCIO` |
| `atualizarStatusDocumentoVeiculoFn` | Documento do veículo |

## 8. Anúncios, fotos e IA de imagem — `src/lib/anuncios.functions.ts`, `fotos-anuncio.functions.ts`

| Função | O que faz |
|---|---|
| `getProntosParaAnuncio` / `getAnunciosAdmin` | Listas |
| `getDadosParaNovoAnuncio` | Dados para montar o anúncio |
| `criarAnuncio` | Cria anúncio → `status_analise='ANUNCIADO'` |
| `getAnuncioVeiculoVendedor` | Anúncio do próprio vendedor |
| `detectarPlacaFotoFn` | IA: detecta a placa nas fotos |
| `gerarLegendaFotoFn` / `salvarLegendaFotoFn` / `salvarFotosProcessadasFn` | Legendas e fotos processadas |

## 9. Publicação — `src/lib/publicacao.functions.ts`

| Função | O que faz |
|---|---|
| `listarVeiculosAptosPublicacaoFn` | Só os `STATUS_APTOS` |
| `getCanaisPublicacaoFn` / `salvarCanalPublicacaoFn` | Canais do veículo |
| `listarPublicadosVitrineFn` | Publicado na vitrine |
| `regenerarTokenCanalFn` / `revogarTokenCanalFn` | Token do link `/c/$token` |
| `montarMensagemWhatsappFn` | Texto pronto do WhatsApp |
| `getVeiculoPorTokenFn` | Resolve veículo pelo token |

## 10. Vistorias e vistoriador — `src/lib/vistorias.functions.ts`, `vistoriador.functions.ts`, `vistoria-link.functions.ts`

| Função | O que faz |
|---|---|
| `getVistoriasAdminFn` / `getVeiculosAguardandoVistoriaFn` | Filas |
| `getUnidadesDisponiveisFn` / `getVistoriadoresUnidadeFn` / `getSlotsUnidadeDisponiveisFn` | Agenda |
| `getUnidadesCadastroFn` / `salvarUnidadeCadastroFn` / `getVistoriadoresCadastroFn` / `salvarVistoriadorCadastroFn` | Cadastros |
| `criarAgendamentoVistoriaFn` | Agenda a vistoria |
| `getVistoriaVendedorFn` / `confirmarPresencaVistoriaFn` / `remarcarAgendamentoVistoriaFn` | Lado do vendedor |
| `getVistoriasHojeVistoriadorFn` / `getPainelVistoriadorFn` | Lado do vistoriador |
| `iniciarCheckinFn` / `salvarItemChecklistFn` / `salvarFotoLaudoFn` / `getFotosLaudoFn` / `concluirVistoriaAppFn` | Execução no app |
| `getChecklistConfigFn` / `getRespostasChecklistFn` / `salvarRespostaChecklistFn` | Checklist |
| `gerarLinkVistoriaFn` / `getVistoriaPorTokenFn` / `enviarVistoriaPorTokenFn` / `revogarVistoriaLinkFn` | Link de vistoria |

## 11. Laudos — `src/lib/laudos.functions.ts`, `laudos-externos.functions.ts`

`detalheAgendamentoFn`, `criarLaudoFn`, `obterLaudoFn`, `salvarRespostaFn`, `salvarFotoFn`,
`removerFotoFn`, `salvarAcessoriosLaudoFn`, `validarPlacaFn`, `registrarDivergenciaFn`,
`enviarLaudoFn`, `pendenciasLaudoFn`, `devolverLaudoFn`, `listarLaudosFn`.

## 12. Pós-vistoria — `src/lib/analise-pos-vistoria.functions.ts`, `pos-vistoria.functions.ts`

| Função | O que faz |
|---|---|
| `getFilaAnalisePosVistoriaFn` / `getDetalheAnaliseVistoriaFn` | Fila e detalhe |
| `enviarPropostaVendedorFn` / `responderPropostaVendedorFn` | Proposta de valor ao vendedor |
| `listarPropostasPendentesVendedorFn` / `getPropostaVeiculoVendedorFn` | Lado do vendedor |
| `solicitarNovaVistoriaFn` | Refaz vistoria |
| `salvarPropostaValorFn` | Salva a proposta |

## 13. Leilão e lances — `src/lib/leilao.functions.ts`, `src/db/leilao.server.ts`

| Função | O que faz |
|---|---|
| `getActiveAuctions` | Leilões ativos (query simples) |
| `getLeilaoPorVeiculo` | Lance atual + contagem |
| `configurarLeilao` / `salvarLeilaoVeiculo` | Cria/edita o leilão |
| `registrarLance` | **Núcleo do lance** — valida tudo e insere |
| `getEstadoLeilao` | Estado atual (chama `processarCicloLeiloes` antes) |
| `processarCicloLeiloes` | Avança `AGENDADO→ATIVO` e `ATIVO→ENCERRADO` |
| `processarLembretesLeilao` | Lembretes a quem acompanha |
| `encerrarLeilaoAgora` / `cancelarLeilaoAdmin` / `cancelarLeilaoVeiculo` | Encerrar/cancelar |
| `resumoEncerramentoLeilao` | Resumo do fechamento |
| `listarLeiloesAdmin` | Lista administrativa |

## 14. Vitrine — `src/lib/vitrine.functions.ts`

`getVitrine` (lista da vitrine, exige login de comprador), `getAnuncioPublico` (detalhe).

> Aqui é onde os valores são mascarados. `getAcessoComercial()` decide se `lance_inicial`,
> `lance_atual` e `incremento_minimo` vêm `null` com `valores_ocultos=true`.

## 15. Negociação — `src/lib/negociacoes.functions.ts`

`getNegociacaoFn`, `getNegociacoesCompradorFn`, `getNegociacoesVendedorFn`,
`cancelarNegociacaoFn`, `salvarPrazoPagamentoFn`, listagem admin.

## 16. Pagamento — `src/lib/pagamentos.functions.ts`

| Função | O que faz |
|---|---|
| `iniciarPagamentoFn` | Cria/atualiza a cobrança PIX |
| `verificarPagamentoFn` | **Consulta o provedor — nunca confirma sozinho** |
| `getPagamentoFn` / `getPagamentoDaNegociacaoFn` | Leitura |
| `gerarNovaCobrancaFn` / `prorrogarPrazoPagamentoFn` | Reabrem cobrança vencida |
| `confirmarPagamentoManualFn` | Confirmação manual pelo admin |
| `expirarCobrancasFn` | Expira vencidas |
| `listarPagamentosAdminFn` / `getComprovanteFn` | Admin |

## 17. Financeiro e repasse — `src/lib/financeiro.functions.ts`

`getIndicadoresFinanceirosFn`, `listarRepassesAdminFn`, `getRepasseFn`, `autorizarRepasseFn`,
`confirmarConclusaoRepasseFn`, `salvarDadosBancariosFn`.

## 18. Entregas — `src/lib/entregas.functions.ts` (22 funções)

Leitura: `listarEntregasAdminFn`, `getEntregaAdminFn`, `listarEntregasCompradorFn`,
`getEntregaCompradorFn`, `listarEntregasVendedorFn`, `getEntregaVendedorFn`.

Ação: `agendarEntregaFn`, `confirmarAgendamentoFn`, `solicitarReagendamentoFn`, `regerarCodigoFn`,
`iniciarEntregaFn`, `registrarChegadaFn`, `validarCodigoFn`, `registrarEntregaFn`,
`confirmarRecebimentoFn`, `registrarDivergenciaFn`, `decidirDivergenciaFn`,
`registrarNaoComparecimentoFn`, `cancelarAgendamentoFn`, `adicionarObservacaoEntregaFn`,
`setPrazoConfirmacaoFn`.

## 19. Contratos — `src/lib/contratos.functions.ts`

`listarContratosFn`, `obterContratoFn`, `contratoDoVendedorFn`, `prepararGeracaoFn`,
`gerarContratoFn`, `enviarContratoFn`, `marcarContratoVisualizadoFn`,
`registrarRetornoAssinaturaFn`, `cancelarContratoFn`, `notificacoesContratosFn`.

## 20. Termos — `src/lib/termos.functions.ts`

`getTermoVigenteFn`, `salvarTermoFn`, `aceitarTermoFn`, `getAceitePorVeiculoFn`.

Aceite eletrônico com `conteudo_hash`, `versao`, `ip`, `user_agent` e `assinatura` (MP 2.200-2/2001,
art. 10 §2º). Tipos: `VENDEDOR` / `COMPRADOR`.

## 21. Comunicação / WhatsApp — `src/lib/comunicacoes.functions.ts` (36 funções)

### Configuração e templates
`getWhatsappConfigFn`, `updateWhatsappConfigFn`, `testarConexaoFn`, `sincronizarTemplatesFn`,
`criarTemplateMetaFn`, `excluirTemplateMetaFn`, `uploadMidiaTemplateFn`,
`anexarMidiaTemplateFn`, `buscarDadosAutomaticosFn`, `gerarNovoVerifyTokenFn`.

### Público e segmentos
`listarSegmentosFn`, `listarSegmentosComTotalFn`, `contarPublicoFn`, `estimarPublicoFn`,
`listarContatosWhatsappFn`, `exemploDestinatarioFn`.

### Campanhas
`criarCampanhaFn`, `criarCampanhaDisparoFn`, `getCampanhaDetalhesFn`, `listarCampanhasFn`,
`listarCampanhasDetalhadoFn`, `alterarStatusCampanhaFn`.

### Disparo
`dispararCampanhaAgoraFn`, `agendarDisparoCampanhaFn`, `processarDisparoAgoraFn`,
`processarEnvioCampanhaFn`, `enviarTesteFn`.

### Logs e diagnóstico
`getEnviosCampanhaFn`, `getLogsCampanhaFn`, `getWebhookLogsFn`, `executarDiagnosticoFn`.

### Indicadores
`getIndicadoresComunicacoesFn`.

## 22. Marketing e base de contatos — `src/lib/marketing.functions.ts` (19 funções)

`listarMarketingContatosFn`, `importarMarketingContatosFn`, `atualizarMarketingContatoFn`,
`excluirMarketingContatoFn`, `removerContatosSemWhatsappFn`, `criarMarketingTagFn`,
`listarMarketingTagsFn`, `atribuirMarketingTagFn`, `removerMarketingTagFn`,
`converterContatoEmCompradorFn`, `geocodificarContatosPendentesFn`.

Uazapi: `getUazapiConfigFn`, `salvarUazapiConfigFn`, `testarUazapiFn`, `listarGruposUazapiFn`,
`verificarWhatsappContatosFn`.

## 23. Conversas / atendimento — `src/lib/conversas.functions.ts` (14 funções)

`listarConversasFn`, `getConversaCompletaFn`, `enviarMensagemAtendenteFn`,
`uploadMidiaWhatsAppFn`, `definirApelidoFn`, `resolverConversaFn`, `atribuirResponsavelFn`,
`listarRespostasProntasFn`, `salvarRespostaProntaFn`, `excluirRespostaProntaFn`,
`listarContatosDisponiveisFn`, `cadastrarContatoFn`, `iniciarConversaFn`.

## 24. Consulta veicular — `src/lib/consulta-veicular.functions.ts`

`obterConsultaRegistradaFn`, `getProvedorConsultaFn`, `salvarProvedorConsultaFn`,
`testarConexaoConsultaFn`, `testarConsultaPlacaFn`, `consultarAgregadosPorPlacaFn`,
`consultarLaudoVeiculoFn`, `consultarDesvalorizacaoFipeFn`, `testarDesvalorizacaoFipeFn`,
`listarConsultasVeiculoFn`, `obterRelatorioConsultasFn`, `listarEventosConsultaFn`.

## 25. Depreciação — `src/lib/depreciacao.functions.ts`

`calcularDepreciacaoFn`, `obterHistoricoDepreciacaoFn`, `sobrescreverAjusteFn`.

## 26. Avaliação pós-venda — `src/lib/avaliacao-pos-venda.functions.ts`

`listarAvaliacoesPosVendaFn`, `criarAvaliacaoPosVendaFn`, `listarAvaliacoesCompradorFn`,
`anexarCautelarCompradorFn`.

## 27. Relatórios — `src/lib/relatorios.functions.ts`

`getRelatoriosGeraisFn`, `getRelatoriosVendasFn`, `getRelatorioComissoesFn`,
`getComissaoPadraoFn`, `setComissaoPadraoFn`.

## 28. Admin e plataforma — `src/lib/admin.functions.ts` (16 funções)

`listarVendedoresFn`, `listarCompradoresFn`, `listarUsuariosInternosFn`, `checkSystemHealthFn`,
`gerenciarUsuarioFn`, `excluirPerfilFn`, `listarConfiguracoesFn`, `salvarConfiguracaoFn`,
`listarDestinatariosNotificacaoFn`, `salvarDestinatarioNotificacaoFn`,
`removerDestinatarioNotificacaoFn`, `enviarEmailTesteFn`, `listarRegrasDepreciacaoFn`,
`salvarRegraDepreciacaoFn`, `duplicarRegraDepreciacaoFn`.

Mais: `getAdminDashboardDataFn` (`admin-dashboard.functions.ts`),
`getAnalyticsFn`/`getPontosMapaFn` (`analytics.functions.ts`),
`getSystemLogsFn`/`registrarErroClienteFn`/`limparLogsFn` (`logs.functions.ts`),
`listarAutomacoesFn`/`salvarAutomacaoFn`/`getExecucoesAutomacaoFn` (`automacoes.functions.ts`),
`listarChangelogFn`/`criarItemChangelogFn`/`atualizarItemChangelogFn`/`removerItemChangelogFn`
(`changelog.functions.ts`),
`getChecklistConfigAdminFn` + CRUD de categorias/itens + `aplicarTemplateChecklistFn`
(`admin-checklist.functions.ts`).

## 29. Comprador — utilidades — `src/lib/comprador.functions.ts`

`alternarFavoritoFn`, `listarFavoritosFn`, `salvarLembreteFn`, `listarLembretesFn`,
`listarNotificacoesFn`, `marcarNotificacoesLidasFn`, `getInteressesFn`, `updateInteressesFn`.

## 30. Extras

`getVersaoAppFn` (`versao.functions.ts`), `getConfigPublicaFn` (`config-publica.functions.ts`),
funções de demonstração (`demo.functions.ts`).

---

## Webhooks e endpoints HTTP — `src/routes/api/public/`

| Rota | O que faz |
|---|---|
| `webhooks/whatsapp.ts` | Recebe eventos da Meta (status de entrega, respostas) |
| `webhooks/pagamentos.ts` | Webhook do provedor PIX (valida `PIX_WEBHOOK_SECRET`) |
| `webhooks/conferi.ts` | Webhook da Company Conferi (perícia/FIPE) |
| `upload.ts` | Upload de arquivo (base64 — sem storage real) |
| `arquivo.$id.ts` | Serve o arquivo enviado |

---

**Próximo:** [04-regras-negocio.md](04-regras-negocio.md)
