# Estudio 3D del octaedro (grupo Oh)

## Objetivo

Incorporar el octaedro regular al modo de estudio 3D existente. Como dual del cubo, comparte el grupo completo de simetrías `Oh`, de orden 48, y reutiliza el menú y las superposiciones declarativas ya disponibles.

## Datos geométricos

Los seis vértices son `(±1, 0, 0)`, `(0, ±1, 0)` y `(0, 0, ±1)`, ya a radio circunscrito unitario. La definición contiene ocho caras triangulares y doce aristas.

| Clase | Elementos |
| --- | ---: |
| Identidad | 1 |
| Rotaciones no medias vueltas | 14 |
| Medias vueltas 180° | 9 |
| Simetría central | 1 |
| Reflexiones | 9 |
| Rotorreflexiones propiamente dichas | 14 |
| **Total** | **48** |

Las 14 rotaciones son 8 giros `C3` de ±120° por ejes que unen centros de caras opuestas, y 6 giros `C4` de ±90° por vértices opuestos. Las 9 medias vueltas comprenden 3 ejes por vértices opuestos y 6 por puntos medios de aristas opuestas. Hay 3 planos coordenados y 6 planos diagonales. Las rotorreflexiones son 6 `S4` de ±90° por vértices opuestos y 8 `S6` de ±60° por centros de caras opuestas.

## Diseño

- Crear una definición `OCTAHEDRON` análoga a `CUBE`, con las mismas matrices de `Oh` y etiquetas geométricas propias del octaedro.
- Registrarla para que la herramienta de octaedro abra el estudio 3D existente.
- No se requieren cambios en el menú, overlay ni estudio: ya consumen las clases y el orden definidos por cada poliedro.

## Verificación

Las pruebas comprueban la geometría, los seis recuentos, la permutación de vértices por cada transformación, los signos de determinante y el orden 48 del grupo generado; también verifican el registro del octaedro.
