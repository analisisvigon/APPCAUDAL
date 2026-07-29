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
 * El jugador se resuelve directamente contra public.jugadores en Supabase.
 * Se usa google_forms_name cuando está configurado y name únicamente como fallback.
 * La comparación ignora mayúsculas, tildes y espacios sobrantes, pero nunca es parcial.
 *
 * Form Wellness diario. Columnas esperadas/recomendadas:
 * - Fecha
 * - Nombre y apellidos.
 * - Horas de sueño
 * - Sueño o Calidad del sueño
 * - Fatiga
 * - Dolor muscular
 * - Estrés
 * - Estado de ánimo
 * - Peso
 * - Molestias
 * - Comentario
 * - Ratio salud
 *
 * Las respuestas categóricas de Sueño, Molestias y Estado de ánimo se convierten
 * automáticamente a escala 1-10 antes de guardar en Supabase.
 *
 * Form RPE post-entrenamiento. Columnas esperadas:
 * - Marca temporal (la añade Google Forms automáticamente)
 * - Nombre y apellidos.
 * - RPE
 * - Comentario
 *
 * No hace falta modificar los Forms ni añadir un código de sesión. El script usa
 * la fecha de Marca temporal y solo asocia el RPE si encuentra exactamente una
 * training_session en ese día.
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
 *
 * Importación histórica Wellness:
 * - Ejecuta manualmente importAllWellnessHistory desde Apps Script.
 * - Puede repetirse: el upsert por jugador_id + entry_date evita duplicados.
 */

const TECHNICAL_COLUMNS = ['Supabase status', 'Supabase session_id', 'Supabase error', 'Supabase synced_at'];
const FORMULA_RETRY_COUNT = 3;
const FORMULA_RETRY_DELAY_MS = 250;
const WELLNESS_IMPORT_BATCH_SIZE = 100;

function onWellnessSubmit(e) {
  let submission = null;
  try {
    submission = readSubmittedSheetRow(e, { waitForHeader: 'Ratio salud' });
    const row = submission.values;
    const playerName = getFirstValue(row, ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']);
    const player = findPlayerIdByFormName(playerName);
    if (!player) {
      throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta wellness.`);
    }

    const payload = buildWellnessPayload(row, player.jugador_id);

    requireFields(payload, ['jugador_id', 'entry_date'], 'wellness');
    upsertSupabase('wellness_entries', payload, 'jugador_id,entry_date');
    setSubmissionSyncState(submission, { status: 'SYNCED', sessionId: '', error: '', syncedAt: new Date() });
    console.log('Wellness sincronizado con Supabase', payload);
  } catch (error) {
    if (submission) {
      setSubmissionSyncState(submission, { status: 'ERROR', sessionId: '', error: error.message || String(error), syncedAt: '' });
    }
    console.error('Error en onWellnessSubmit:', error);
    throw error;
  }
}

function onRpeSubmit(e) {
  let submission = null;
  try {
    submission = readSubmittedSheetRow(e);
    const row = submission.values;
    const playerName = getFirstValue(row, ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']);
    const player = findPlayerIdByFormName(playerName);
    if (!player) {
      throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta RPE.`);
    }

    const responseDate = toIsoDate(getFirstValue(row, ['Marca temporal', 'Timestamp']));
    requireFields({ responseDate }, ['responseDate'], 'fecha RPE');
    const sessions = findTrainingSessionsByDate(responseDate);
    const match = classifyTrainingSessionMatch(sessions);
    const rpeValue = toInt(getFirstValue(row, ['RPE']), null);
    const comment = getFirstValue(row, ['Comentario', 'Comentarios']) || '';
    requireFields({ rpeValue }, ['rpeValue'], 'rpe');

    if (match.status !== 'MATCHED') {
      const pendingError = match.status === 'NO_SESSION'
        ? `No existe una sesión registrada para ${responseDate}.`
        : `Hay ${sessions.length} sesiones registradas para ${responseDate}.`;
      upsertSupabase('rpe_sync_pending', {
        jugador_id: player.jugador_id,
        entry_date: responseDate,
        rpe: rpeValue,
        comment,
        candidate_count: sessions.length,
        error: pendingError,
      }, 'jugador_id,entry_date');
      setSubmissionSyncState(submission, {
        status: match.status === 'NO_SESSION' ? 'PENDING_NO_SESSION' : 'PENDING_MULTIPLE_SESSIONS',
        sessionId: '',
        error: pendingError,
        syncedAt: '',
      });
      console.warn('RPE pendiente de resolución manual', { player: player.jugador_id, responseDate, candidateCount: sessions.length });
      return;
    }

    const session = match.session;
    const payload = {
      jugador_id: player.jugador_id,
      session_id: session.id,
      entry_date: session.session_date,
      duration_minutes: toInt(session.planned_duration, 0),
      rpe: rpeValue,
      comment,
    };

    requireFields(payload, ['jugador_id', 'session_id', 'entry_date', 'rpe'], 'rpe');
    upsertSupabase('rpe_entries', payload, 'jugador_id,session_id');
    deleteSupabase('rpe_sync_pending', `jugador_id=eq.${encodeURIComponent(player.jugador_id)}&entry_date=eq.${encodeURIComponent(responseDate)}`);
    setSubmissionSyncState(submission, { status: 'SYNCED', sessionId: session.id, error: '', syncedAt: new Date() });
    console.log('RPE sincronizado con Supabase', payload);
  } catch (error) {
    if (submission) {
      setSubmissionSyncState(submission, { status: 'ERROR', sessionId: '', error: error.message || String(error), syncedAt: '' });
    }
    console.error('Error en onRpeSubmit:', error);
    throw error;
  }
}

