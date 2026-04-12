/**
 * Moroccan zellige-inspired geometric background pattern.
 * Renders as a CSS background on a full-bleed div.
 */
interface ZelligePatternProps {
  variant?: "light" | "dark";
  className?: string;
}

// 8-point star tile SVG — a single zellige unit, encoded inline
function makeTileSvg(stroke: string, opacity: number) {
  // Geometric 8-point star in a 60x60 tile
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'>
    <g fill='none' stroke='${stroke}' stroke-width='0.5' opacity='${opacity}'>
      <path d='M30 0 L35 12 L48 6 L42 18 L60 18 L48 24 L60 30 L48 36 L60 42 L42 42 L48 54 L35 48 L30 60 L25 48 L12 54 L18 42 L0 42 L12 36 L0 30 L12 24 L0 18 L18 18 L12 6 L25 12 Z'/>
      <rect x='18' y='18' width='24' height='24' rx='2' transform='rotate(45 30 30)'/>
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function ZelligePattern({ variant = "light", className = "" }: ZelligePatternProps) {
  const bg =
    variant === "dark"
      ? makeTileSvg("#4A70A9", 0.05)
      : makeTileSvg("#DDD8CC", 0.08);

  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        backgroundImage: bg,
        backgroundRepeat: "repeat",
        backgroundSize: "60px 60px",
      }}
    />
  );
}
