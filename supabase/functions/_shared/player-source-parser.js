const decodeEntities = (value = '') => String(value)
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&nbsp;/gi, ' ');

const cleanText = (value = '') => decodeEntities(String(value))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeUrl = (value, baseUrl) => {
  if (!String(value || '').trim()) return '';
  try {
    return new URL(String(value || ''), baseUrl).href;
  } catch {
    return '';
  }
};

const getMeta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  return decodeEntities(candidates.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || '').trim();
};

const getCanonical = (html, baseUrl) => {
  const direct = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)?.[1];
  return normalizeUrl(direct, baseUrl) || baseUrl;
};

const parseJsonLd = (html) => {
  const objects = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1]).trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        objects.push(item);
        if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
      }
    } catch {
      // JSON-LD inválido: se ignora sin convertir texto dudoso en datos.
    }
  }
  return objects;
};

const hasType = (item, expected) => {
  const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']];
  return types.some((type) => String(type || '').toLowerCase() === expected.toLowerCase());
};

const firstValue = (...values) => values.flat(Infinity).find((value) => value !== undefined && value !== null && String(value).trim()) || '';
const valueFromEntity = (value) => typeof value === 'string' ? value : firstValue(value?.name, value?.['@id'], value?.url);

const normalizeDate = (value) => {
  const text = cleanText(value);
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const numeric = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  return '';
};

const normalizeHeight = (value) => {
  const text = cleanText(value).replace(',', '.');
  const meters = text.match(/\b([12][.]\d{2})\s*m?\b/i);
  if (meters) return `${meters[1].replace('.', ',')} m`;
  const centimeters = text.match(/\b(1[4-9]\d|2[0-2]\d)\s*cm\b/i);
  if (centimeters) return `${centimeters[1]} cm`;
  return '';
};

const normalizeFoot = (value) => {
  const text = cleanText(value).toLowerCase();
  if (/ambas|ambidiestro|both|two-footed/.test(text)) return 'Ambas';
  if (/izquierd|left/.test(text)) return 'Izquierda';
  if (/derech|right/.test(text)) return 'Derecha';
  return '';
};

const isSafePortrait = (value) => {
  const url = String(value || '');
  return /^https:\/\//i.test(url)
    && !/logo|crest|escudo|wappen|badge|banner|advert|avatar|default|placeholder|no[-_]?photo|news/i.test(url);
};

const sourceTypeFromUrl = (url) => {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes('transfermarkt.')) return 'transfermarkt';
  if (hostname.includes('besoccer.')) return 'besoccer';
  return 'generic';
};

const addField = (fields, field, value, confidence, sourceUrl, evidence) => {
  const cleanValue = typeof value === 'string' ? cleanText(value) : value;
  if (cleanValue === '' || cleanValue === null || cleanValue === undefined) return;
  if (fields.some((item) => item.field === field)) return;
  fields.push({ field, value: cleanValue, confidence, sourceUrl, evidence: cleanText(evidence).slice(0, 240) });
};

const getVisibleEvidence = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return { value: match[1].trim(), evidence: match[0].trim() };
  }
  return { value: '', evidence: '' };
};

