import { useCallback, useEffect, useState } from "react";

const CHAVE_FILA = "ejf_fila_offline_vistoria";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function lerFilaOffline(): any[] {
  try {
    return JSON.parse(window.localStorage.getItem(CHAVE_FILA) || "[]");
  } catch {
    return [];
  }
}

export function enfileirarOffline(payload: any) {
  try {
    const fila = lerFilaOffline();
    fila.push({ ...payload, _enfileiradoEm: new Date().toISOString() });
    window.localStorage.setItem(CHAVE_FILA, JSON.stringify(fila.slice(-200)));
  } catch {
    /* storage cheio: ignora */
  }
}

export function limparFilaOffline() {
  try {
    window.localStorage.removeItem(CHAVE_FILA);
  } catch {
    /* ignore */
  }
}

export function useFilaOffline(enviar: (payload: any) => Promise<{ ok: boolean }>) {
  const online = useOnline();
  const [pendentes, setPendentes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    setPendentes(lerFilaOffline().length);
  }, []);

  const enfileirar = useCallback((payload: any) => {
    enfileirarOffline(payload);
    setPendentes(lerFilaOffline().length);
  }, []);

  const sincronizar = useCallback(async () => {
    const fila = lerFilaOffline();
    if (fila.length === 0 || sincronizando) return;
    setSincronizando(true);
    const restantes: any[] = [];
    for (const item of fila) {
      try {
        const res = await enviar(item);
        if (!res?.ok) restantes.push(item);
      } catch {
        restantes.push(item);
      }
    }
    try {
      if (restantes.length) window.localStorage.setItem(CHAVE_FILA, JSON.stringify(restantes));
      else limparFilaOffline();
    } catch {
      /* ignore */
    }
    setPendentes(restantes.length);
    setSincronizando(false);
  }, [enviar, sincronizando]);

  useEffect(() => {
    if (online && pendentes > 0) void sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { online, pendentes, sincronizando, enfileirar, sincronizar };
}
