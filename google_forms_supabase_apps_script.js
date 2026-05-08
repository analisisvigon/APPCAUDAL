/**
 * Google Forms -> Google Sheets -> Apps Script -> Supabase
 *
 * V1 automatica para Rendimiento.
 *
 * IMPORTANTE:
 * - SUPABASE_SERVICE_ROLE_KEY no debe estar nunca en React ni en archivos publicos.
 * - Guardala solo en Apps Script > Project Settings > Script properties.
 *
 * Script properties necesarias:
 * - SUPABASE_URL: https://xxxxx.supabase.co
 * - SUPABASE_SERVICE_ROLE_KEY: service_role key privada de Supabase
 *
 * Hoja auxiliar obligatoria: jugadores_map
 * Columnas:
 * - form_name
 * - jugador_id
 * - name
 *
 * Form Wellness diario. Columnas esperadas/recomendadas:
 * - Fecha
 * - Nombre y apellidos
 *   Debe ser un desplegable con los nombres usados en jugadores_map.form_name.
 * - Horas de sueño
 * - Sueño o Calidad del sueño
 * - Fatiga
 * - Dolor muscular
 * - Estrés
 * - Estado de ánimo
 * - Peso
 * - Molestias
 * - Comentario
 *
 * Las respuestas categóricas de Sueño, Molestias y Estado de ánimo se convierten
 * automáticamente a escala 1-10 antes de guardar en Supabase.
 *
 * Form RPE post-entrenamiento. Columnas esperadas:
 * - Fecha
 * - Código sesión
 *   Debe ser un desplegable con training_sessions.form_code.
 * - Nombre y apellidos
 * - Duración minutos
 * - RPE
 * - Comentario
 *
 * Formato recomendado de Código sesión:
 * RPE-YYYY-MM-DD-MD3
 * Ejemplo: RPE-2026-05-08-MD3
 *
 * Triggers:
 * 1. En el Google Sheet del Wellness:
 *    Apps Script > Triggers > Add Trigger
 *    function: onWellnessSubmit
 *    event source: From spreadsheet
 *    event type: On form submit
 *
 * 2. En el Google Sheet del RPE:
 *    Apps Script > Triggers > Add Trigger
 *    function: onRpeSubmit
 *    event source: From spreadsheet
 *    event type: On form submit
 */

const PLAYERS_MAP_SHEET = 'jugadores_map';

function onWellnessSubmit(e) {
  try {
    const row = getNamedValues(e);
    const playerName = getFirstValue(row, ['Nombre y apellidos', 'Jugador', 'Nombre']);
    const player = findPlayerIdByFormName(playerName);
    if (!player) {
      throw new Error(`Jugador no encontrado en jugadores_map: "${playerName}". No se inserta wellness.`);
    }

    const sleepValue = getFirstValue(row, ['Calidad del sueño', 'Calidad del sueno', 'Sueño', 'Sueno']);
    const sorenessValue = getFirstValue(row, ['Dolor muscular', 'Molestias']);
    const moodValue = getFirstValue(row, ['Estado de ánimo', 'Estado de animo', 'Ánimo', 'Animo']);

    const payload = {
      jugador_id: player.jugador_id,
      entry_date: toIsoDate(getFirstValue(row, ['Fecha'])),
      sleep_hours: toNullableNumber(getFirstValue(row, ['Horas de sueño', 'Horas de sueno', 'Horas sueño', 'Horas sueno'])),
      sleep_quality: toWellnessScale(sleepValue, 'sleep'),
      fatigue: toWellnessScale(getFirstValue(row, ['Fatiga']), 'high-is-bad'),
      muscle_soreness: toWellnessScale(sorenessValue, 'discomfort'),
      stress: toWellnessScale(getFirstValue(row, ['Estrés', 'Estres']), 'high-is-bad'),
      mood: toWellnessScale(moodValue, 'mood'),
      weight: toNullableNumber(getFirstValue(row, ['Peso'])),
      discomfort: getFirstValue(row, ['Molestias']) || '',
      comment: getFirstValue(row, ['Comentario', 'Comentarios']) || '',
    };

    requireFields(payload, ['jugador_id', 'entry_date'], 'wellness');
    upsertSupabase('wellness_entries', payload, 'jugador_id,entry_date');
    console.log('Wellness sincronizado con Supabase', payload);
  } catch (error) {
    console.error('Error en onWellnessSubmit:', error);
    throw error;
  }
}

