export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acessorios_catalogo: {
        Row: {
          ativo: boolean
          categoria: string | null
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          criado_em: string
          data: string
          endereco_vistoria: string | null
          hora: string
          id: string
          latitude: number | null
          longitude: number | null
          observacao: string | null
          parceiro_id: string | null
          responsavel_interno_id: string | null
          status: string
          unidade_local: string | null
          veiculo_id: string | null
          vistoriador_id: string | null
        }
        Insert: {
          criado_em?: string
          data: string
          endereco_vistoria?: string | null
          hora: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string | null
          parceiro_id?: string | null
          responsavel_interno_id?: string | null
          status?: string
          unidade_local?: string | null
          veiculo_id?: string | null
          vistoriador_id?: string | null
        }
        Update: {
          criado_em?: string
          data?: string
          endereco_vistoria?: string | null
          hora?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          observacao?: string | null
          parceiro_id?: string | null
          responsavel_interno_id?: string | null
          status?: string
          unidade_local?: string | null
          veiculo_id?: string | null
          vistoriador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_vistoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_responsavel_interno_id_fkey"
            columns: ["responsavel_interno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_vistoriador_id_fkey"
            columns: ["vistoriador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncios: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          criado_em: string
          descricao: string | null
          destaques: Json | null
          foto_capa_id: string | null
          id: string
          status: string
          titulo: string
          veiculo_id: string | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          criado_em?: string
          descricao?: string | null
          destaques?: Json | null
          foto_capa_id?: string | null
          id?: string
          status?: string
          titulo: string
          veiculo_id?: string | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          criado_em?: string
          descricao?: string | null
          destaques?: Json | null
          foto_capa_id?: string | null
          id?: string
          status?: string
          titulo?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_itens: {
        Row: {
          categoria: string
          criado_em: string
          foto_obrigatoria: boolean
          id: string
          modelo_id: string | null
          opcoes: Json | null
          ordem: number
          peso_depreciacao_id: string | null
          tipo_resposta: string
          titulo: string
        }
        Insert: {
          categoria: string
          criado_em?: string
          foto_obrigatoria?: boolean
          id?: string
          modelo_id?: string | null
          opcoes?: Json | null
          ordem?: number
          peso_depreciacao_id?: string | null
          tipo_resposta: string
          titulo: string
        }
        Update: {
          categoria?: string
          criado_em?: string
          foto_obrigatoria?: boolean
          id?: string
          modelo_id?: string | null
          opcoes?: Json | null
          ordem?: number
          peso_depreciacao_id?: string | null
          tipo_resposta?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_itens_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "checklist_modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_modelos: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
          versao: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
          versao?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
          versao?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          autoriza_contato: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf_cnpj: string
          criado_em: string
          email: string | null
          endereco: string | null
          id: string
          lead_origem_id: string | null
          nome: string
          numero: string | null
          telefone: string | null
          tipo: string
          uf: string | null
          whatsapp: string | null
        }
        Insert: {
          autoriza_contato?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf_cnpj: string
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          lead_origem_id?: string | null
          nome: string
          numero?: string | null
          telefone?: string | null
          tipo: string
          uf?: string | null
          whatsapp?: string | null
        }
        Update: {
          autoriza_contato?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf_cnpj?: string
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          lead_origem_id?: string | null
          nome?: string
          numero?: string | null
          telefone?: string | null
          tipo?: string
          uf?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_lead_origem_id_fkey"
            columns: ["lead_origem_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      compradores_verificacao: {
        Row: {
          analisado_em: string | null
          analisado_por: string | null
          cpf_cnpj: string
          criado_em: string
          documentos: Json | null
          id: string
          motivo: string | null
          profile_id: string | null
          razao_social: string | null
          responsavel: string | null
          status: string
          tipo: string
        }
        Insert: {
          analisado_em?: string | null
          analisado_por?: string | null
          cpf_cnpj: string
          criado_em?: string
          documentos?: Json | null
          id?: string
          motivo?: string | null
          profile_id?: string | null
          razao_social?: string | null
          responsavel?: string | null
          status?: string
          tipo: string
        }
        Update: {
          analisado_em?: string | null
          analisado_por?: string | null
          cpf_cnpj?: string
          criado_em?: string
          documentos?: Json | null
          id?: string
          motivo?: string | null
          profile_id?: string | null
          razao_social?: string | null
          responsavel?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compradores_verificacao_analisado_por_fkey"
            columns: ["analisado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compradores_verificacao_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          valor: Json | null
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          valor?: Json | null
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          valor?: Json | null
        }
        Relationships: []
      }
      configuracoes_sistema: {
        Row: {
          atualizado_em: string
          chave: string
          descricao: string | null
          valor: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          descricao?: string | null
          valor: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          valor?: string
        }
        Relationships: []
      }
      depreciacao_calculos: {
        Row: {
          atualizado_em: string
          criado_em: string
          detalhamento: Json | null
          fora_da_curva: boolean | null
          id: string
          laudo_id: string | null
          usuario_id: string | null
          valor_final: number | null
          valor_fipe: number | null
          veiculo_id: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          detalhamento?: Json | null
          fora_da_curva?: boolean | null
          id?: string
          laudo_id?: string | null
          usuario_id?: string | null
          valor_final?: number | null
          valor_fipe?: number | null
          veiculo_id?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          detalhamento?: Json | null
          fora_da_curva?: boolean | null
          id?: string
          laudo_id?: string | null
          usuario_id?: string | null
          valor_final?: number | null
          valor_fipe?: number | null
          veiculo_id?: string | null
        }
        Relationships: []
      }
      depreciacao_regras: {
        Row: {
          ativo: boolean
          criado_em: string
          fator_grave: number | null
          fator_leve: number | null
          fator_media: number | null
          id: string
          item_id: string | null
          resposta: string | null
          tipo_desconto: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          fator_grave?: number | null
          fator_leve?: number | null
          fator_media?: number | null
          id?: string
          item_id?: string | null
          resposta?: string | null
          tipo_desconto?: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          fator_grave?: number | null
          fator_leve?: number | null
          fator_media?: number | null
          id?: string
          item_id?: string | null
          resposta?: string | null
          tipo_desconto?: string
          valor?: number
        }
        Relationships: []
      }
      lances: {
        Row: {
          comprador_id: string | null
          criado_em: string
          id: string
          ip: string | null
          leilao_id: string | null
          sessao: string | null
          valido: boolean
          valor: number
        }
        Insert: {
          comprador_id?: string | null
          criado_em?: string
          id?: string
          ip?: string | null
          leilao_id?: string | null
          sessao?: string | null
          valido?: boolean
          valor: number
        }
        Update: {
          comprador_id?: string | null
          criado_em?: string
          id?: string
          ip?: string | null
          leilao_id?: string | null
          sessao?: string | null
          valido?: boolean
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lances_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lances_leilao_id_fkey"
            columns: ["leilao_id"]
            isOneToOne: false
            referencedRelation: "leiloes"
            referencedColumns: ["id"]
          },
        ]
      }
      laudo_fotos: {
        Row: {
          categoria_foto: string | null
          criado_em: string
          id: string
          item_id: string | null
          laudo_id: string | null
          obrigatoria: boolean
          url: string
        }
        Insert: {
          categoria_foto?: string | null
          criado_em?: string
          id?: string
          item_id?: string | null
          laudo_id?: string | null
          obrigatoria?: boolean
          url: string
        }
        Update: {
          categoria_foto?: string | null
          criado_em?: string
          id?: string
          item_id?: string | null
          laudo_id?: string | null
          obrigatoria?: boolean
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "laudo_fotos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laudo_fotos_laudo_id_fkey"
            columns: ["laudo_id"]
            isOneToOne: false
            referencedRelation: "laudos"
            referencedColumns: ["id"]
          },
        ]
      }
      laudo_respostas: {
        Row: {
          criado_em: string
          gravidade: string | null
          id: string
          item_id: string | null
          laudo_id: string | null
          observacao: string | null
          opcao_escolhida: string | null
          resposta: string | null
          tem_avaria: boolean
          valor_numero: number | null
        }
        Insert: {
          criado_em?: string
          gravidade?: string | null
          id?: string
          item_id?: string | null
          laudo_id?: string | null
          observacao?: string | null
          opcao_escolhida?: string | null
          resposta?: string | null
          tem_avaria?: boolean
          valor_numero?: number | null
        }
        Update: {
          criado_em?: string
          gravidade?: string | null
          id?: string
          item_id?: string | null
          laudo_id?: string | null
          observacao?: string | null
          opcao_escolhida?: string | null
          resposta?: string | null
          tem_avaria?: boolean
          valor_numero?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "laudo_respostas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laudo_respostas_laudo_id_fkey"
            columns: ["laudo_id"]
            isOneToOne: false
            referencedRelation: "laudos"
            referencedColumns: ["id"]
          },
        ]
      }
      laudos: {
        Row: {
          agendamento_id: string | null
          bloqueado: boolean
          criado_em: string
          enviado_em: string | null
          id: string
          observacoes_gerais: string | null
          protocolo: string
          status: string
          veiculo_id: string | null
          vistoriador_id: string | null
        }
        Insert: {
          agendamento_id?: string | null
          bloqueado?: boolean
          criado_em?: string
          enviado_em?: string | null
          id?: string
          observacoes_gerais?: string | null
          protocolo: string
          status?: string
          veiculo_id?: string | null
          vistoriador_id?: string | null
        }
        Update: {
          agendamento_id?: string | null
          bloqueado?: boolean
          criado_em?: string
          enviado_em?: string | null
          id?: string
          observacoes_gerais?: string | null
          protocolo?: string
          status?: string
          veiculo_id?: string | null
          vistoriador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laudos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laudos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laudos_vistoriador_id_fkey"
            columns: ["vistoriador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ano: number | null
          campanha: string | null
          cidade: string | null
          convertido_cliente_id: string | null
          criado_em: string
          id: string
          marca: string | null
          mensagem: string | null
          modelo: string | null
          nome: string
          origem: string | null
          responsavel_id: string | null
          status: string
          tentativas_contato: number
          whatsapp: string
        }
        Insert: {
          ano?: number | null
          campanha?: string | null
          cidade?: string | null
          convertido_cliente_id?: string | null
          criado_em?: string
          id?: string
          marca?: string | null
          mensagem?: string | null
          modelo?: string | null
          nome: string
          origem?: string | null
          responsavel_id?: string | null
          status?: string
          tentativas_contato?: number
          whatsapp: string
        }
        Update: {
          ano?: number | null
          campanha?: string | null
          cidade?: string | null
          convertido_cliente_id?: string | null
          criado_em?: string
          id?: string
          marca?: string | null
          mensagem?: string | null
          modelo?: string | null
          nome?: string
          origem?: string | null
          responsavel_id?: string | null
          status?: string
          tentativas_contato?: number
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leiloes: {
        Row: {
          anuncio_id: string | null
          criado_em: string
          fim_em: string
          gatilho_prorrogacao_minutos: number
          id: string
          incremento_minimo: number
          inicio_em: string
          lance_inicial: number
          prorrogacao_ativa: boolean
          prorrogacao_minutos: number
          status: string
          timeout_arremate_horas: number
          veiculo_id: string | null
          vencedor_lance_id: string | null
        }
        Insert: {
          anuncio_id?: string | null
          criado_em?: string
          fim_em: string
          gatilho_prorrogacao_minutos?: number
          id?: string
          incremento_minimo?: number
          inicio_em: string
          lance_inicial: number
          prorrogacao_ativa?: boolean
          prorrogacao_minutos?: number
          status?: string
          timeout_arremate_horas?: number
          veiculo_id?: string | null
          vencedor_lance_id?: string | null
        }
        Update: {
          anuncio_id?: string | null
          criado_em?: string
          fim_em?: string
          gatilho_prorrogacao_minutos?: number
          id?: string
          incremento_minimo?: number
          inicio_em?: string
          lance_inicial?: number
          prorrogacao_ativa?: boolean
          prorrogacao_minutos?: number
          status?: string
          timeout_arremate_horas?: number
          veiculo_id?: string | null
          vencedor_lance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leiloes_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leiloes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          acao: string | null
          criado_em: string
          dados_antes: Json | null
          dados_depois: Json | null
          entidade: string | null
          entidade_id: string | null
          id: string
          ip: string | null
          profile_id: string | null
        }
        Insert: {
          acao?: string | null
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          ip?: string | null
          profile_id?: string | null
        }
        Update: {
          acao?: string | null
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          ip?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_vistoria: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnpj: string | null
          contato: string | null
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          contato?: string | null
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj?: string | null
          contato?: string | null
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          atualizado_em: string
          bairro: string | null
          cadastro_completo: boolean
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          criado_em: string
          doc_cnh_frente: string | null
          doc_cnh_verso: string | null
          doc_comprovante: string | null
          doc_crlv: string | null
          doc_selfie: string | null
          email: string
          endereco: string | null
          id: string
          nome: string | null
          numero: string | null
          role: Database["public"]["Enums"]["app_role"]
          senha_hash: string | null
          telefone: string | null
          uf: string | null
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          cadastro_completo?: boolean
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          criado_em?: string
          doc_cnh_frente?: string | null
          doc_cnh_verso?: string | null
          doc_comprovante?: string | null
          doc_crlv?: string | null
          doc_selfie?: string | null
          email: string
          endereco?: string | null
          id: string
          nome?: string | null
          numero?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          senha_hash?: string | null
          telefone?: string | null
          uf?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          cadastro_completo?: boolean
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          criado_em?: string
          doc_cnh_frente?: string | null
          doc_cnh_verso?: string | null
          doc_comprovante?: string | null
          doc_crlv?: string | null
          doc_selfie?: string | null
          email?: string
          endereco?: string | null
          id?: string
          nome?: string | null
          numero?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          senha_hash?: string | null
          telefone?: string | null
          uf?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      veiculos: {
        Row: {
          ano_fabricacao: number
          ano_modelo: number
          cambio: string | null
          cep_local: string | null
          chassi_parcial: string | null
          cliente_id: string | null
          combustivel: string | null
          cor: string | null
          criado_em: string
          criado_por: string | null
          endereco_local: string | null
          id: string
          km: number | null
          latitude: number | null
          longitude: number | null
          marca: string
          modelo: string
          placa: string
          renavam: string
          status: string
          tipo_expectativa: string | null
          valor_fipe: number | null
          valor_interesse_cliente: number | null
          versao: string | null
        }
        Insert: {
          ano_fabricacao: number
          ano_modelo: number
          cambio?: string | null
          cep_local?: string | null
          chassi_parcial?: string | null
          cliente_id?: string | null
          combustivel?: string | null
          cor?: string | null
          criado_em?: string
          criado_por?: string | null
          endereco_local?: string | null
          id?: string
          km?: number | null
          latitude?: number | null
          longitude?: number | null
          marca: string
          modelo: string
          placa: string
          renavam: string
          status?: string
          tipo_expectativa?: string | null
          valor_fipe?: number | null
          valor_interesse_cliente?: number | null
          versao?: string | null
        }
        Update: {
          ano_fabricacao?: number
          ano_modelo?: number
          cambio?: string | null
          cep_local?: string | null
          chassi_parcial?: string | null
          cliente_id?: string | null
          combustivel?: string | null
          cor?: string | null
          criado_em?: string
          criado_por?: string | null
          endereco_local?: string | null
          id?: string
          km?: number | null
          latitude?: number | null
          longitude?: number | null
          marca?: string
          modelo?: string
          placa?: string
          renavam?: string
          status?: string
          tipo_expectativa?: string | null
          valor_fipe?: number | null
          valor_interesse_cliente?: number | null
          versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          comprador_id: string | null
          criado_em: string
          data: string
          id: string
          leilao_id: string | null
          observacao: string | null
          responsavel_id: string | null
          valor_acertado: number
          veiculo_id: string | null
        }
        Insert: {
          comprador_id?: string | null
          criado_em?: string
          data?: string
          id?: string
          leilao_id?: string | null
          observacao?: string | null
          responsavel_id?: string | null
          valor_acertado: number
          veiculo_id?: string | null
        }
        Update: {
          comprador_id?: string | null
          criado_em?: string
          data?: string
          id?: string
          leilao_id?: string | null
          observacao?: string | null
          responsavel_id?: string | null
          valor_acertado?: number
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_leilao_id_fkey"
            columns: ["leilao_id"]
            isOneToOne: false
            referencedRelation: "leiloes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role:
        | {
            Args: { _role: Database["public"]["Enums"]["app_role"] }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
    }
    Enums: {
      app_role: "admin" | "operacao" | "vistoriador" | "comprador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operacao", "vistoriador", "comprador"],
    },
  },
} as const
