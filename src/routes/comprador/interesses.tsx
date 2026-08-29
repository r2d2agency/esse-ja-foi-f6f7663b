import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Car, 
  Tags, 
  MessageSquare, 
  Save, 
  Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getInteressesFn, updateInteressesFn } from "@/lib/comprador.functions";
import { getSessionToken } from "@/lib/session";
import { TODAS_MARCAS, CATEGORIAS_VEICULOS } from "@/lib/constants-veiculos";

export const Route = createFileRoute("/comprador/interesses")({
  component: CompradorInteressesPage,
});

function CompradorInteressesPage() {
  const { user } = useAuth();
  const [selectedVeiculos, setSelectedVeiculos] = useState<string[]>([]);
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>([]);
  const [receberWhatsApp, setReceberWhatsApp] = useState(true);

  const { data: interesses, isLoading } = useQuery({
    queryKey: ['comprador-interesses', user?.id],
    queryFn: () => getInteressesFn({ data: { token: getSessionToken() } }),
    enabled: !!user?.id
  });

  useEffect(() => {
    if (interesses) {
      setSelectedVeiculos(interesses.interesses_veiculos || []);
      setSelectedMarcas(interesses.interesses_marcas || []);
      setReceberWhatsApp(interesses.pode_receber_comunicacoes !== false);
    }
  }, [interesses]);

  const mutation = useMutation({
    mutationFn: (data: any) => updateInteressesFn({ data: { ...data, token: getSessionToken() } }),
    onSuccess: () => {
      toast.success("Preferências salvas com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar preferências.");
    }
  });

  const handleSave = () => {
    mutation.mutate({
      veiculos: selectedVeiculos,
      marcas: selectedMarcas,
      receberWhatsApp
    });
  };

  const toggle = (list: string[], setList: (l: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Meus Interesses</h1>
        <p className="text-slate-500 font-medium">Personalize sua experiência para receber as melhores ofertas.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Car className="h-5 w-5 text-teal-600" />
              <CardTitle className="text-lg">Categorias de Interesse</CardTitle>
            </div>
            <CardDescription>Selecione os tipos de veículos que você deseja ver com prioridade.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {CATEGORIAS_VEICULOS.map((cat: string) => (
                <div key={cat} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`cat-${cat}`} 
                    checked={selectedVeiculos.includes(cat)}
                    onCheckedChange={() => toggle(selectedVeiculos, setSelectedVeiculos, cat)}
                  />
                  <label htmlFor={`cat-${cat}`} className="text-sm font-bold text-slate-700 cursor-pointer">{cat}</label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Tags className="h-5 w-5 text-teal-600" />
              <CardTitle className="text-lg">Marcas Preferidas</CardTitle>
            </div>
            <CardDescription>Escolha suas marcas favoritas para receber alertas exclusivos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 max-h-[200px] overflow-y-auto pr-2">
              {TODAS_MARCAS.map((marca: string) => (
                <div key={marca} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`marca-${marca}`} 
                    checked={selectedMarcas.includes(marca)}
                    onCheckedChange={() => toggle(selectedMarcas, setSelectedMarcas, marca)}
                  />
                  <label htmlFor={`marca-${marca}`} className="text-sm font-bold text-slate-700 cursor-pointer">{marca}</label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-5 w-5 text-teal-600" />
              <CardTitle className="text-lg">Preferências de Comunicação</CardTitle>
            </div>
            <CardDescription>Escolha como você deseja ser notificado sobre novas oportunidades.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-teal-50 rounded-2xl border border-teal-100">
              <Checkbox 
                id="whatsapp-optin" 
                checked={receberWhatsApp}
                onCheckedChange={(checked) => setReceberWhatsApp(!!checked)}
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none">
                <label htmlFor="whatsapp-optin" className="text-sm font-black text-teal-900 uppercase">
                  Receber novos veículos pelo WhatsApp
                </label>
                <p className="text-xs text-teal-700 font-medium">
                  Enviaremos apenas veículos que correspondam aos seus interesses selecionados acima.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button 
                onClick={handleSave} 
                disabled={mutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 font-bold px-8 h-12 rounded-xl"
              >
                {mutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Preferências
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
