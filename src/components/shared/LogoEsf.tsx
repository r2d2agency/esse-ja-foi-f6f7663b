import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/logo-esse-ja-foi.png.asset.json";
import logoBrancoAsset from "@/assets/logo-esse-ja-foi-branco.png.asset.json";
import { cn } from "@/lib/utils";

interface LogoEsfProps {
  to?: string;
  height?: number;
  variant?: "light" | "dark";
  className?: string;
  imgClassName?: string;
  alt?: string;
}

export function LogoEsf({
  to = "/",
  height = 32,
  variant = "light",
  className,
  imgClassName,
  alt = "Esse Já Foi",
}: LogoEsfProps) {
  const src = variant === "dark" ? logoBrancoAsset.url : logoAsset.url;
  const img = (
    <img
      src={src}
      alt={alt}
      height={height}
      className={cn("h-auto w-auto object-contain", imgClassName)}
      style={{ height }}
    />
  );

  if (to) {
    return (
      <Link to={to} className={cn("inline-flex items-center", className)}>
        {img}
      </Link>
    );
  }

  return <span className={cn("inline-flex items-center", className)}>{img}</span>;
}
