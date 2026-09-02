import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OpcaoMultiplaProps {
  label: string;
  opcoes: string[];
  value: string[];
  onChange: (valor: string[]) => void;
  colunas?: number;
}

/** Igual ao OpcaoBotoes, mas permite marcar vários itens (estilo checkbox) e
 * adicionar itens fora da lista pré-cadastrada com o botão "+". Pensado para
 * toque no celular — sem menus, tudo em botões grandes. */
export function OpcaoMultipla({ label, opcoes, value, onChange, colunas = 2 }: OpcaoMultiplaProps) {
  const [adicionando, setAdicionando] = useState(false);
  const [novo, setNovo] = useState("");

  const extras = value.filter((v) => !opcoes.includes(v));
  const todas = [...opcoes, ...extras];

  function alternar(op: string) {
    onChange(value.includes(op) ? value.filter((v) => v !== op) : [...value, op]);
  }

  function confirmarNovo() {
    const v = novo.trim();
    if (v && !todas.includes(v)) onChange([...value, v]);
    setNovo("");
    setAdicionando(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-slate-900">{label}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
        {todas.map((op) => {
          const marcado = value.includes(op);
          return (
            <button
              key={op}
              type="button"
              onClick={() => alternar(op)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                marcado
                  ? "border-teal-700 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-teal-200",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  marcado ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300",
                )}
              >
                {marcado && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate">{op}</span>
            </button>
          );
        })}
      </div>

      {adicionando ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Digite o item"
            className="h-11"
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarNovo();
              if (e.key === "Escape") setAdicionando(false);
            }}
          />
          <Button type="button" size="sm" className="h-11 bg-teal-600 hover:bg-teal-700" onClick={confirmarNovo}>
            OK
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-xl font-semibold"
          onClick={() => setAdicionando(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar outro
        </Button>
      )}
    </div>
  );
}
