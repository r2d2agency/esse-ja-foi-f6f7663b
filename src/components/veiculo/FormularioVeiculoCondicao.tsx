import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxSearch } from "@/components/ui/combobox-search";
import { FileUpload } from "@/components/onboarding/FileUpload";
import { FotoSlot } from "@/components/veiculo/FotoSlot";
import { OpcaoBotoes } from "@/components/veiculo/OpcaoBotoes";
import { OpcaoMultipla } from "@/components/veiculo/OpcaoMultipla";
import { buscarCep } from "@/lib/viacep";
import { maskCep, maskKm, maskMoeda, maskPlaca } from "@/lib/brasil";
import { COMBUSTIVEIS, CAMBIOS, ACESSORIOS_VEICULO } from "@/lib/constants-veiculos";
import { FOTOS_VEICULO, type CondicaoVeiculo } from "@/lib/veiculo-condicao";

const CAMPO = "h-11";

/**
 * Bloco de dados básicos do veículo + condição (vistoria simplificada) + fotos
 * guiadas — compartilhado entre o pré-cadastro interno (`WizardPreCadastro`) e o
 * formulário público de vistoria por link (`/vistoria/$token`), para que os dois
 * fluxos capturem exatamente as mesmas informações.
 */
export function FormularioVeiculoCondicao({
  veiculo,
  setVeiculo,
  condicao,
  setCondicaoCampo,
  crlv,
  setCrlv,
  fotos,
  setFotos,
}: {
  veiculo: Record<string, string>;
  setVeiculo: Dispatch<SetStateAction<Record<string, string>>>;
  condicao: CondicaoVeiculo;
  setCondicaoCampo: (patch: Partial<CondicaoVeiculo>) => void;
  crlv: string | null;
  setCrlv: Dispatch<SetStateAction<string | null>>;
  fotos: Record<string, string | null>;
  setFotos: Dispatch<SetStateAction<Record<string, string | null>>>;
}) {
  async function preencherCepVeiculo(cep: string) {
    if (cep.replace(/\D/g, "").length !== 8) return;
    try {
      const r: any = await buscarCep(cep);
      if (!r) return;
      setVeiculo((v) => ({
        ...v,
        endereco: r.logradouro || v.endereco,
        cidade: r.localidade || r.cidade || v.cidade,
        uf: r.uf || v.uf,
      }));
    } catch {
      /* silencioso */
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <Campo label="Placa" valor={veiculo.placa} onChange={(v) => setVeiculo({ ...veiculo, placa: maskPlaca(v) })} placeholder="ABC1D23" />
        <Campo label="Marca" valor={veiculo.marca} onChange={(v) => setVeiculo({ ...veiculo, marca: v })} />
        <Campo label="Modelo" valor={veiculo.modelo} onChange={(v) => setVeiculo({ ...veiculo, modelo: v })} />
        <Campo label="Versão" valor={veiculo.versao} onChange={(v) => setVeiculo({ ...veiculo, versao: v })} />
        <Campo label="Ano fabricação" valor={veiculo.anoFabricacao} onChange={(v) => setVeiculo({ ...veiculo, anoFabricacao: v })} />
        <Campo label="Ano modelo" valor={veiculo.anoModelo} onChange={(v) => setVeiculo({ ...veiculo, anoModelo: v })} />
        <Campo label="Cor" valor={veiculo.cor} onChange={(v) => setVeiculo({ ...veiculo, cor: v })} />
        <Campo label="KM" valor={veiculo.km} onChange={(v) => setVeiculo({ ...veiculo, km: maskKm(v) })} />
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-600">Câmbio</Label>
          <ComboboxSearch
            options={CAMBIOS}
            value={veiculo.cambio}
            onChange={(v) => setVeiculo({ ...veiculo, cambio: v })}
            placeholder="Selecione"
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold text-slate-600">Combustível</Label>
          <ComboboxSearch
            options={COMBUSTIVEIS}
            value={veiculo.combustivel}
            onChange={(v) => setVeiculo({ ...veiculo, combustivel: v })}
            placeholder="Selecione"
            className="h-11"
          />
        </div>
        <Campo label="Valor pretendido (R$)" valor={veiculo.valorInteresse} onChange={(v) => setVeiculo({ ...veiculo, valorInteresse: maskMoeda(v) })} placeholder="R$ 0,00" />
        <Campo
          label="CEP onde está o veículo"
          valor={veiculo.cep}
          onChange={(v) => {
            const cep = maskCep(v);
            setVeiculo({ ...veiculo, cep });
            void preencherCepVeiculo(cep);
          }}
          placeholder="00000-000"
        />
        <Campo label="Endereço" valor={veiculo.endereco} onChange={(v) => setVeiculo({ ...veiculo, endereco: v })} />
        <Campo label="Cidade" valor={veiculo.cidade} onChange={(v) => setVeiculo({ ...veiculo, cidade: v })} />
        <Campo label="UF" valor={veiculo.uf} onChange={(v) => setVeiculo({ ...veiculo, uf: v.toUpperCase().slice(0, 2) })} />
      </div>

      <div className="space-y-5 border-t border-slate-100 pt-6">
        <p className="text-sm font-bold text-slate-900">Condição do veículo</p>
        <p className="text-xs text-slate-500">
          As mesmas perguntas que o vendedor responderia no cadastro dele — aqui preenchidas
          com base no que foi observado no veículo.
        </p>

        <OpcaoBotoes
          label="O veículo está funcionando normalmente?"
          opcoes={["Sim", "Não", "Possui algum problema"]}
          value={condicao.funcionamento}
          onChange={(v) => setCondicaoCampo({ funcionamento: v })}
          colunas={3}
        />
        {condicao.funcionamento && condicao.funcionamento !== "Sim" && (
          <Textarea
            placeholder="Conte brevemente o que acontece"
            value={condicao.funcionamentoObs}
            onChange={(e) => setCondicaoCampo({ funcionamentoObs: e.target.value })}
            className="rounded-xl"
          />
        )}

        <OpcaoBotoes
          label="Existe algum problema conhecido no motor?"
          opcoes={["Não", "Sim", "Não sei"]}
          value={condicao.motor}
          onChange={(v) => setCondicaoCampo({ motor: v })}
          colunas={3}
        />
        {condicao.motor === "Sim" && (
          <Textarea
            placeholder="Qual problema?"
            value={condicao.motorObs}
            onChange={(e) => setCondicaoCampo({ motorObs: e.target.value })}
            className="rounded-xl"
          />
        )}

        <OpcaoBotoes
          label="Existe algum problema conhecido no câmbio?"
          opcoes={["Não", "Sim", "Não sei"]}
          value={condicao.cambioProblema}
          onChange={(v) => setCondicaoCampo({ cambioProblema: v })}
          colunas={3}
        />

        <OpcaoBotoes
          label="Como está a lataria?"
          opcoes={["Excelente", "Boa", "Pequenos detalhes", "Possui avarias"]}
          value={condicao.lataria}
          onChange={(v) => setCondicaoCampo({ lataria: v })}
          colunas={2}
        />
        {condicao.lataria === "Possui avarias" && (
          <Textarea
            placeholder="Conte brevemente"
            value={condicao.latariaObs}
            onChange={(e) => setCondicaoCampo({ latariaObs: e.target.value })}
            className="rounded-xl"
          />
        )}

        <OpcaoBotoes
          label="Como está o interior do veículo?"
          opcoes={["Excelente", "Bom", "Sinais de uso", "Possui avarias"]}
          value={condicao.interior}
          onChange={(v) => setCondicaoCampo({ interior: v })}
          colunas={2}
        />
        <OpcaoBotoes
          label="Como estão os pneus?"
          opcoes={["Bons", "Meia vida", "Substituição", "Não sei"]}
          value={condicao.pneus}
          onChange={(v) => setCondicaoCampo({ pneus: v })}
          colunas={2}
        />

        <div className="space-y-5 border-t border-slate-100 pt-6">
          <p className="text-sm text-slate-500">
            Essas informações serão verificadas durante a análise do veículo.
          </p>
          <OpcaoBotoes label="Já sofreu acidente?" opcoes={["Não", "Sim", "Não sei"]} value={condicao.acidente} onChange={(v) => setCondicaoCampo({ acidente: v })} colunas={3} />
          <OpcaoBotoes label="Já passou por leilão?" opcoes={["Não", "Sim", "Não sei"]} value={condicao.leilao} onChange={(v) => setCondicaoCampo({ leilao: v })} colunas={3} />
          <OpcaoBotoes label="Possui sinistro conhecido?" opcoes={["Não", "Sim", "Não sei"]} value={condicao.sinistro} onChange={(v) => setCondicaoCampo({ sinistro: v })} colunas={3} />
          <OpcaoBotoes label="Possui débitos conhecidos (IPVA, multas, licenciamento)?" opcoes={["Não", "Sim", "Não sei"]} value={condicao.debitos} onChange={(v) => setCondicaoCampo({ debitos: v })} colunas={3} />
          <OpcaoBotoes label="Possui alguma restrição impeditiva de transferência (alienação, judicial, etc.)?" opcoes={["Não", "Sim", "Não sei"]} value={condicao.restricao} onChange={(v) => setCondicaoCampo({ restricao: v })} colunas={3} />
          {[condicao.acidente, condicao.leilao, condicao.sinistro, condicao.debitos, condicao.restricao].includes("Sim") && (
            <Textarea
              placeholder="Complemente o histórico se necessário"
              value={condicao.historicoObs}
              onChange={(e) => setCondicaoCampo({ historicoObs: e.target.value })}
              className="rounded-xl"
            />
          )}
        </div>

        <div className="space-y-5 border-t border-slate-100 pt-6">
          <OpcaoBotoes label="Chave reserva?" opcoes={["Sim", "Não"]} value={condicao.chaveReserva} onChange={(v) => setCondicaoCampo({ chaveReserva: v })} />
          <OpcaoBotoes label="Manual?" opcoes={["Sim", "Não"]} value={condicao.manual} onChange={(v) => setCondicaoCampo({ manual: v })} />
          <OpcaoBotoes label="Estepe?" opcoes={["Sim", "Não"]} value={condicao.estepe} onChange={(v) => setCondicaoCampo({ estepe: v })} />
          <OpcaoMultipla
            label="Acessórios do veículo"
            opcoes={ACESSORIOS_VEICULO}
            value={condicao.acessoriosSelecionados}
            onChange={(v) => setCondicaoCampo({ acessoriosSelecionados: v })}
            colunas={2}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-6">
        <p className="text-sm font-bold text-slate-900">Documentos e fotos do veículo</p>
        <FileUpload label="CRLV-e do veículo" value={crlv} onChange={setCrlv} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FOTOS_VEICULO.map((f) => (
            <FotoSlot
              key={f.id}
              label={f.label}
              dica={f.dica}
              value={fotos[f.id] || null}
              onChange={(url) => setFotos((atual) => ({ ...atual, [f.id]: url }))}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export function Campo({
  label,
  valor,
  onChange,
  placeholder,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-bold text-slate-600">{label}</Label>
      <Input
        className={CAMPO}
        value={valor}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
