export function groupSpanishLabel(group: string): string {
  return ({ "basic-shapes": "Formas básicas", "midpoint-bisectors": "Punto medio y bisectrices", "parallel-perpendicular": "Paralelas y perpendiculares", "intersection-circumcircle": "Construcciones con circunferencias", transformations: "Transformaciones", homothety: "Homotecia", polygons: "Polígonos", "regular-polyhedra": "Poliedros regulares" } as Record<string, string>)[group] ?? group;
}
export function groupSpanishInstruction(group: string): string {
  return ({ "basic-shapes": "Elige una herramienta de construcción básica", "midpoint-bisectors": "Elige una herramienta de punto medio o bisectriz", "parallel-perpendicular": "Elige una recta paralela o perpendicular", "intersection-circumcircle": "Elige una herramienta de intersección, tangente o circunferencia circunscrita", transformations: "Elige una herramienta de transformación", homothety: "Elige una herramienta de homotecia", polygons: "Elige una herramienta de polígonos", "regular-polyhedra": "Elige un poliedro regular" } as Record<string, string>)[group] ?? group;
}
