import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  listarMarketingContatosFn,
  importarMarketingContatosFn,
  criarMarketingTagFn,
  atribuirMarketingTagFn,
  converterContatoEmCompradorFn,
  geocodificarContatosFn,
  getUazapiConfigFn,
  salvarUazapiConfigFn,
  verificarWhatsappContatosFn,
} from "@/lib/marketing.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Search,
  Upload,
  MapPin,
  Tag,
  Loader2,
  Building2,
  CheckCircle2,
  Store,
  User,
  List,
  BadgeCheck,
  Settings,
} from "lucide-react";
import MapaContatos from "@/components/shared/MapaContatos";

export const Route = createFileRoute("/admin/marketing")({
  component: MarketingPage,
});

const TIPOS = [
  { label: "Todos", value: "todos" },
  { label: "Lojistas", value: "lojista" },
  { label: "Compradores", value: "comprador" },
  { label: "Prospects", value: "prospect" },
];

function MarketingPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [importOpen, setImportOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [nomeTag, setNomeTag] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [visao, setVisao] = useState<"lista" | "mapa">("lista");
  const [somenteComCoordenadas, setSomenteComCoordenadas] = useState(false);

  // Conversão em comprador
  const [contatoConverter, setContatoConverter] = useState<any>(null);
  const [senhaTemporaria, setSenhaTemporaria] = useState("");
  const [convertendo, setConvertendo] = useState(false);
  const [geocodificando, setGeocodificando] = useState(false);
  const [uazapiUrl, setUazapiUrl] = useState("");
  const [uazapiToken, setUazapiToken] = useState("");
  const [uazapiConfigurado, setUazapiConfigurado] = useState(false);
  const [salvandoUazapi, setSalvandoUazapi] = useState(false);
  const [verificandoWhatsapp, setVerificandoWhatsapp] = useState(false);
  const [uazapiOpen, setUazapiOpen] = useState(false);

  // Importação
  const [preview, setPreview] = useState<Array<Record<string, unknown>>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadContatos = useServerFn(listarMarketingContatosFn);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-marketing", buscaAplicada, filtroTipo, somenteComCoordenadas],
    queryFn: () =>
      loadContatos({
        data: { busca: buscaAplicada, tipo: filtroTipo, somenteComCoordenadas },
      }),
  });
  const contatos = res?.data || [];

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const importar = useServerFn(importarMarketingContatosFn);
  const criarTag = useServerFn(criarMarketingTagFn);
  const atribuirTag = useServerFn(atribuirMarketingTagFn);
  const converterComprador = useServerFn(converterContatoEmCompradorFn);

  async function confirmarConversao() {
    if (!contatoConverter || senhaTemporaria.length < 6) return;
    setConvertendo(true);
    try {
      const r = await converterComprador({
        data: { contatoId: contatoConverter.id, senha: senhaTemporaria },
      });
      if (!r.ok) throw new Error(r.message);
      toast.success(`Contato convertido em comprador com sucesso.`);
      setContatoConverter(null);
      setSenhaTemporaria("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConvertendo(false);
    }
  }

  const geocodificar = useServerFn(geocodificarContatosFn);
  const getUazapiConfig = useServerFn(getUazapiConfigFn);
  const salvarUazapi = useServerFn(salvarUazapiConfigFn);
  const verificarWhatsapp = useServerFn(verificarWhatsappContatosFn);

  // Carrega a config Uazapi (token só sinaliza se está definido, nunca o valor)
  useEffect(() => {
    getUazapiConfig().then((r) => {
      if (r.ok) {
        setUazapiUrl(r.data.uazapi_base_url || "");
        setUazapiToken(r.data.uazapi_token_definido ? "••••••••••••" : "");
        setUazapiConfigurado(r.data.uazapi_token_definido);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmarSalvarUazapi() {
    setSalvandoUazapi(true);
    try {
      const r = await salvarUazapi({
        data: {
          base_url: uazapiUrl,
          token: uazapiToken === "••••••••••••" ? undefined : uazapiToken,
        },
      });
      if (!r.ok) throw new Error(r.message);
      toast.success("Configuração da Uazapi salva.");
      setUazapiToken("••••••••••••");
      setUazapiConfigurado(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvandoUazapi(false);
    }
  }

  async function rodarVerificacaoWhatsapp() {
    setVerificandoWhatsapp(true);
    try {
      const r = await verificarWhatsapp({ data: { limite: 100 } });
      if (!r.ok) throw new Error(r.message);
      toast.success(
        `WhatsApp: ${r.data.verificados} verificado(s), ${r.data.invalidos} sem WhatsApp, ${r.data.erros} erro(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVerificandoWhatsapp(false);
    }
  }

  async function rodarGeocodificacao() {
    setGeocodificando(true);
    try {
      const r = await geocodificar({ data: { limite: 20 } });
      if (!r.ok) throw new Error(r.message);
      toast.success(
        `Geocodificação: ${r.data.sucesso} localizado(s), ${r.data.falha} falha(s) de ${r.data.processados} processado(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeocodificando(false);
    }
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", codepage: 65001 });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!rows.length) {
        toast.error("A planilha está vazia.");
        return;
      }
      setPreview(rows);
    } catch (err: any) {
      toast.error("Não foi possível ler o arquivo: " + (err?.message || err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function mapearContato(row: Record<string, unknown>): Record<string, unknown> {
    const pega = (...chaves: string[]) => {
      for (const k of Object.keys(row)) {
        const kn = k.trim().toLowerCase();
        if (chaves.includes(kn)) return row[k];
      }
      return "";
    };
    return {
      nome: pega("nome", "nome_contato", "nome do contato", "razao_social", "razão social"),
      email: pega("email", "e-mail", "e_mail"),
      telefone: pega("telefone", "whatsapp", "celular", "phone", "fone", "telefone/whatsapp"),
      empresa: pega("empresa", "nome_da_empresa", "nome da empresa", "loja", "companhia"),
      cep: pega("cep"),
      endereco: pega("endereco", "endereço", "logradouro", "rua", "avenida"),
      numero: pega("numero", "número", "nº", "no"),
      bairro: pega("bairro"),
      cidade: pega("cidade", "municipio", "município"),
      uf: pega("uf", "estado"),
      observacoes: pega("observacoes", "observações", "obs"),
      origem: "importacao_excel",
    };
  }

  async function confirmarImportacao() {
    setImportando(true);
    try {
      const contatosMapeados = preview.map(mapearContato);
      const r = await importar({ data: { contatos: contatosMapeados } });
      if (!r.ok) throw new Error(r.message);
      toast.success(
        `Importação concluída: ${r.data.inseridos} novos, ${r.data.duplicados} duplicados, ${r.data.invalidos} inválidos.`,
      );
      setImportOpen(false);
      setPreview([]);
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportando(false);
    }
  }

  async function aplicarTag() {
    if (!nomeTag.trim() || !selecionados.length) return;
    try {
      const t = await criarTag({ data: { nome: nomeTag.trim() } });
      if (!t.ok) throw new Error(t.message);
      const tagId = t.data?.id;
      if (!tagId) throw new Error("Tag não retornada.");
      const r = await atribuirTag({ data: { contatoIds: selecionados, tagId } });
      if (!r.ok) throw new Error(r.message);
      toast.success(`Tag "${nomeTag.trim()}" aplicada a ${selecionados.length} contato(s).`);
      setTagOpen(false);
      setNomeTag("");
      setSelecionados([]);
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const todosMarcados = contatos.length > 0 && selecionados.length === contatos.length;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Marketing</h1>
          <p className="text-slate-500 font-medium">
            Base de prospects — lojistas e compradores de veículos.
          </p>
        </div>
        <div className="flex gap-2">
          {selecionados.length > 0 && (
            <Button variant="outline" onClick={() => setTagOpen(true)}>
              <Tag className="mr-2 h-4 w-4" /> Tag para {selecionados.length} selecionado(s)
            </Button>
          )}
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar Excel
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BadgeCheck
              className={`h-4 w-4 ${uazapiConfigurado ? "text-teal-600" : "text-slate-400"}`}
            />
            Verificação de WhatsApp (Uazapi){" "}
            {uazapiConfigurado ? (
              <Badge className="bg-teal-600">configurada</Badge>
            ) : (
              <Badge variant="outline">não configurada</Badge>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setUazapiOpen((v) => !v)}>
              <Settings className="mr-2 h-4 w-4" /> Configurar
            </Button>
            <Button
              size="sm"
              onClick={rodarVerificacaoWhatsapp}
              disabled={!uazapiConfigurado || verificandoWhatsapp}
            >
              {verificandoWhatsapp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="mr-2 h-4 w-4" />
              )}
              Verificar números pendentes
            </Button>
          </div>
        </div>
        {uazapiOpen && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end border-t border-slate-100 pt-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">URL da instância</label>
              <Input
                placeholder="https://gleego.uazapi.com"
                value={uazapiUrl}
                onChange={(e) => setUazapiUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Token</label>
              <Input
                type="password"
                placeholder={uazapiConfigurado ? "•••••••••••• (definido)" : "token da instância"}
                value={uazapiToken}
                onChange={(e) => setUazapiToken(e.target.value)}
              />
            </div>
            <Button onClick={confirmarSalvarUazapi} disabled={salvandoUazapi}>
              {salvandoUazapi ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Settings className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome, empresa, e-mail ou telefone"
            className="pl-10 h-11 bg-white border-slate-200"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {TIPOS.map((f) => (
            <Button
              key={f.value}
              variant={filtroTipo === f.value ? "default" : "outline"}
              size="sm"
              className="h-11 shrink-0"
              onClick={() => setFiltroTipo(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <div className="flex gap-1 shrink-0 border-l border-slate-200 pl-2">
            <Button
              variant={visao === "lista" ? "default" : "outline"}
              size="sm"
              className="h-11"
              onClick={() => setVisao("lista")}
            >
              <List className="mr-1 h-4 w-4" /> Lista
            </Button>
            <Button
              variant={visao === "mapa" ? "default" : "outline"}
              size="sm"
              className="h-11"
              onClick={() => setVisao("mapa")}
            >
              <MapPin className="mr-1 h-4 w-4" /> Mapa
            </Button>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 font-medium">
        <input
          type="checkbox"
          checked={somenteComCoordenadas}
          onChange={(e) => setSomenteComCoordenadas(e.target.checked)}
        />
        Somente contatos com localização no mapa
      </label>

      {visao === "mapa" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={rodarGeocodificacao}
              disabled={geocodificando}
            >
              {geocodificando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-2 h-4 w-4" />
              )}
              Localizar endereços pendentes
            </Button>
          </div>
          <MapaContatos contatos={contatos} />
          <p className="text-xs text-slate-500">
            Exibindo {contatos.filter((c: any) => c.latitude && c.longitude).length} de{" "}
            {contatos.length} contato(s) com coordenadas. Contatos sem coordenadas aparecem somente
            na lista.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={(e) =>
                      setSelecionados(e.target.checked ? contatos.map((c: any) => c.id) : [])
                    }
                  />
                </TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Comprador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : contatos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                    Nenhum contato na base. Importe uma planilha para começar.
                  </TableCell>
                </TableRow>
              ) : (
                contatos.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selecionados.includes(c.id)}
                        onChange={(e) =>
                          setSelecionados((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-900 text-sm">{c.nome}</div>
                      <div className="text-xs text-slate-500">{c.email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {c.empresa ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" /> {c.empresa}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {c.tipo === "lojista" ? (
                          <Store className="mr-1 h-3 w-3" />
                        ) : c.tipo === "comprador" ? (
                          <User className="mr-1 h-3 w-3" />
                        ) : null}
                        {c.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{c.telefone || "—"}</TableCell>
                    <TableCell>
                      {c.whatsapp_status === "verificado" ? (
                        <Badge className="bg-teal-600 text-[10px]">verificado</Badge>
                      ) : c.whatsapp_status === "invalido" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          não encontrado
                        </Badge>
                      ) : c.whatsapp_status === "erro" ? (
                        <Badge variant="outline" className="text-[10px] text-amber-600">
                          erro
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">pendente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {c.cidade ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" /> {c.cidade}
                          {c.uf ? `/${c.uf}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).map((t: any) => (
                          <Badge
                            key={t.id}
                            style={t.cor ? { backgroundColor: t.cor, color: "#fff" } : undefined}
                          >
                            {t.nome}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.comprador_id ? (
                        <span className="inline-flex items-center gap-1 text-teal-600 font-bold text-xs">
                          <CheckCircle2 className="h-4 w-4" /> Convertido
                        </span>
                      ) : c.email ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setContatoConverter(c);
                            setSenhaTemporaria("");
                          }}
                        >
                          <User className="mr-1 h-3 w-3" /> Converter
                        </Button>
                      ) : (
                        <span
                          className="text-xs text-slate-400"
                          title="Informe um e-mail para converter"
                        >
                          sem e-mail
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Importação */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) setPreview([]);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar contatos (.xlsx)</DialogTitle>
            <DialogDescription>
              Selecione uma planilha Excel. Colunas reconhecidas: nome, e-mail, telefone/whatsapp,
              empresa, cep, endereço, número, bairro, cidade, uf e observações.
            </DialogDescription>
          </DialogHeader>
          {!preview.length ? (
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={aoEscolherArquivo}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:cursor-pointer"
            />
          ) : (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 max-h-60 overflow-auto">
                <p className="font-bold mb-2">
                  {preview.length} linha(s) encontrada(s). Prévia das 5 primeiras:
                </p>
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(preview.slice(0, 5), null, 2)}
                </pre>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview([])}>
                  Trocar arquivo
                </Button>
                <Button onClick={confirmarImportacao} disabled={importando}>
                  {importando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Confirmar importação
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Tag */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar tag</DialogTitle>
            <DialogDescription>
              Crie ou reutilize uma tag para identificar os {selecionados.length} contato(s)
              selecionado(s).
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Nome da tag (ex: lojista-sp, comprador-2026)"
            value={nomeTag}
            onChange={(e) => setNomeTag(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={aplicarTag} disabled={!nomeTag.trim() || !selecionados.length}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversão em comprador */}
      <Dialog open={!!contatoConverter} onOpenChange={(o) => !o && setContatoConverter(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Converter em comprador</DialogTitle>
            <DialogDescription>
              Cria um cadastro de comprador pré-preenchido para{" "}
              <strong>{contatoConverter?.empresa || contatoConverter?.nome}</strong> com senha
              provisória. O contato ficará marcado como convertido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-bold">E-mail:</span> {contatoConverter?.email}
            </p>
            <Input
              type="text"
              placeholder="Senha provisória (mín. 6 caracteres)"
              value={senhaTemporaria}
              onChange={(e) => setSenhaTemporaria(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContatoConverter(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarConversao}
              disabled={senhaTemporaria.length < 6 || convertendo}
            >
              {convertendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Converter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
