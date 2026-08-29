import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LOGO_CLARA = "/logo-esse-ja-foi.png";
const LOGO_ESCURA = "/logo-esse-ja-foi-branco.png";

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
  const src = variant === "dark" ? LOGO_ESCURA : LOGO_CLARA;
  const img = (
    <img
      src={src}
      alt={alt}
      width={Math.round(height * 1.97)}
      height={height}
      decoding="async"
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
