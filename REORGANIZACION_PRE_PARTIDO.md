# Reorganización PRE Partido - Resumen de Cambios

## 🎯 Objetivo Alcanzado
Reorganizar la sección **PRE Partido** para que sea una herramienta rápida de preparación (no análisis postpartido), con estructura clara y componentes reutilizables.

---

## ✅ CAMBIOS REALIZADOS

### 1️⃣ **Estructura de Datos - Nuevos Campos en Match**

Se expandió `emptyMatchForm` en `App.jsx` con los siguientes campos:

#### Plan de Partido
```javascript
planConBalon: '',           // Tácticas con balón (3-5 ideas)
planSinBalon: '',           // Tácticas sin balón (3-5 ideas)
planTransiciones: '',       // Manejo de transiciones (2-3 ideas)
planClave: '',              // 🎯 Idea clave del partido
planObjetivo: '',           // Objetivo principal del partido
```

#### ABP Rápida
```javascript
abpEnlace: '',              // URL a Canva o PDF de ABP
abpOfensiva: '',            // Resumen de jugadas ofensivas planificadas
abpDefensiva: '',           // Resumen de situaciones defensivas planificadas
```

#### Alineación Rival Sincronizada
```javascript
rivalLineupSystem: '',      // Sistema de juego del rival (ej: 4-4-2)
rivalLineupPlayers: [],     // Jugadores del rival para el partido
```

---

### 2️⃣ **Vista de PRE Partido en Calendario**

Reestructurada la vista de la pestaña **PRE** para mostrar:

#### A) **Informe Rival**
- Pequeña tarjeta con las notas sobre el rival
- Características, puntos débiles, jugadores clave

#### B) **Plan de Partido**
- Tarjeta con **Clave** del partido
- Tarjeta con **Objetivo** del partido
- (Con balón, Sin balón y Transiciones se ven completos en edición)

#### C) **ABP Rápida** (condicional)
- Solo aparece si hay datos
- Enlace a Canva (clickeable)
- Resumen de notas ofensivas y defensivas

---

### 3️⃣ **Formulario de Edición de Partidos**

Se agregaron 4 secciones nuevas en el formulario (después de datos básicos):

#### Sección: **PRE Partido - Informe Rival**
```
- Notas sobre el rival (textarea)
```

#### Sección: **Plan de Partido**
```
- Con balón (3-5 ideas) [textarea]
- Sin balón (3-5 ideas) [textarea]
- Transiciones (2-3 ideas) [textarea]
- 🎯 Clave del partido [input]
- Objetivo del partido [input]
```

#### Sección: **ABP Rápida (Recordatorio)**
```
- Enlace a Canva o PDF [URL input]
- Notas ABP Ofensiva [textarea]
- Notas ABP Defensiva [textarea]
```

#### Sección: **Alineación Rival para el Partido**
```
- Botón: "Cargar desde Equipos" 
  → Sincroniza sistema y jugadores del rival
- Sistema (select con opciones: 4-4-2, 4-2-3-1, etc.)
- Estado: muestra cantidad de jugadores cargados
```

#### Sección: **POST Partido - Análisis**
```
- Notas de análisis postpartido [textarea]
- Aviso: "Eventos, vídeos y estadísticas se agregarán en futuras versiones"
```

---

### 4️⃣ **Integración con Equipos**

#### Botón "Cargar desde Equipos"
- Busca el rival por nombre en la lista de Equipos
- Trae automáticamente:
  - Sistema de juego habitual
  - Lista de jugadores (primeros 11)
- Permite personalizar para el partido sin tocar la base

#### Ventajas
✅ Reutiliza datos ya cargados  
✅ Evita duplicación  
✅ Mantiene plantilla base intacta en Equipos  
✅ Permite variaciones por partido

---

## 📊 Vista del Calendario (PRE Partido)

```
Informe rival
───────────────────────────────
Características del rival, puntos débiles, jugadores clave...

Plan de partido
───────────────────────────────
Clave: Controlar el mediocampo desde el inicio
Objetivo: Ganar los tres puntos en casa

ABP Rápida
───────────────────────────────
Ver ABP en Canva (link)
Ofensiva: ...
Defensiva: ...
```

---

## 🔄 POST Partido - Reservado para

Actualmente muestra solo notas de análisis.  
**En futuras versiones se agregará:**
- Eventos del partido (goles, tarjetas, ocasiones, etc.)
- Vídeo del partido
- Registro de eventos en vivo
- Estadísticas detalladas

---

## 🎨 Diseño Mantiene

✅ Tema oscuro profesional  
✅ Tarjetas blancas/claras  
✅ Botones azul eléctrico (#3DD9FF)  
✅ Mobile first (responsive)  
✅ Tipografía clara para cuerpo técnico  
✅ Espaciado consistente

---

## 🧪 Validación

- ✅ Build sin errores: `npm run build` exitoso
- ✅ Dev server ejecutándose: `npm run dev` funcionando
- ✅ Creación de nuevo partido: todos los campos funcionan
- ✅ Guardado y edición: datos persisten correctamente
- ✅ Vista PRE: subsecciones mostradas correctamente
- ✅ Botón "Cargar desde Equipos": lógica implementada

---

## 🚀 Siguientes Pasos (Opcionales)

1. **Alineación Visual en Campo**
   - Dibujar jugadores en línea de formación
   - Reutilizar lógica de Equipos

2. **Eventos POST Partido**
   - Formulario para registrar goles
   - Historial de eventos en vivo

3. **Histórico de Planes**
   - Guardar planes anteriores para análisis

4. **Exportar Plan**
   - PDF con Plan de Partido + ABP

---

## 📝 Notas Técnicas

- **Archivo principal:** `src/App.jsx` (2119 líneas)
- **Patrón:** Un único archivo monolítico con todo integrado
- **Estado:** React hooks (useState, useMemo)
- **Persistencia:** localStorage (matchesStorageKey, teamsStorageKey)
- **Sin dependencias externas** (solo React 18.3.1)

---

## ✨ Resultado Final

**PRE Partido** es ahora una herramienta clara y funcional para:
- Preparar partidos rápidamente
- Acceder a tácticas, objetivos y plan ofensivo/defensivo
- Consultar ABP sin abandonar la app
- Sincronizar información del rival desde Equipos
- Personalizar alineación para cada partido

Sin duplicar análisis postpartido ni eventos que sucederán durante el partido.
