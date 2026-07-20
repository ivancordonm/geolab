# Estudio 3D del cubo (grupo Oh)

## Objetivo

Incorporar el cubo regular al modo de estudio 3D existente, reutilizando la
geometría, el menú y las superposiciones del tetraedro. El cubo tiene grupo de
simetría completo `Oh` de orden 48 y el menú debe presentar sus clases sin
mezclarlas con la taxonomía específica del tetraedro.

## Datos geométricos

Los ocho vértices son las combinaciones de `(±1, ±1, ±1)`, normalizadas al
radio circunscrito unitario. La definición lista 6 caras cuadradas y 12 aristas.

| Clase                                | Elementos |
| ------------------------------------ | --------: |
| Identidad                            |         1 |
| Rotaciones que no son medias vueltas |        14 |
| Medias vueltas                       |         9 |
| Simetría central                     |         1 |
| Reflexiones planas                   |         9 |
| Rotorreflexiones propias             |        14 |
| **Total**                            |    **48** |

Las 14 rotaciones son 8 giros `C3` de ±120° por las cuatro diagonales de
cuerpo y 6 giros `C4` de ±90° por los tres ejes que unen centros de caras. Las
9 medias vueltas son 3 ejes por centros de caras y 6 ejes por puntos medios de
aristas opuestas. Las 9 reflexiones son 3 planos coordenados y 6 planos
diagonales. Las rotorreflexiones son 6 `S4` de ±90° por ejes de caras y 8 `S6`
de ±60° por diagonales de cuerpo.

## Diseño

- Ampliar el tipo de clases con `identity` e `inversion`, y añadir elementos
  explícitos para ambos a la matemática de matrices.
- Cada definición declara `symmetryClassOrder`; el tetraedro incluye también
  la identidad y el cubo muestra las seis clases de la tabla.
- El menú itera ese orden declarativo. Identidad y simetría central muestran
  una breve descripción; la inversión se representa por un marcador central.
- Las clases existentes conservan sus controles detallados. Las rotaciones del
  cubo reutilizan el control de ejes, incluyendo sus dos órdenes C3/C4.
- Registrar `CUBE` para que el botón de cubo entre al estudio 3D igual que el
  tetraedro.

## Verificación

Pruebas unitarias comprobarán geometría, los seis recuentos, que las 48
transformaciones permutan los vértices, signos de determinante y el orden 48
del grupo generado. Se actualizarán las pruebas del registro y del menú, y se
ejecutarán Vitest, typecheck y build de frontend.
