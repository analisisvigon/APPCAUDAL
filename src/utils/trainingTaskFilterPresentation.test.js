import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTrainingTaskFilters } from './trainingTasks.js';
import { countActiveTrainingTaskAdvancedFilters } from './trainingTaskFilterPresentation.js';

const empty = createTrainingTaskFilters();
assert.equal(countActiveTrainingTaskAdvancedFilters(empty), 0);
assert.equal(countActiveTrainingTaskAdvancedFilters({ ...empty, search: 'rondo', taskType: 'rondos', stage: 'juvenil', scope: 'mine' }), 0, 'los filtros principales no incrementan el contador avanzado');
assert.equal(countActiveTrainingTaskAdvancedFilters({ ...empty, ratingMin: '3', taskCode: 'VIG', duration: 'short' }), 3);
assert.equal(countActiveTrainingTaskAdvancedFilters(createTrainingTaskFilters()), 0, 'limpiar filtros también limpia los avanzados');
const section = await readFile(new URL('../components/training/TrainingTasksSection.jsx', import.meta.url), 'utf8');
for (const label of ['Buscar tareas', 'Filtrar por tipo', 'Filtrar por etapa', 'Filtrar por propiedad']) assert.match(section, new RegExp(`aria-label="${label}"`), `${label} permanece visible como filtro principal`);
assert.match(section, />Más filtros\{advancedFilterCount \? ` · \$\{advancedFilterCount\}` : ''\}<\/button>/, 'Más filtros muestra el contador avanzado');
assert.match(section, /showAdvancedFilters \? <div[\s\S]*Filtrar por valoración mínima[\s\S]*Filtrar por código[\s\S]*Filtrar por número de jugadores[\s\S]*Filtrar por objetivo[\s\S]*Filtrar por fase[\s\S]*Filtrar por duración/, 'los filtros avanzados permanecen disponibles');
assert.match(section, /setFilters\(createTrainingTaskFilters\(\)\); setShowAdvancedFilters\(false\)/, 'Limpiar filtros reinicia también avanzados y panel');
console.log('training task filter presentation tests passed');
