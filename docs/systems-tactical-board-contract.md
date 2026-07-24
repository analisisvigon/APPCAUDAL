# Contrato visual de Sistemas Enfrentados

## Alcance

La implementación activa está formada por:

```text
renderProfessionalSystemsPrep (App.jsx)
└── sección inline «Campo táctico» (App.jsx)
    └── TacticalPhaseEditor
        └── SetPieceDiagramCanvas
```

La sección permanece inline en `App.jsx`, exactamente como estaba antes del intento de extracción. No debe extraerse, sustituirse ni envolverse. Los paneles exteriores solo pueden cambiar si no se modifica ninguna línea de esta sección ni sus contenedores, grids, wrappers o clases.

`renderFacingSystemsOverview` y el formulario antiguo de conexiones permanecen en `App.jsx` dentro de una rama constante falsa. Son código **LEGACY — not rendered**. No deben reactivarse ni eliminarse como parte de cambios visuales ordinarios.

## Componente gráfico congelado

`src/components/print/SetPieceDiagramCanvas.jsx` está congelado mediante este contrato:

- `viewBox` vertical: `0 0 72 100`.
- ancho CSS: `100%`.
- alto CSS: `auto`.
- alto máximo: `min(72vh, 760px)`.
- campo: orientación vertical.
- color base contractual: `#0b4a36`.
- interacción táctil: `touch-action: none`.

No se deben modificar su JSX, líneas del campo, avatares, eventos de puntero, marcadores SVG o estilos sin ejecutar:

```bash
npm run test:tactical-board-visual
```

## Coordenadas

El SVG trabaja en unidades `x: 0–72` e `y: 0–100`.

Las posiciones persistidas usan valores normalizados:

```text
xPersistida = xSvg / 72
yPersistida = ySvg / 100
```

Al hidratar:

```text
xSvg = xPersistida × 72
ySvg = yPersistida × 100
```

Los avatares se limitan a cuatro unidades de los bordes. No se debe sustituir este sistema por píxeles de pantalla.

## Jugadores y sistemas

`TacticalPhaseEditor` recibe las listas de Caudal y rival sin modificar sus stores. La colocación inicial se deriva de `caudalSystem` y `rivalSystem`; después se conserva en `tacticalPhaseBoards.systems_board`.

La identidad persistente usa:

- ID visual del elemento;
- `player_id`;
- `teamSide`;
- coordenadas normalizadas.

El contrato verifica 22 jugadores en 4-4-2, 4-3-3 y una defensa de cinco.

## Conexiones

La fuente de verdad activa es `systems_board.connections`.

Cada conexión conserva origen y destino normalizados. `trimArrow()` calcula el trazado visible sin atravesar el centro de los avatares. Las flechas se proyectan como elementos SVG temporales; no deben persistirse como una segunda colección independiente.

## Persistencia y aislamiento

La pizarra se guarda mediante:

```text
selectedMatch.preAiAnalysis.tacticalPhaseBoards.systems_board
```

El cambio de `opponentKey` reinicializa el estado desde el rival seleccionado. Las posiciones y conexiones no deben trasladarse a la plantilla, estadísticas ni eventos del partido.

## Controles desacoplados

Los controles superiores `Nombres`, `Zonas`, `Alertas`, `Rival`, `Caudal` y `Conexiones` siguen escribiendo en `selectedPreAiAnalysis.fieldView`.

El `TacticalPhaseEditor` activo todavía no consume esas capas. Actualmente:

- los botones permanecen visibles;
- guardan su estado;
- no deben conectarse improvisadamente durante una refactorización visual;
- su reconciliación funcional corresponde a una tarea posterior.

## Estilos

Clases propias o contractuales:

- sección: `order-4 ... xl:col-span-2 xl:col-start-1`;
- wrapper del campo en `TacticalPhaseEditor`: `overflow-hidden rounded-3xl bg-[#061d16] p-2 text-white`;
- `.set-piece-diagram-canvas`;
- `.set-piece-diagram-canvas text`;
- `.set-piece-diagram-canvas .diagram-draggable`.

Las reglas `.set-piece-diagram-canvas` también son utilizadas por diagramas de impresión y biblioteca. No deben renombrarse, moverse ni alterar su especificidad sin ejecutar las pruebas de esos consumidores.

## Cambios permitidos

Permitido sin tocar el canvas:

- modificar paneles exteriores;
- añadir documentación;
- cambiar lógica ajena a la pizarra;
- añadir pruebas que no alteren el DOM productivo.

Requiere aprobar capturas y métricas:

- cambiar el wrapper o extraer la sección inline «Campo táctico» de `App.jsx`;
- cambiar clases del campo;
- modificar dimensiones o responsive;
- cambiar jugadores, nombres, fotos o conexiones;
- editar `SetPieceDiagramCanvas.jsx`;
- editar las reglas CSS contractuales.

## Referencia automatizada

El arnés `tests/tactical-board-harness.html` utiliza datos deterministas y el componente real. Las referencias viven en `tests/visual-baselines/tactical-board/contract`.

El test compara:

- PNG en 1440×900, 1920×1080, 768×1024 y 390×844;
- rectángulo DOM del wrapper;
- rectángulo DOM del SVG;
- `viewBox`;
- 22 coordenadas y su orden;
- trazado de pase y movimiento;
- sistemas 4-4-2, 4-3-3 y 5-3-2.

La tolerancia geométrica máxima es `0,1%`. La referencia PNG exige igualdad exacta (`0%` de diferencia).

Para actualizar deliberadamente el contrato:

```bash
npm run test:tactical-board-visual -- --update
```

La actualización solo debe aceptarse tras revisar visualmente las cuatro imágenes.
