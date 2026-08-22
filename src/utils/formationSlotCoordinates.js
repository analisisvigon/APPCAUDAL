// Convencion visual canonica para los slots persistidos de alineacion:
// x=0 es la izquierda y x=100 la derecha; y=0 es la porteria rival (arriba)
// y y=100 la porteria propia (abajo). Caudal ataca hacia arriba.
// Un cambio de perspectiva vertical nunca debe invertir el eje horizontal.
const FORMATION_SLOTS = Object.freeze({
  '4-4-2': [
    { id: 'POR', label: 'POR', line: 'porteria', x: 50, y: 89 },
    { id: 'LD', label: 'LD', line: 'defensa', x: 82, y: 73 },
    { id: 'DFC_D', label: 'DFC derecho', line: 'defensa', x: 61, y: 73 },
    { id: 'DFC_I', label: 'DFC izquierdo', line: 'defensa', x: 39, y: 73 },
    { id: 'LI', label: 'LI', line: 'defensa', x: 18, y: 73 },
    { id: 'MD', label: 'MD', line: 'medio', x: 82, y: 45 },
    { id: 'MC_D', label: 'MC derecho', line: 'medio', x: 61, y: 45 },
    { id: 'MC_I', label: 'MC izquierdo', line: 'medio', x: 39, y: 45 },
    { id: 'MI', label: 'MI', line: 'medio', x: 18, y: 45 },
    { id: 'DC_D', label: 'DC derecho', line: 'ataque', x: 58, y: 16 },
    { id: 'DC_I', label: 'DC izquierdo', line: 'ataque', x: 42, y: 16 },
  ],
  '4-2-3-1': [
    { id: 'POR', label: 'POR', line: 'porteria', x: 50, y: 89 },
    { id: 'LD', label: 'LD', line: 'defensa', x: 82, y: 73 },
    { id: 'DFC_D', label: 'DFC derecho', line: 'defensa', x: 61, y: 73 },
    { id: 'DFC_I', label: 'DFC izquierdo', line: 'defensa', x: 39, y: 73 },
    { id: 'LI', label: 'LI', line: 'defensa', x: 18, y: 73 },
    { id: 'MCD_D', label: 'Pivote derecho', line: 'medio', x: 61, y: 52 },
    { id: 'MCD_I', label: 'Pivote izquierdo', line: 'medio', x: 39, y: 52 },
    { id: 'MPD', label: 'MPD', line: 'mediapunta', x: 82, y: 32 },
    { id: 'MPC', label: 'MPC', line: 'mediapunta', x: 50, y: 32 },
    { id: 'MPI', label: 'MPI', line: 'mediapunta', x: 18, y: 32 },
    { id: 'DC', label: 'DC', line: 'ataque', x: 50, y: 14 },
  ],
  '4-3-3': [
    { id: 'POR', label: 'POR', line: 'porteria', x: 50, y: 89 },
    { id: 'LD', label: 'LD', line: 'defensa', x: 82, y: 73 },
    { id: 'DFC_D', label: 'DFC derecho', line: 'defensa', x: 61, y: 73 },
    { id: 'DFC_I', label: 'DFC izquierdo', line: 'defensa', x: 39, y: 73 },
    { id: 'LI', label: 'LI', line: 'defensa', x: 18, y: 73 },
    { id: 'MCD', label: 'MCD', line: 'medio', x: 50, y: 56 },
    { id: 'MC_D', label: 'Interior derecho', line: 'medio', x: 62, y: 40 },
    { id: 'MC_I', label: 'Interior izquierdo', line: 'medio', x: 38, y: 40 },
    { id: 'ED', label: 'ED', line: 'ataque', x: 80, y: 18 },
    { id: 'DC', label: 'DC', line: 'ataque', x: 50, y: 14 },
    { id: 'EI', label: 'EI', line: 'ataque', x: 20, y: 18 },
  ],
  '3-5-2': [
    { id: 'POR', label: 'POR', line: 'porteria', x: 50, y: 89 },
    { id: 'DFC_D', label: 'DFC derecho', line: 'defensa', x: 72, y: 73 },
    { id: 'DFC_C', label: 'DFC central', line: 'defensa', x: 50, y: 75 },
    { id: 'DFC_I', label: 'DFC izquierdo', line: 'defensa', x: 28, y: 73 },
    { id: 'MCD', label: 'MCD', line: 'medio', x: 50, y: 56 },
    { id: 'CAD', label: 'CAD', line: 'medio', x: 86, y: 43 },
    { id: 'MC_D', label: 'MC derecho', line: 'medio', x: 62, y: 38 },
    { id: 'MC_I', label: 'MC izquierdo', line: 'medio', x: 38, y: 38 },
    { id: 'CAI', label: 'CAI', line: 'medio', x: 14, y: 43 },
    { id: 'DC_D', label: 'DC derecho', line: 'ataque', x: 58, y: 16 },
    { id: 'DC_I', label: 'DC izquierdo', line: 'ataque', x: 42, y: 16 },
  ],
  '5-3-2': [
    { id: 'POR', label: 'POR', line: 'porteria', x: 50, y: 89 },
    { id: 'CAD', label: 'CAD', line: 'defensa', x: 88, y: 73 },
    { id: 'DFC_D', label: 'DFC derecho', line: 'defensa', x: 68, y: 75 },
    { id: 'DFC_C', label: 'DFC central', line: 'defensa', x: 50, y: 76 },
    { id: 'DFC_I', label: 'DFC izquierdo', line: 'defensa', x: 32, y: 75 },
    { id: 'CAI', label: 'CAI', line: 'defensa', x: 12, y: 73 },
    { id: 'MC_D', label: 'MC derecho', line: 'medio', x: 66, y: 45 },
    { id: 'MC_C', label: 'MC central', line: 'medio', x: 50, y: 49 },
    { id: 'MC_I', label: 'MC izquierdo', line: 'medio', x: 34, y: 45 },
    { id: 'DC_D', label: 'DC derecho', line: 'ataque', x: 58, y: 16 },
    { id: 'DC_I', label: 'DC izquierdo', line: 'ataque', x: 42, y: 16 },
  ],
  // Estas formaciones ya usaban el mismo orden de slots en Estadisticas e Impresion.
  '3-4-3': [
    { id: 'SLOT_0', label: 'Portero', line: 'porteria', x: 50, y: 89 },
    { id: 'SLOT_1', label: 'Central izquierdo', line: 'defensa', x: 28, y: 73 },
    { id: 'SLOT_2', label: 'Central', line: 'defensa', x: 50, y: 75 },
    { id: 'SLOT_3', label: 'Central derecho', line: 'defensa', x: 72, y: 73 },
    { id: 'SLOT_4', label: 'Carrilero izquierdo', line: 'defensa', x: 16, y: 48 },
    { id: 'SLOT_5', label: 'Mediocentro', line: 'medio', x: 40, y: 48 },
    { id: 'SLOT_6', label: 'Mediocentro', line: 'medio', x: 60, y: 48 },
    { id: 'SLOT_7', label: 'Carrilero derecho', line: 'medio', x: 84, y: 48 },
    { id: 'SLOT_8', label: 'Extremo izquierdo', line: 'medio', x: 22, y: 18 },
    { id: 'SLOT_9', label: 'Delantero', line: 'ataque', x: 50, y: 14 },
    { id: 'SLOT_10', label: 'Extremo derecho', line: 'ataque', x: 78, y: 18 },
  ],
  '3-4-1-2': [
    { id: 'SLOT_0', label: 'Portero', line: 'porteria', x: 50, y: 89 },
    { id: 'SLOT_1', label: 'Central izquierdo', line: 'defensa', x: 28, y: 73 },
    { id: 'SLOT_2', label: 'Central', line: 'defensa', x: 50, y: 75 },
    { id: 'SLOT_3', label: 'Central derecho', line: 'defensa', x: 72, y: 73 },
    { id: 'SLOT_4', label: 'Carrilero izquierdo', line: 'defensa', x: 16, y: 48 },
    { id: 'SLOT_5', label: 'Mediocentro', line: 'medio', x: 40, y: 50 },
    { id: 'SLOT_6', label: 'Mediocentro', line: 'medio', x: 60, y: 50 },
    { id: 'SLOT_7', label: 'Carrilero derecho', line: 'medio', x: 84, y: 48 },
    { id: 'SLOT_8', label: 'Mediapunta', line: 'medio', x: 50, y: 31 },
    { id: 'SLOT_9', label: 'Delantero', line: 'ataque', x: 42, y: 14 },
    { id: 'SLOT_10', label: 'Delantero', line: 'ataque', x: 58, y: 14 },
  ],
  '5-4-1': [
    { id: 'SLOT_0', label: 'Portero', line: 'porteria', x: 50, y: 89 },
    { id: 'SLOT_1', label: 'Carrilero izquierdo', line: 'defensa', x: 12, y: 73 },
    { id: 'SLOT_2', label: 'Central izquierdo', line: 'defensa', x: 32, y: 75 },
    { id: 'SLOT_3', label: 'Central', line: 'defensa', x: 50, y: 76 },
    { id: 'SLOT_4', label: 'Central derecho', line: 'defensa', x: 68, y: 75 },
    { id: 'SLOT_5', label: 'Carrilero derecho', line: 'medio', x: 88, y: 73 },
    { id: 'SLOT_6', label: 'Extremo izquierdo', line: 'medio', x: 18, y: 45 },
    { id: 'SLOT_7', label: 'Mediocentro', line: 'medio', x: 40, y: 45 },
    { id: 'SLOT_8', label: 'Mediocentro', line: 'medio', x: 60, y: 45 },
    { id: 'SLOT_9', label: 'Extremo derecho', line: 'ataque', x: 82, y: 45 },
    { id: 'SLOT_10', label: 'Delantero', line: 'ataque', x: 50, y: 14 },
  ],
});

export const getFormationSlotsForSavedLineup = (system) => (
  FORMATION_SLOTS[system] || FORMATION_SLOTS['4-4-2']
).map((slot, index) => ({ ...slot, slot: index, role: slot.label }));

export const hasFormationSlotsForSavedLineup = (system) => Object.hasOwn(FORMATION_SLOTS, system);

export const getFormationSlotCoordinates = (system, slot) => {
  const formationSlot = getFormationSlotsForSavedLineup(system)[Number(slot)];
  return formationSlot ? { x: formationSlot.x, y: formationSlot.y } : { x: 50, y: 50 };
};

export const getFormationCoordinatesForSavedLineup = (system) => (
  getFormationSlotsForSavedLineup(system).map(({ x, y }) => ({ x, y }))
);
