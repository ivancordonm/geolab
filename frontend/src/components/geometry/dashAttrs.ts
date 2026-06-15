import type { StrokeDash } from "../../types/geometry";

interface DashAttrs {
  strokeDasharray?: string;
  strokeLinecap?: "round" | "butt" | "square";
}

export function dashAttrs(strokeDash: StrokeDash | undefined): DashAttrs {
  if (!strokeDash || strokeDash === "solid") return {};
  if (strokeDash === "dashed") return { strokeDasharray: "10 6" };
  // dotted: near-zero dash + round cap = round dots
  return { strokeDasharray: "0.5 7", strokeLinecap: "round" };
}