function onRpeSubmit(e) {
  try {
    const row = getNamedValues(e);
    const playerName = getFirstValue(row, ['Nombre y apellidos', 'Jugador', 'Nombre']);
    const player = findPlayerIdByFormName(playerName);
    if (!player) {
      throw new Error(`Jugador no encontrado en jugadores_map: "${playerName}". No se inserta RPE.`);
    }

    const formCode = String(getFirstValue(row, ['Código sesión', 'Codigo sesion', 'Código de sesión', 'Codigo de sesion']) || '').trim();
    if (!formCode) {
      throw new Error('Falta Código sesión. No se inserta RPE.');
    }

    const session = findTrainingSessionByFormCode(formCode);
    if (!session) {
      throw new Error(`Sesión no encontrada en Supabase para form_code "${formCode}". No se inserta RPE.`);
    }

    const payload = {
      jugador_id: player.jugador_id,
      session_id: session.id,
      entry_date: toIsoDate(getFirstValue(row, ['Fecha'])) || session.session_date,
      duration_minutes: toInt(getFirstValue(row, ['Duración minutos', 'Duracion minutos', 'Duración', 'Duracion']), 0),
      rpe: toInt(getFirstValue(row, ['RPE']), null),
      comment: getFirstValue(row, ['Comentario', 'Comentarios']) || '',
    };

    requireFields(payload, ['jugador_id', 'session_id', 'entry_date', 'rpe'], 'rpe');
    upsertSupabase('rpe_entries', payload, 'jugador_id,session_id');
    console.log('RPE sincronizado con Supabase', payload);
  } catch (error) {
    console.error('Error en onRpeSubmit:', error);
    throw error;
  }
}