function importAllWellnessHistory() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findWellnessResponseSheet(spreadsheet);
  const technical = ensureTechnicalColumns(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const emptySummary = { sheet: sheet.getName(), rows: 0, upserted: 0, duplicatesMerged: 0, errors: 0 };
    console.log('Histórico Wellness: no hay filas para importar.', emptySummary);
    return emptySummary;
  }

  SpreadsheetApp.flush();
  const rows = sheet.getRange(2, 1, lastRow - 1, technical.lastColumn).getValues();
  const rowItems = rows.map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(technical.headers.map((header, columnIndex) => [String(header).trim(), row[columnIndex]])),
  }));
  const plan = buildWellnessHistoryImportPlan(rowItems, fetchPlayersForForms());
  const syncStates = {};

  plan.failures.forEach((failure) => {
    syncStates[failure.rowNumber] = {
      status: 'ERROR',
      sessionId: '',
      error: failure.error,
      syncedAt: '',
    };
  });

  let upserted = 0;
  let syncedRows = 0;
  for (let offset = 0; offset < plan.groups.length; offset += WELLNESS_IMPORT_BATCH_SIZE) {
    const groups = plan.groups.slice(offset, offset + WELLNESS_IMPORT_BATCH_SIZE);
    try {
      upsertSupabase('wellness_entries', groups.map((group) => group.payload), 'jugador_id,entry_date');
      const syncedAt = new Date();
      groups.forEach((group) => {
        group.rowNumbers.forEach((rowNumber) => {
          syncStates[rowNumber] = {
            status: 'SYNCED',
            sessionId: '',
            error: '',
            syncedAt,
          };
          syncedRows += 1;
        });
      });
      upserted += groups.length;
    } catch (error) {
      const message = error.message || String(error);
      groups.forEach((group) => {
        group.rowNumbers.forEach((rowNumber) => {
          syncStates[rowNumber] = {
            status: 'ERROR',
            sessionId: '',
            error: message,
            syncedAt: '',
          };
        });
      });
      plan.failures.push(...groups.flatMap((group) =>
        group.rowNumbers.map((rowNumber) => ({ rowNumber, error: message }))
      ));
    }
  }
  writeHistorySyncStates(sheet, technical.columns, lastRow, syncStates);

  const summary = {
    sheet: sheet.getName(),
    rows: rowItems.length,
    syncedRows,
    upserted,
    duplicatesMerged: plan.duplicatesMerged,
    skipped: plan.skipped,
    errors: plan.failures.length,
  };
  console.log('Histórico Wellness importado.', summary);
  return summary;
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

function deleteSupabase(table, query) {
  return supabaseFetch(`${table}?${query}`, {
    method: 'delete',
    headers: {
      Prefer: 'return=minimal',
    },
  });
}

function findTrainingSessionsByDate(sessionDate) {
  const encoded = encodeURIComponent(sessionDate);
  return supabaseFetch(`training_sessions?select=id,session_date,planned_duration,title,session_type&session_date=eq.${encoded}&order=created_at.asc`, {
    method: 'get',
  }) || [];
}

function classifyTrainingSessionMatch(sessions) {
  const rows = Array.isArray(sessions) ? sessions : [];
  if (rows.length === 1) return { status: 'MATCHED', session: rows[0] };
  if (rows.length === 0) return { status: 'NO_SESSION', session: null };
  return { status: 'MULTIPLE_SESSIONS', session: null };
}

function findPlayerIdByFormName(formName) {
  const submittedName = String(formName || '').trim();
  if (!submittedName) return null;
  return resolvePlayerByFormName(fetchPlayersForForms(), submittedName);
}

