import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CATEGORIAS,
  PREFERENCIAS_PADRAO,
  TODAS_ACEITAS,
  aplicarConsentimento,
  lerConsentimento,
  salvarConsentimento,
  type CategoriaCookie,
  type PreferenciasCookies,
} from '@/lib/cookies-consent';

export function ConsentimentoCookies() {
  const [pronto, setPronto] = useState(false);
  const [mostrarBanner, setMostrarBanner] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [prefs, setPrefs] = useState<PreferenciasCookies>(PREFERENCIAS_PADRAO);

  useEffect(() => {
    const registro = lerConsentimento();
    if (registro) {
      setPrefs(registro.categorias);
      aplicarConsentimento(registro.categorias);
    } else {
      setMostrarBanner(true);
    }
    setPronto(true);

    const abrir = () => {
      const atual = lerConsentimento();
      if (atual) setPrefs(atual.categorias);
      setModalAberto(true);
    };
    window.addEventListener('ejf:abrir-cookies', abrir);
    return () => window.removeEventListener('ejf:abrir-cookies', abrir);
  }, []);

  const registrar = (categorias: PreferenciasCookies) => {
    salvarConsentimento(categorias);
    setPrefs(categorias);
    setMostrarBanner(false);
    setModalAberto(false);
  };

  const alternar = (id: CategoriaCookie, valor: boolean) =>
    setPrefs((p) => ({ ...p, [id]: valor }));

  if (!pronto) return null;

  return (
    <>
      {mostrarBanner && (
        <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-5">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-6 lg:flex-row lg:items-center lg:gap-8">
            <div className="flex-1">
              <h2 className="text-base font-bold text-navy sm:text-lg">Sua privacidade importa</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Utilizamos cookies necessários para o funcionamento do Esse Já Foi e, com sua
                autorização, cookies de análise e marketing para entender o uso do site e melhorar
                sua experiência.{' '}
                <Link
                  to="/politica-de-cookies"
                  className="font-semibold text-turquoise-dark underline underline-offset-4"
                >
                  Política de Cookies
                </Link>
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
              <Button
                onClick={() => registrar(TODAS_ACEITAS)}
                className="rounded-full bg-turquoise px-6 text-white hover:bg-turquoise-dark"
              >
                Aceitar todos
              </Button>
              <Button
                variant="outline"
                onClick={() => registrar(PREFERENCIAS_PADRAO)}
                className="rounded-full border-navy px-6 text-navy hover:bg-navy/5"
              >
                Rejeitar não necessários
              </Button>
              <Button
                variant="ghost"
                onClick={() => setModalAberto(true)}
                className="rounded-full px-6 text-slate-600"
              >
                Gerenciar cookies
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-navy">Configurações de Cookies</DialogTitle>
            <DialogDescription>
              Escolha quais categorias deseja autorizar. Você pode alterar essa decisão a qualquer
              momento pelo rodapé do site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {CATEGORIAS.map((cat) => (
              <div
                key={cat.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-mist p-4"
              >
                <div>
                  <p className="text-sm font-bold text-navy">{cat.titulo}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{cat.descricao}</p>
                </div>
                {cat.obrigatoria ? (
                  <span className="shrink-0 rounded-full bg-turquoise/10 px-3 py-1 text-[11px] font-semibold text-turquoise-dark">
                    Sempre ativos
                  </span>
                ) : (
                  <Switch
                    checked={prefs[cat.id]}
                    onCheckedChange={(v) => alternar(cat.id, v)}
                    aria-label={cat.titulo}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => registrar(prefs)}
              className="flex-1 rounded-full bg-navy text-white hover:bg-navy-dark"
            >
              Salvar preferências
            </Button>
            <Button
              onClick={() => registrar(TODAS_ACEITAS)}
              className="flex-1 rounded-full bg-turquoise text-white hover:bg-turquoise-dark"
            >
              Aceitar todos
            </Button>
            <Button
              variant="outline"
              onClick={() => registrar(PREFERENCIAS_PADRAO)}
              className="flex-1 rounded-full border-navy text-navy hover:bg-navy/5"
            >
              Rejeitar não necessários
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
