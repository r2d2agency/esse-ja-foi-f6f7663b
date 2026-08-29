import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProntosParaAnuncio } from "@/lib/anuncios.functions";
import { listarPublicadosVitrineFn } from "@/lib/publicacao.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, Plus, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/anuncios")({
  component: AnunciosAdminPage,
});

function AnunciosAdminPage() {
  const { data: prontos, isLoading, isError, error } = useQuery({
    queryKey: ["veiculos-prontos-para-anuncio"],
    queryFn: () => getProntosParaAnuncio(),
  });

  const { data: publicadosRes, isLoading: carregandoPublicados } = useQuery({
    queryKey: ["publicados-vitrine"],
    queryFn: () => listarPublicadosVitrineFn(),
  });
  const publicados: any[] = (publicadosRes as any)?.data ?? [];

  return (
    <div className="p-6 space-y-6">

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-teal-600" />
          Anúncios
        </h1>
      </div>

      <Tabs defaultValue="prontos" className="w-full">
        <TabsList className="bg-white border-b border-slate-200 h-12 w-full justify-start rounded-none">
          <TabsTrigger value="prontos" className="h-full px-6 data-[state=active]:border-b-2 data-[state=active]:border-teal-500 rounded-none">Prontos para Anúncio</TabsTrigger>
          <TabsTrigger value="preparacao" className="h-full px-6">Em preparação</TabsTrigger>
          <TabsTrigger value="publicados" className="h-full px-6">Publicados</TabsTrigger>
        </TabsList>

        <TabsContent value="prontos" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Veículos Liberados</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-500 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando oportunidades...
                </div>
              ) : isError ? (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Não foi possível carregar os veículos.</p>
                    <p className="text-sm opacity-90">{error instanceof Error ? error.message : "Tente novamente em instantes."}</p>
                  </div>
                </div>
              ) : !prontos || prontos.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Megaphone className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-lg font-medium text-slate-700">Em breve novas oportunidades aqui.</p>
                  <p className="text-sm mt-1">Nenhum veículo está liberado para anúncio no momento.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {prontos.map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-teal-200 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-16 bg-slate-100 rounded overflow-hidden">
                          {v.foto_capa ? <img src={v.foto_capa} className="w-full h-full object-cover" alt={`${v.marca} ${v.modelo}`} /> : <div className="w-full h-full flex items-center justify-center text-slate-400">Sem foto</div>}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{v.marca} {v.modelo}</p>
                          <p className="text-sm text-slate-500">{v.placa} • {v.ano_modelo} • {v.km} km</p>
                        </div>
                      </div>
                      <Button onClick={() => window.location.href = `/admin/anuncios/novo/${v.id}`}>
                        <Plus className="h-4 w-4 mr-2" /> Criar anúncio
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publicados" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Publicados na vitrine</CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoPublicados ? (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" /> Carregando publicações...
                </div>
              ) : publicados.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-lg font-medium text-slate-700">Em breve novas oportunidades aqui.</p>
                  <p className="mt-1 text-sm">Ative um canal na ficha do veículo para publicar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {publicados.map((p: any, i: number) => (
                    <div key={`${p.id}-${p.canal}-${i}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-20 overflow-hidden rounded bg-slate-100">
                          {Array.isArray(p.fotos) && p.fotos[0] ? (
                            <img src={p.fotos[0]} alt={`${p.marca} ${p.modelo}`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">Sem foto</div>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{p.titulo || `${p.marca} ${p.modelo}`}</p>
                          <p className="text-sm text-slate-500">{p.placa} • {p.ano_modelo} • canal {p.canal}</p>
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => { window.location.href = `/admin/veiculo/${p.id}`; }}>
                        Abrir ficha
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
