import { createServerFn } from "@tanstack/react-start";

/**
 * Id do build que está rodando no servidor agora. Comparado pelo cliente (VersaoWatcher) com
 * o próprio `__APP_BUILD_ID__` embutido no bundle carregado — diferente entre os dois significa
 * que houve um deploy novo desde que a aba foi aberta.
 */
export const getVersaoAppFn = createServerFn({ method: "GET" }).handler(async () => {
  return { versao: __APP_BUILD_ID__ };
});