function getSupabaseConfig() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const serviceRoleKey = properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Script properties.');
  }
  return {
    url: url.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

function supabaseFetch(path, options) {
  const config = getSupabaseConfig();
  const response = UrlFetchApp.fetch(`${config.url}/rest/v1/${path}`, {
    muteHttpExceptions: true,
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options && options.headers ? options.headers : {}),
    },
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase error ${status}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

function upsertSupabase(table, payload, onConflict) {
  return supabaseFetch(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'post',
    payload: JSON.stringify(payload),
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
}

function findTrainingSessionByFormCode(formCode) {
  const encoded = encodeURIComponent(formCode);
  const rows = supabaseFetch(`training_sessions?select=id,session_date,form_code&form_code=eq.${encoded}&limit=1`, {
    method: 'get',
  });
  return rows && rows.length ? rows[0] : null;
}

function findPlayerIdByFormName(formName) {
  const normalized = normalizeName(formName);
  if (!normalized) return null;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAYERS_MAP_SHEET);
  if (!sheet) {
    throw new Error(`No existe la hoja auxiliar "${PLAYERS_MAP_SHEET}".`);
  }

  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map((header) => String(header).trim());
  const formNameIndex = headers.indexOf('form_name');
  const playerIdIndex = headers.indexOf('jugador_id');
  const nameIndex = headers.indexOf('name');
  if (formNameIndex === -1 || playerIdIndex === -1 || nameIndex === -1) {
    throw new Error('jugadores_map debe tener columnas: form_name, jugador_id, name.');
  }

  const row = values.find((item) => normalizeName(item[formNameIndex]) === normalized || normalizeName(item[nameIndex]) === normalized);
  if (!row) return null;
  return {
    form_name: row[formNameIndex],
    jugador_id: row[playerIdIndex],
    name: row[nameIndex],
  };
}

function getNamedValues(e) {
  if (!e || !e.namedValues) {
    throw new Error('Evento de formulario invalido. Usa trigger "On form submit" desde Google Sheets.');
  }
  return Object.fromEntries(
    Object.entries(e.namedValues).map(([key, value]) => [String(key).trim(), Array.isArray(value) ? value[0] : value])
  );
}

function getFirstValue(row, candidateKeys) {
  const entries = Object.entries(row);
  for (const candidate of candidateKeys) {
    const exactValue = row[candidate];
    if (exactValue !== '' && exactValue !== null && exactValue !== undefined) return exactValue;

    const normalizedCandidate = normalizeName(candidate);
    const match = entries.find(([key, value]) => normalizeName(key) === normalizedCandidate && value !== '' && value !== null && value !== undefined);
    if (match) return match[1];
  }
  return '';
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toIsoDate(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (parts) return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return text;
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function toNullableInt(value) {
  const number = toNullableNumber(value);
  return number === null ? null : Math.round(number);
}

function toWellnessScale(value, kind) {
  const numeric = toNullableInt(value);
  if (numeric !== null) return Math.max(1, Math.min(10, numeric));

  const text = normalizeName(value);
  if (!text) return null;

  if (kind === 'sleep') {
    if (hasAny(text, ['excelente', 'muy bien', 'muy bueno', 'descansado', 'perfecto'])) return 9;
    if (hasAny(text, ['bien', 'bueno'])) return 7;
    if (hasAny(text, ['regular', 'normal', 'medio'])) return 5;
    if (hasAny(text, ['muy mal', 'fatal', 'pesimo', 'nada'])) return 1;
    if (hasAny(text, ['mal', 'malo', 'poco', 'bajo'])) return 3;
  }

  if (kind === 'mood') {
    if (hasAny(text, ['excelente', 'muy bien', 'muy bueno', 'motivado', 'feliz', 'alegre'])) return 9;
    if (hasAny(text, ['bien', 'bueno'])) return 7;
    if (hasAny(text, ['regular', 'normal', 'medio'])) return 5;
    if (hasAny(text, ['muy mal', 'fatal', 'pesimo'])) return 1;
    if (hasAny(text, ['mal', 'malo', 'bajo', 'triste', 'cansado'])) return 3;
  }

  if (kind === 'discomfort') {
    if (hasAny(text, ['sin molestias', 'ninguna', 'no', 'nada', 'sin dolor'])) return 1;
    if (hasAny(text, ['leve', 'poco', 'baja'])) return 3;
    if (hasAny(text, ['moderada', 'regular', 'media'])) return 5;
    if (hasAny(text, ['muy alta', 'muchisimo', 'fuerte', 'dolor fuerte'])) return 9;
    if (hasAny(text, ['alta', 'mucho', 'dolor'])) return 8;
  }

  if (kind === 'high-is-bad') {
    if (hasAny(text, ['nada', 'muy baja', 'ninguna'])) return 1;
    if (hasAny(text, ['baja', 'poca', 'leve'])) return 3;
    if (hasAny(text, ['regular', 'normal', 'media', 'moderada'])) return 5;
    if (hasAny(text, ['muy alta', 'muchisimo', 'extrema'])) return 9;
    if (hasAny(text, ['alta', 'mucho'])) return 8;
  }

  return null;
}

function hasAny(text, fragments) {
  return fragments.some((fragment) => text.indexOf(normalizeName(fragment)) !== -1);
}

function toInt(value, fallback) {
  const number = toNullableInt(value);
  return number === null ? fallback : number;
}

function requireFields(payload, fields, label) {
  const missing = fields.filter((field) => payload[field] === '' || payload[field] === null || payload[field] === undefined);
  if (missing.length) {
    throw new Error(`Faltan campos obligatorios para ${label}: ${missing.join(', ')}`);
  }
}
