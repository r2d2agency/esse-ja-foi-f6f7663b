import { useEffect, useRef } from "react";

export type PontoMapaUI = {
  id: string;
  tipo: "comprador" | "vendedor" | "unidade";
  nome: string;
  cidade?: string | null;
  uf?: string | null;
  endereco?: string | null;
  latitude: number | null;
  longitude: number | null;
};

const BRASIL = { lat: -15.78, lng: -47.93, zoom: 4 };

const CORES: Record<PontoMapaUI["tipo"], string> = {
  comprador: "#0ea5e9",
  vendedor: "#f59e0b",
  unidade: "#0f766e",
};

function escapar(v: unknown) {
  return String(v ?? "").replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string)
  );
}

export default function MapaPontos({ pontos, height = 620 }: { pontos: PontoMapaUI[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelado = false;
    let meuMapa: any = null;

    void (async () => {
      try {
        if (!containerRef.current || typeof window === "undefined") return;
        const leaflet = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
        if (cancelado || !containerRef.current) return;
        const L = leaflet.default;

        meuMapa = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
          [BRASIL.lat, BRASIL.lng],
          BRASIL.zoom
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(meuMapa);
        mapRef.current = meuMapa;
        setTimeout(() => {
          try {
            meuMapa?.invalidateSize();
          } catch {}
        }, 250);
      } catch (err) {
        console.warn("[MapaPontos] init falhou:", err);
      }
    })();

    return () => {
      cancelado = true;
      try {
        meuMapa?.remove();
      } catch {}
      if (mapRef.current === meuMapa) mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const map = mapRef.current;
      if (!map) return;
      const leaflet = await import("leaflet");
      if (cancelado || !mapRef.current) return;
      const L = leaflet.default;

      try {
        if (layerRef.current) map.removeLayer(layerRef.current);
      } catch {}

      const grupo = L.layerGroup().addTo(map);
      layerRef.current = grupo;

      const bounds: Array<[number, number]> = [];
      for (const p of pontos) {
        if (p.latitude == null || p.longitude == null) continue;
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
        bounds.push([lat, lng]);

        const cor = CORES[p.tipo];
        const marker = L.circleMarker([lat, lng], {
          radius: p.tipo === "unidade" ? 9 : 7,
          color: cor,
          fillColor: cor,
          fillOpacity: 0.85,
          weight: 2,
        });
        marker.bindPopup(
          `<div style="font-family:Inter,sans-serif;min-width:180px">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:${cor};font-weight:800">${p.tipo}</div>
            <div style="font-weight:700;color:#0f172a">${escapar(p.nome)}</div>
            <div style="font-size:12px;color:#64748b">${escapar([p.cidade, p.uf].filter(Boolean).join(" - "))}</div>
            ${p.endereco ? `<div style="font-size:11px;color:#94a3b8">${escapar(p.endereco)}</div>` : ""}
          </div>`
        );
        marker.addTo(grupo);
      }

      try {
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
        else if (bounds.length === 1) map.setView(bounds[0]!, 12);
      } catch {}
    })();

    return () => {
      cancelado = true;
    };
  }, [pontos]);

  return <div ref={containerRef} style={{ height }} className="w-full rounded-xl border border-slate-200 z-0" />;
}
