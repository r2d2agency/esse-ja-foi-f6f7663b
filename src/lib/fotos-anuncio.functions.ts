import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detectarPlacaFoto } from "../db/ia-fotos.server";

export const detectarPlacaFotoFn = createServerFn({ method: "POST" })
  .validator((data: { imagemUrl: string }) => z.object({ imagemUrl: z.string() }).parse(data))
  .handler(async ({ data }) => detectarPlacaFoto(data.imagemUrl));