function fetchPlayersForForms() {
  return supabaseFetch(
    'jugadores?select=id,name,google_forms_name&order=id.asc&limit=1000',
    { method: 'get' }
  ) || [];
}

function resolvePlayerByFormName(players, formName) {
  const normalizedFormName = normalizeName(formName);
  if (!normalizedFormName) return null;

  const matches = (Array.isArray(players) ? players : []).filter((player) => {
    const normalizedGoogleFormsName = normalizeName(player.google_forms_name);
    const normalizedCandidate = normalizedGoogleFormsName || normalizeName(player.name);
    return normalizedCandidate === normalizedFormName;
  });

  if (matches.length > 1) {
    throw new Error(`Coincidencia ambigua para "${String(formName || '').trim()}": ${matches.length} jugadores compatibles en public.jugadores.`);
  }
  const row = matches[0];
  if (!row) return null;
  return {
    jugador_id: row.id,
    name: row.name,
    google_forms_name: row.google_forms_name || null,
  };
}

function buildWellnessPayload(row, playerId) {
  const sleepValue = getFirstValue(row, [
    'Calidad del sueño',
    'Calidad del sueno',
    '¿Qué tal dormiste anoche?',
    'Sueño',
    'Sueno',
  ]);
  const sorenessValue = getFirstValue(row, [
    'Daño muscular',
    'Dano muscular',
    '¿Cuánto te duelen los músculos hoy?',
    'Dolor muscular',
    'Molestias',
  ]);
  const moodValue = getFirstValue(row, [
    'Estado de ánimo.',
    'Estado de ánimo',
    'Estado de animo.',
    'Estado de animo',
    'Ánimo',
    'Animo',
  ]);

  return {
    jugador_id: playerId,
    entry_date: toIsoDate(getFirstValue(row, ['Fecha', 'Marca temporal', 'Timestamp'])),
    sleep_hours: toNullableNumber(getFirstValue(row, ['Horas de sueño', 'Horas de sueno', 'Horas sueño', 'Horas sueno'])),
    sleep_quality: toWellnessScale(sleepValue, 'sleep'),
    fatigue: toWellnessScale(getFirstValue(row, ['¿Cómo de fatigado estás hoy?', 'Fatiga']), 'high-is-bad'),
    muscle_soreness: toWellnessScale(sorenessValue, 'discomfort'),
    stress: toWellnessScale(getFirstValue(row, ['¿Cómo de estresado estás hoy?', 'Estrés', 'Estres']), 'high-is-bad'),
    mood: toWellnessScale(moodValue, 'mood'),
    weight: toNullableNumber(getFirstValue(row, ['¿Cuál tu peso hoy?', 'Peso'])),
    discomfort: getFirstValue(row, ['Especificar la molestia en caso de tener alguna', 'Molestias']) || '',
    comment: getFirstValue(row, ['Información personal: (molestias, comentarios)', 'Comentario', 'Comentarios']) || '',
    health_ratio: toHealthRatio(getFirstValue(row, ['Ratio salud'])),
  };
}

