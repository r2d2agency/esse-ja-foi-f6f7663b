import { useEffect, useRef } from "react";

export interface ContatoMapa {
  id: string;
  nome: string;
  empresa?: string | null;
  cidade?: string | null;
  uf?: string | null;
  latitude: string | null;
  longitude: string | null;
}

interface MapaContatosProps {
  contatos: ContatoMapa[];
  height?: number;
}

function mapaVivo(map: any): boolean {
  return !!(map && map._container && !map._removed);
}

/** Mapa OpenStreetMap com múltiplos marcadores (sem custo de API). Protegido Strict Mode 2x mount. */
export default function MapaContatos({ contatos, height = 420 }: MapaContatosProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const camadaRef = useRef<any>(null);
  const mountIdRef = useRef(0);

  // Efeito 1: inicialização do mapa
  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    if (mapRef.current && mapaVivo(mapRef.current)) return;

    mountIdRef.current += 1;
    const meuMountId = mountIdRef.current;
    let meuMapa: any = null;

    const iniciar = async () => {
      try {
        const leaflet = await import("leaflet");
        await import("leaflet/dist/leaflet.css");

        if (meuMountId !== mountIdRef.current) return;
        if (!containerRef.current) return;

        const L = leaflet.default;

        try {
          if (mapRef.current && mapRef.current !== meuMapa) {
            mapRef.current.remove();
            mapRef.current = null;
            camadaRef.current = null;
          }
        } catch {}

        meuMapa = L.map(containerRef.current).setView([-14.235, -51.925], 4);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(meuMapa);

        camadaRef.current = L.layerGroup().addTo(meuMapa);

        if (meuMountId === mountIdRef.current && containerRef.current) {
          mapRef.current = meuMapa;
          try {
            setTimeout(() => {
              if (mapaVivo(mapRef.current)) mapRef.current.invalidateSize();
            }, 60);
          } catch {}
        }
      } catch (err) {
        console.warn("[MapaContatos] init falhou:", err);
      }
    };

    iniciar();
    return () => {
      mountIdRef.current += 1;
      try {
        if (meuMapa && mapaVivo(meuMapa) && meuMapa !== mapRef.current) meuMapa.remove();
      } catch {}
    };
  }, []);

  // Efeito 2: atualiza marcadores quando a lista muda
  useEffect(() => {
    let cancelado = false;
    const atualizar = async () => {
      try {
        const leaflet = await import("leaflet");
        const L = leaflet.default;
        const mapa = mapRef.current;
        const camada = camadaRef.current;
        if (cancelado || !mapaVivo(mapa) || !camada) return;

        camada.clearLayers();
        const pontos: Array<{ lat: number; lng: number }> = [];
        for (const c of contatos) {
          const lat = c.latitude != null ? Number(c.latitude) : NaN;
          const lng = c.longitude != null ? Number(c.longitude) : NaN;
          if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
          pontos.push({ lat, lng });
          L.marker([lat, lng])
            .bindPopup(
              `<strong>${c.nome}</strong>${c.empresa ? `<br/>${c.empresa}` : ""}${
                c.cidade ? `<br/><small>${c.cidade}${c.uf ? `/${c.uf}` : ""}</small>` : ""
              }`,
            )
            .addTo(camada);
        }
        if (pontos.length > 1) {
          mapa.fitBounds(
            L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15),
          );
        } else if (pontos.length === 1) {
          mapa.setView([pontos[0].lat, pontos[0].lng], 14);
        }
      } catch (err) {
        console.warn("[MapaContatos] atualizar marcadores falhou:", err);
      }
    };
    atualizar();
    return () => {
      cancelado = true;
    };
  }, [contatos]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-lg border border-slate-200 z-0"
    />
  );
}