export const analyzePlayerSourceHtml = ({ html, sourceUrl, finalUrl = sourceUrl, contentType = 'text/html' }) => {
  const sourceType = sourceTypeFromUrl(sourceUrl);
  const canonicalUrl = getCanonical(html, finalUrl);
  const jsonLd = parseJsonLd(html);
  const person = jsonLd.find((item) => hasType(item, 'Person')) || null;
  const sportsTeam = jsonLd.find((item) => hasType(item, 'SportsTeam')) || null;
  const ogType = getMeta(html, 'og:type').toLowerCase();
  const ogTitle = getMeta(html, 'og:title');
  const ogImage = normalizeUrl(getMeta(html, 'og:image'), finalUrl);
  const pageText = cleanText(html).slice(0, 180000);
  const urlLooksLikePlayer = /\/(spieler|jugador|player|futbolista|profil\/spieler|perfil)\//i.test(finalUrl);
  const hasPlayerLabels = /fecha de nacimiento|date of birth|geburtsdatum|posición|position|altura|height|pierna|preferred foot|fuß/i.test(pageText);
  const articlePage = /article|newsarticle/.test(ogType) || jsonLd.some((item) => hasType(item, 'NewsArticle') || hasType(item, 'Article'));
  const recognizedPlayerProfile = urlLooksLikePlayer && ['transfermarkt', 'besoccer'].includes(sourceType);
  const playerPage = Boolean(person || recognizedPlayerProfile || urlLooksLikePlayer || (hasPlayerLabels && !articlePage));
  const pageType = person || recognizedPlayerProfile ? 'player_profile' : sportsTeam && !person ? 'team' : articlePage ? 'article' : playerPage ? 'probable_player_profile' : 'unknown';
  const fields = [];
  const discarded = [];

  if (!playerPage) {
    return {
      ok: true,
      status: 'not_player',
      sourceType,
      pageType,
      canonicalUrl,
      fields,
      discarded: ['Contenido sin evidencia suficiente de una ficha individual de jugador.'],
      structuredData: { jsonLdTypes: jsonLd.map((item) => item['@type']).filter(Boolean), openGraphType: ogType || null },
    };
  }

  const personName = person?.name;
  const headingName = cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  addField(fields, 'name', firstValue(personName, headingName, ogTitle.replace(/\s*[-|].*$/, '')), personName ? 'high' : 'medium', sourceUrl, personName ? `JSON-LD Person.name: ${personName}` : `Título de la ficha: ${headingName || ogTitle}`);

  const rawPersonImage = firstValue(person?.image?.url, person?.image, person?.photo?.url, person?.photo);
  const transfermarktPortraitUrl = sourceType === 'transfermarkt'
    ? html.match(/https?:\/\/[^"'\s<>]+\/portrait\/(?:header|medium|small)\/[^"'\s<>]+/i)?.[0] || ''
    : '';
  const specificPortrait = sourceType === 'transfermarkt'
    ? normalizeUrl(transfermarktPortraitUrl || html.match(/<img[^>]+(?:class=["'][^"']*data-header__profile|src=["'][^"']*\/portrait\/)[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1], finalUrl)
    : sourceType === 'besoccer'
      ? normalizeUrl(html.match(/<img[^>]+(?:class=["'][^"']*(?:player|ficha)|src=["'][^"']*(?:jugadores|players))[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1], finalUrl)
      : '';
  const portrait = normalizeUrl(rawPersonImage, finalUrl) || specificPortrait || (person && ogImage);
  if (isSafePortrait(portrait)) addField(fields, 'photoUrl', portrait, person || specificPortrait ? 'high' : 'medium', sourceUrl, person ? 'JSON-LD Person.image' : 'Imagen principal de la ficha individual');
  else if (portrait || ogImage) discarded.push('Imagen descartada porque podría ser un logo, avatar genérico, banner o imagen editorial.');

  const dobEvidence = getVisibleEvidence(pageText, [
    /(?:f\.?\s*nacim\.?\s*\/\s*edad|fecha de nacimiento|date of birth|geburtsdatum)\s*:?\s*([^|·]{4,45})/i,
  ]);
  const dob = normalizeDate(firstValue(person?.birthDate, dobEvidence.value));
  addField(fields, 'dob', dob, person?.birthDate ? 'high' : 'medium', sourceUrl, person?.birthDate ? `JSON-LD birthDate: ${person.birthDate}` : dobEvidence.evidence);

  const ageEvidence = getVisibleEvidence(pageText, [/(?:edad|age|alter)\s*:?\s*(\d{1,2})(?:\s*años?)?/i]);
  const ageFromDobLabel = dobEvidence.value.match(/\((\d{1,2})\)/)?.[1] || '';
  const directAge = Number.parseInt(ageEvidence.value, 10);
  const hasDirectAge = directAge >= 14 && directAge <= 60;
  const age = hasDirectAge ? directAge : Number.parseInt(ageFromDobLabel, 10);
  if (Number.isInteger(age) && age >= 14 && age <= 60) addField(fields, 'age', String(age), 'medium', sourceUrl, hasDirectAge ? ageEvidence.evidence : dobEvidence.evidence);

  const positionEvidence = getVisibleEvidence(pageText, [
    /(?:posición principal|posición|position|position played|spielposition)\s*:?\s*([^|·]{3,65})/i,
  ]);
  const rawPosition = cleanText(firstValue(person?.jobTitle, person?.roleName, positionEvidence.value)).split(/\s+(?:datos del jugador|posición en detalle|posición principal|información y cifras|club actual|fichado)\b/i)[0].trim();
  addField(fields, 'rawPosition', rawPosition, person?.jobTitle ? 'high' : 'medium', sourceUrl, person?.jobTitle ? `JSON-LD jobTitle: ${person.jobTitle}` : positionEvidence.evidence);

  const secondaryEvidence = getVisibleEvidence(pageText, [/(?:otras posiciones|secondary positions|posiciones secundarias)\s*:?\s*([^|·]{3,100})/i]);
  if (secondaryEvidence.value) addField(fields, 'secondaryPositions', secondaryEvidence.value.split(/[,;/]+/).map((item) => item.trim()).filter(Boolean), 'medium', sourceUrl, secondaryEvidence.evidence);

  const heightEvidence = getVisibleEvidence(pageText, [/(?:altura|height|größe)\s*:?\s*([^|·]{2,25})/i]);
  const height = normalizeHeight(firstValue(person?.height, heightEvidence.value));
  addField(fields, 'height', height, person?.height ? 'high' : 'medium', sourceUrl, person?.height ? `JSON-LD height: ${person.height}` : heightEvidence.evidence);

  const footEvidence = getVisibleEvidence(pageText, [/(?:pierna dominante|pie preferido|pie|preferred foot|foot|fuß)\s*:?\s*([^|·]{3,25})/i]);
  const foot = normalizeFoot(footEvidence.value);
  addField(fields, 'foot', foot, 'medium', sourceUrl, footEvidence.evidence);

  const numberEvidence = getVisibleEvidence(pageText, [/(?:dorsal|shirt number|número de camiseta)\s*:?[#\s]*(\d{1,2})/i]);
  const number = Number.parseInt(numberEvidence.value, 10);
  if (Number.isInteger(number) && number >= 0 && number <= 99) addField(fields, 'number', String(number), 'medium', sourceUrl, numberEvidence.evidence);

  const teamEntity = firstValue(person?.affiliation, person?.memberOf, person?.worksFor);
  const teamEvidence = getVisibleEvidence(pageText, [/(?:equipo actual|current club|club actual|verein)\s*:?\s*([^|·]{3,70})/i]);
  const currentTeam = cleanText(valueFromEntity(teamEntity) || teamEvidence.value).split(/\s+(?:fichado|contrato|vídeos?|datos de rendimiento|fecha de nacimiento|f\.?\s*nacim)\b/i)[0].trim();
  addField(fields, 'currentTeam', currentTeam, teamEntity ? 'high' : 'medium', sourceUrl, teamEntity ? 'JSON-LD Person.affiliation/memberOf' : teamEvidence.evidence);

  const nationalityEntity = firstValue(person?.nationality);
  const nationalityEvidence = getVisibleEvidence(pageText, [/(?:nacionalidad|nationality)\s*:?\s*([^|·]{3,45})/i]);
  const nationality = cleanText(valueFromEntity(nationalityEntity) || nationalityEvidence.value).split(/\s+(?:posición|club actual|fichado|contrato|datos del jugador)\b/i)[0].trim();
  addField(fields, 'nationality', nationality, nationalityEntity ? 'high' : 'medium', sourceUrl, nationalityEntity ? 'JSON-LD Person.nationality' : nationalityEvidence.evidence);
  addField(fields, 'canonicalUrl', canonicalUrl, 'high', sourceUrl, 'Enlace canónico declarado por la página');

  const usefulFields = fields.filter((field) => !['canonicalUrl', 'name'].includes(field.field));
  return {
    ok: true,
    status: usefulFields.length ? 'data_found' : 'no_data',
    sourceType,
    pageType,
    canonicalUrl,
    fields,
    discarded,
    structuredData: { jsonLdTypes: jsonLd.map((item) => item['@type']).filter(Boolean), openGraphType: ogType || null, contentType },
  };
};

export const getPlayerSourceType = sourceTypeFromUrl;