function buildWellnessHistoryImportPlan(rowItems, players) {
  const groupsByKey = {};
  const failures = [];
  let skipped = 0;

  (Array.isArray(rowItems) ? rowItems : []).forEach((item) => {
    const row = item.values || {};
    const playerName = getFirstValue(row, ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']);
    const entryDate = getFirstValue(row, ['Fecha', 'Marca temporal', 'Timestamp']);
    if (!playerName && !entryDate) {
      skipped += 1;
      return;
    }

    try {
      const player = resolvePlayerByFormName(players, playerName);
      if (!player) {
        throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta wellness.`);
      }
      const payload = buildWellnessPayload(row, player.jugador_id);
      requireFields(payload, ['jugador_id', 'entry_date'], 'wellness');
      const key = `${payload.jugador_id}|${payload.entry_date}`;
      const existing = groupsByKey[key];
      groupsByKey[key] = {
        payload,
        rowNumbers: existing ? [...existing.rowNumbers, item.rowNumber] : [item.rowNumber],
      };
    } catch (error) {
      failures.push({
        rowNumber: item.rowNumber,
        error: error.message || String(error),
      });
    }
  });

  const groups = Object.values(groupsByKey);
  return {
    groups,
    failures,
    skipped,
    duplicatesMerged: groups.reduce((total, group) => total + Math.max(0, group.rowNumbers.length - 1), 0),
  };
}

function findWellnessResponseSheet(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheets !== 'function') {
    throw new Error('No se pudo acceder al Google Sheet de Wellness.');
  }
  const candidates = spreadsheet.getSheets().filter((sheet) => {
    const lastColumn = sheet.getLastColumn();
    if (!lastColumn) return false;
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    const normalizedHeaders = headers.map(normalizeName);
    const hasPlayer = ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']
      .some((header) => normalizedHeaders.includes(normalizeName(header)));
    return hasPlayer && normalizedHeaders.includes(normalizeName('Ratio salud'));
  });
  if (!candidates.length) {
    throw new Error('No se encontró una hoja con las cabeceras de Wellness.');
  }
  const activeSheet = typeof spreadsheet.getActiveSheet === 'function' ? spreadsheet.getActiveSheet() : null;
  if (activeSheet && candidates.some((sheet) => sheet.getSheetId() === activeSheet.getSheetId())) {
    return activeSheet;
  }
  if (candidates.length > 1) {
    throw new Error('Hay varias hojas compatibles con Wellness. Activa la hoja que quieres importar y vuelve a ejecutar.');
  }
  return candidates[0];
}

function getNamedValues(e) {
  if (!e || !e.namedValues) {
    throw new Error('Evento de formulario invalido. Usa trigger "On form submit" desde Google Sheets.');
  }
  return Object.fromEntries(
    Object.entries(e.namedValues).map(([key, value]) => [String(key).trim(), Array.isArray(value) ? value[0] : value])
  );
}

function ensureTechnicalColumns(sheet) {
  const currentLastColumn = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getDisplayValues()[0];
  const missingHeaders = TECHNICAL_COLUMNS.filter((header) =>
    !currentHeaders.some((current) => normalizeName(current) === normalizeName(header))
  );

  if (missingHeaders.length) {
    const requiredLastColumn = currentLastColumn + missingHeaders.length;
    if (requiredLastColumn > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredLastColumn - sheet.getMaxColumns());
    }
    sheet.getRange(1, currentLastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const columns = {};
  TECHNICAL_COLUMNS.forEach((header) => {
    const index = headers.findIndex((current) => normalizeName(current) === normalizeName(header)) + 1;
    columns[header] = index;
    if (index > 0) sheet.hideColumns(index);
  });
  return { headers, columns, lastColumn };
}

function readSubmittedSheetRow(e, options) {
  if (!e || !e.range || typeof e.range.getSheet !== 'function') {
    throw new Error('Evento de formulario inválido. Usa trigger "On form submit" desde Google Sheets.');
  }

  const sheet = e.range.getSheet();
  const rowNumber = e.range.getRow();
  const technical = ensureTechnicalColumns(sheet);
  const waitForHeader = options && options.waitForHeader;
  let values = {};

  for (let attempt = 0; attempt < FORMULA_RETRY_COUNT; attempt += 1) {
    SpreadsheetApp.flush();
    const row = sheet.getRange(rowNumber, 1, 1, technical.lastColumn).getValues()[0];
    values = Object.fromEntries(technical.headers.map((header, index) => [String(header).trim(), row[index]]));
    if (!waitForHeader || getFirstValue(values, [waitForHeader]) !== '') break;
    if (attempt < FORMULA_RETRY_COUNT - 1) Utilities.sleep(FORMULA_RETRY_DELAY_MS);
  }

  return {
    sheet,
    rowNumber,
    columns: technical.columns,
    values,
  };
}

function setSubmissionSyncState(submission, state) {
  if (!submission || !submission.sheet) return;
  const values = {
    'Supabase status': state.status || '',
    'Supabase session_id': state.sessionId || '',
    'Supabase error': state.error || '',
    'Supabase synced_at': state.syncedAt || '',
  };
  Object.entries(values).forEach(([header, value]) => {
    const column = submission.columns[header];
    if (column) submission.sheet.getRange(submission.rowNumber, column).setValue(value);
  });
}

function writeHistorySyncStates(sheet, columns, lastRow, statesByRow) {
  const fields = {
    'Supabase status': 'status',
    'Supabase session_id': 'sessionId',
    'Supabase error': 'error',
    'Supabase synced_at': 'syncedAt',
  };
  Object.entries(fields).forEach(([header, stateField]) => {
    const column = columns[header];
    if (!column || lastRow < 2) return;
    const range = sheet.getRange(2, column, lastRow - 1, 1);
    const values = range.getValues();
    Object.entries(statesByRow).forEach(([rowNumber, state]) => {
      const index = Number(rowNumber) - 2;
      if (index >= 0 && index < values.length) {
        values[index][0] = state[stateField] || '';
      }
    });
    range.setValues(values);
  });
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
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+.*)?$/);
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

function toHealthRatio(value) {
  const number = toNullableNumber(value);
  if (number === null) return null;
  if (number < 0 || number > 10) {
    throw new Error(`Ratio salud fuera de escala 0-10: ${value}`);
  }
  return number;
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
