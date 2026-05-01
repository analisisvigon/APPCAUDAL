import { useEffect, useMemo, useRef, useState } from 'react';

const clubCrest =
  'https://tmssl.akamaized.net//images/wappen/head/13226.png?lm=1747769013';

const teamsStorageKey = 'caudal-opponent-teams';
const matchesStorageKey = 'caudal-matches';

const besoccerPlayerImage = (id) =>
  `https://cdn.resfu.com/img_data/players/medium/${id}.jpg?size=120x&lossy=1`;

const samplePlayers = [
  { id: 1, name: 'Pablo Díez', dob: '2002-02-13', number: 1, position: 'Portero', foot: 'Ambas', image: besoccerPlayerImage(993926) },
  { id: 2, name: 'Roberto Jara', dob: '1998-09-10', number: 1, position: 'Portero', foot: 'Derecha', image: '' },
  { id: 3, name: 'Javi Moral', dob: '2005-03-19', number: 13, position: 'Portero', foot: 'No indicada', image: '' },
  { id: 4, name: 'Roberto Albuquerque', dob: '1993-11-04', number: 4, position: 'Defensa central', foot: 'No indicada', image: besoccerPlayerImage(3337542) },
  { id: 5, name: 'Agustín Porto', dob: '1995-03-20', number: 20, position: 'Defensa central', foot: 'No indicada', image: '' },
  { id: 6, name: 'Mario Sánchez', dob: '2004-09-14', number: 5, position: 'Defensa central', foot: 'Derecha', image: besoccerPlayerImage(996212) },
  { id: 7, name: 'Borja Rodríguez', dob: '1998-10-21', number: 19, position: 'Lateral izquierdo', foot: 'No indicada', image: besoccerPlayerImage(190774) },
  { id: 8, name: 'Marcos Trabanco', dob: '2001-02-27', number: 2, position: 'Lateral derecho', foot: 'No indicada', image: besoccerPlayerImage(921989) },
  { id: 9, name: 'Sergio Ordóñez', dob: '2001-01-04', number: 21, position: 'Lateral derecho', foot: 'Derecha', image: besoccerPlayerImage(934311) },
  { id: 10, name: 'Santi Cabrera', dob: '2005-01-01', number: 17, position: 'Lateral derecho', foot: 'No indicada', image: '' },
  { id: 11, name: 'Vicente Antuña', dob: '2005-01-01', number: 6, position: 'Mediocentro', foot: 'No indicada', image: '' },
  { id: 12, name: 'Kike Fanjul', dob: '1993-12-24', number: 8, position: 'Mediocentro', foot: 'Derecha', image: besoccerPlayerImage(192110) },
  { id: 13, name: 'Michael Oladipupo', dob: '2004-03-06', number: 24, position: 'Mediocentro', foot: 'No indicada', image: '' },
  { id: 14, name: 'Iván Elena', dob: '1999-04-27', number: 22, position: 'Mediocentro ofensivo', foot: 'Ambas', image: besoccerPlayerImage(393748) },
  { id: 15, name: 'Julio Delgado', dob: '1996-01-28', number: 18, position: 'Extremo izquierdo', foot: 'No indicada', image: besoccerPlayerImage(232521) },
  { id: 16, name: 'Diego Boza', dob: '2002-08-23', number: 7, position: 'Extremo izquierdo', foot: 'No indicada', image: '' },
  { id: 17, name: 'Nacho Velardi', dob: '1995-01-26', number: 10, position: 'Extremo derecho', foot: 'Izquierda', image: besoccerPlayerImage(414456) },
  { id: 18, name: 'Diego Montequín', dob: '2002-02-05', number: 11, position: 'Extremo derecho', foot: 'Derecha', image: besoccerPlayerImage(951254) },
  { id: 19, name: 'Claudio Medina', dob: '1993-09-04', number: 9, position: 'Delantero centro', foot: 'No indicada', image: besoccerPlayerImage(188741) },
  { id: 20, name: 'Jairo Cárcaba', dob: '1992-05-27', number: 14, position: 'Delantero centro', foot: 'Derecha', image: besoccerPlayerImage(110439) },
];

const positions = [
  'Portero',
  'Lateral derecho',
  'Lateral izquierdo',
  'Defensa central',
  'Central derecho',
  'Central izquierdo',
  'Pivote',
  'Mediocentro',
  'Mediocentro ofensivo',
  'Extremo derecho',
  'Extremo izquierdo',
  'Mediapunta',
  'Delantero centro',
  'Delantero',
];

const footOptions = ['Derecha', 'Izquierda', 'Ambas', 'No indicada'];

const squadGroups = [
  {
    title: 'Porteros',
    positions: ['Portero'],
  },
  {
    title: 'Defensas',
    positions: ['Lateral derecho', 'Lateral izquierdo', 'Defensa central', 'Central derecho', 'Central izquierdo'],
  },
  {
    title: 'Mediocentros',
    positions: ['Pivote', 'Mediocentro', 'Mediocentro ofensivo', 'Mediapunta'],
  },
  {
    title: 'Delanteros',
    positions: ['Extremo derecho', 'Extremo izquierdo', 'Delantero centro', 'Delantero'],
  },
];

const gameSystems = ['4-4-2', '4-2-3-1', '4-3-3', '3-5-2', '3-4-3', '5-3-2', '5-4-1', 'Otro'];
const matchTypes = ['Liga', 'Copa RFEF', 'Play off', 'Amistoso'];
const matchFilters = ['Todos', ...matchTypes];

const emptyMatchForm = {
  date: '',
  time: '',
  type: 'Liga',
  round: '',
  stadium: '',
  opponent: '',
  opponentCrest: '',
  homeTeam: 'C.D. Caudal',
  awayTeam: '',
  isHome: true,
  status: 'Previa',
  homeScore: '',
  awayScore: '',
  goalsFor: '',
  goalsAgainst: '',
  shots: '',
  shotsOnTarget: '',
  possession: '',
  corners: '',
  yellowCards: '',
  redCards: '',
  cleanSheet: false,
  preNotes: '',
  postNotes: '',
  // PRE Partido - Plan de partido
  planConBalon: '',
  planSinBalon: '',
  planTransiciones: '',
  planClave: '',
  planObjetivo: '',
  // PRE Partido - ABP
  abpEnlace: '',
  abpOfensiva: '',
  abpDefensiva: '',
  // PRE Partido - Sistemas enfrentados
  preCanvaLink: '',
  preCaudalSystem: '4-4-2',
  preCaudalLineup: [],
  preRivalSystem: '',
  preRivalLineup: [],
  preAiAnalysis: null,
  // POST Partido
  postVideoLink: '',
  events: [],
  // PRE Partido - Alineación rival específica
  rivalLineupSystem: '',
  rivalLineupPlayers: [],
};

const emptyTeamForm = {
  name: '',
  sourceUrl: '',
  crest: '',
  stadium: '',
  kitColor: '#ef233c',
  system: '4-4-2',
  squad: [],
};

const emptyLineup = [];
const emptyDepthChart = {};

const lineYPositions = (count) => {
  const presets = {
    1: [50],
    2: [34, 66],
    3: [24, 50, 76],
    4: [18, 39, 61, 82],
    5: [13, 32, 50, 68, 87],
  };
  return presets[count] ?? presets[4];
};

const lineXPositions = (count) => {
  const presets = {
    1: [50],
    2: [34, 66],
    3: [24, 50, 76],
    4: [18, 39, 61, 82],
    5: [13, 32, 50, 68, 87],
  };
  return presets[count] ?? presets[4];
};

const getFormationCoordinates = (system) => {
  const linesBySystem = {
    '4-4-2': [4, 4, 2],
    '4-2-3-1': [4, 2, 3, 1],
    '4-3-3': [4, 3, 3],
    '3-5-2': [3, 5, 2],
    '3-4-3': [3, 4, 3],
    '5-3-2': [5, 3, 2],
    '5-4-1': [5, 4, 1],
  };
  const lines = linesBySystem[system] ?? linesBySystem['4-4-2'];
  const yByLineCount = {
    3: [71, 45, 16],
    4: [73, 53, 33, 14],
  };
  const yPositions = yByLineCount[lines.length] ?? [76, 52, 23];
  const coordinates = [{ x: 50, y: 89 }];

  lines.forEach((count, lineIndex) => {
    lineXPositions(count).forEach((x) => coordinates.push({ x, y: yPositions[lineIndex] }));
  });

  return coordinates.slice(0, 11);
};

const getLineupSlotMap = (lineup) => {
  const usedSlots = new Map();
  lineup.forEach((player) => {
    if (Number.isInteger(player.slot)) usedSlots.set(player.slot, player);
  });
  return usedSlots;
};

const getPlayerMeta = (player) => [player.position, player.age ? `${player.age} años` : ''].filter(Boolean).join(' · ');
const displayPlayerName = (player) => player.name;
const playerReservePlacement = (player) => {
  return 'below';
};
const playerStatusBadges = (player) =>
  [
    player.yellowRisk ? { label: 'A', className: 'bg-yellow-300 text-slate-950', title: 'Acumulación de amarillas' } : null,
    player.suspended ? { label: 'R', className: 'bg-red-500 text-white', title: 'Expulsado o sancionado' } : null,
    player.injured ? { label: '+', className: 'bg-white text-red-600', title: 'Lesionado' } : null,
  ].filter(Boolean);

const getBenchGroups = (squad) =>
  squad
    .map(normalizeSquadEntry)
    .filter((player) => player.role !== 'Titular')
    .reduce((groups, player) => {
      const position = player.position || 'Sin posición';
      return { ...groups, [position]: [...(groups[position] ?? []), player] };
    }, {});

const getBenchForStarter = (starter, benchChart = emptyDepthChart) => {
  const assignedBench = (benchChart[starter.name] ?? []).filter(Boolean).map(normalizeSquadEntry);
  return assignedBench.slice(0, 3);
};

const normalizeSquadEntry = (entry) => {
  if (typeof entry === 'string') {
    return {
      id: entry,
      name: entry,
      image: '',
      number: '',
      position: '',
      age: '',
      role: 'Reserva',
      isKey: false,
      yellowRisk: false,
      suspended: false,
      injured: false,
    };
  }

  const name = entry.name ?? '';
  return {
    id: entry.id ?? name,
    name,
    image: entry.image ?? '',
    number: entry.number ?? '',
    position: entry.position ?? '',
    age: entry.age ?? '',
    role: entry.role ?? 'Reserva',
    isKey: Boolean(entry.isKey),
    yellowRisk: Boolean(entry.yellowRisk),
    suspended: Boolean(entry.suspended),
    injured: Boolean(entry.injured),
  };
};

const parseSquadText = (value) =>
  value
    .split('\n')
    .map((line) => {
      const [name, image = '', number = '', position = '', age = '', role = 'Reserva', keyValue = ''] = line.split('|').map((part) => part.trim());
      return name ? { id: name, name, image, number, position, age, role: role || 'Reserva', isKey: /destacado|clave|si|sí|true/i.test(keyValue) } : null;
    })
    .filter(Boolean);

const formatSquadText = (squad) =>
  squad
    .map(normalizeSquadEntry)
    .map((player) =>
      [player.name, player.image, player.number, player.position, player.age, player.role, player.isKey ? 'Destacado' : ''].filter(Boolean).join(' | ')
    )
    .join('\n');

const createBlankTeamPlayer = () => ({
  id: `manual-${Date.now()}`,
  name: '',
  image: '',
  number: '',
  position: '',
  age: '',
  role: 'Reserva',
  isKey: false,
  yellowRisk: false,
  suspended: false,
  injured: false,
});

const normalizeMatch = (match) => ({
  ...emptyMatchForm,
  ...match,
  id: match.id ?? Date.now(),
});

const cleanTeamDisplayName = (name) => name.replace(/^Plantilla\s+/i, '').trim();

const getMatchResult = (match) => {
  if (match.status !== 'Finalizado') return null;
  const caudalGoals = Number(match.isHome ? match.homeScore : match.awayScore);
  const rivalGoals = Number(match.isHome ? match.awayScore : match.homeScore);
  if (Number.isNaN(caudalGoals) || Number.isNaN(rivalGoals)) return null;
  if (caudalGoals > rivalGoals) return 'W';
  if (caudalGoals < rivalGoals) return 'L';
  return 'D';
};

const matchDisplayDate = (date) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  return day && month && year ? `${day}/${month}/${year}` : date;
};

const extractImportedPlayers = (text) => {
  const ignored = new Set([
    'jugador',
    'jugadores',
    'plantilla',
    'equipo',
    'posición',
    'nacionalidad',
    'edad',
    'altura',
    'peso',
    'valor de mercado',
  ]);

  return Array.from(
    new Set(
      text
        .split('\n')
        .map((line) =>
          line
            .replace(/\[|\]|\*|#/g, '')
            .replace(/Image:\s*/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
        )
        .filter((line) => {
          const lower = line.toLowerCase();
          return (
            line.length >= 5 &&
            line.length <= 45 &&
            /[a-záéíóúñü]/i.test(line) &&
            !ignored.has(lower) &&
            !lower.includes('http') &&
            !lower.includes('temporada') &&
            !lower.includes('copyright') &&
            !/^\d/.test(line)
          );
        })
        .slice(0, 35)
    )
  ).map((name) => ({ name, image: '' }));
};

const normalizeSourceUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getReadableUrls = (sourceUrl) => {
  const normalized = normalizeSourceUrl(sourceUrl);
  const noProtocol = normalized.replace(/^https?:\/\//i, '');

  return [
    normalized,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`,
    `https://r.jina.ai/${normalized}`,
    `https://r.jina.ai/http://${noProtocol}`,
  ];
};

const extractTeamName = (doc, fallback) => {
  const heading = doc.querySelector('h1')?.textContent?.trim();
  const title = doc.querySelector('meta[property="og:title"]')?.content || doc.title;
  return heading || title?.replace(/\s*[-|].*$/, '').trim() || fallback;
};

const resolveAssetUrl = (value, baseUrl) => {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
};

const getImageSource = (img, baseUrl) =>
  resolveAssetUrl(
    img?.getAttribute('data-src') ||
      img?.getAttribute('data-original') ||
      img?.getAttribute('data-lazy') ||
      img?.getAttribute('src') ||
      '',
    baseUrl
  );

const isTransfermarktUrl = (url) => /transfermarkt\./i.test(url);
const isBesoccerUrl = (url) => /besoccer\./i.test(url);

const extractCrest = (doc, baseUrl) => {
  const raw = doc.documentElement?.outerHTML ?? '';

  if (isBesoccerUrl(baseUrl)) {
    const besoccerCrest = raw.match(/https?:\/\/[^"'\s)]+(?:img_data\/escudos|media\/img_data\/escudos|img_data\/equipos|media\/img_data\/equipos|\/escudos\/)[^"'\s)]*/i)?.[0];
    if (besoccerCrest) return besoccerCrest.replace(/&amp;/g, '&');

    const teamName = extractTeamName(doc, '');
    const crest =
      Array.from(doc.querySelectorAll('img')).find((img) => {
        const alt = img.alt?.trim() ?? '';
        const src = img.getAttribute('src') ?? '';
        return alt === teamName || /img_data\/escudos|img_data\/equipos|\/escudos\/|shield|team/i.test(src);
      }) ||
      Array.from(doc.querySelectorAll('img')).find((img) => /escudo|equipo|club|team/i.test(`${img.alt} ${img.src}`));
    const crestUrl = getImageSource(crest, baseUrl);
    if (crestUrl && !/flags|avatar|besoccertv|apuestas/i.test(crestUrl)) return crestUrl;
  }

  if (isTransfermarktUrl(baseUrl)) {
    const crest =
      doc.querySelector('.data-header__profile-container img') ||
      doc.querySelector('.data-header__profile-image') ||
      doc.querySelector('header img[alt]') ||
      Array.from(doc.querySelectorAll('img')).find((img) =>
        /wappen|logo|verein|club|data-header/i.test(`${img.className} ${img.src}`)
      );
    const crestUrl = getImageSource(crest, baseUrl);
    if (crestUrl && !/tm_logo|transfermarkt/i.test(crestUrl)) return crestUrl;
  }

  const metaImage = doc.querySelector('meta[property="og:image"]')?.content;
  const crestImage = Array.from(doc.querySelectorAll('img')).find((img) =>
    /escudo|crest|wappen|logo|equipo|team/i.test(`${img.alt} ${img.src}`)
  );
  return getImageSource(crestImage, baseUrl) || resolveAssetUrl(metaImage || '', baseUrl);
};

const extractTransfermarktPlayers = (doc, baseUrl) => {
  const byName = new Map();
  const rows = Array.from(doc.querySelectorAll('table.items tbody tr'));

  rows.forEach((row) => {
    const nameLink =
      row.querySelector('td.hauptlink a[href*="/profil/spieler/"]') ||
      row.querySelector('td.hauptlink a[href*="/spieler/"]') ||
      row.querySelector('td.hauptlink a');
    const portrait = row.querySelector('img.bilderrahmen-fixed, img[src*="/portrait/"], img[data-src*="/portrait/"]');
    const name = (nameLink?.textContent || portrait?.alt || '').replace(/\s+/g, ' ').trim();
    const image = getImageSource(portrait, baseUrl);
    const number = row.querySelector('.rn_nummer')?.textContent?.replace(/\D/g, '') ?? '';
    const position =
      row.querySelector('td.posrela table tr:nth-child(2) td')?.textContent?.replace(/\s+/g, ' ').trim() ||
      row.querySelector('td:nth-child(2) table tr:nth-child(2) td')?.textContent?.replace(/\s+/g, ' ').trim() ||
      '';

    if (
      name &&
      name.length > 2 &&
      name.length < 45 &&
      !/transfermarkt|laliga|bundesliga|premier|segunda|serie|ligue|deadline|club siero/i.test(name)
    ) {
      byName.set(name, { id: name, name, image, number, position, role: 'Reserva', isKey: false });
    }
  });

  return Array.from(byName.values());
};

const extractBesoccerPlayers = (doc, baseUrl) => {
  const byName = new Map();
  const squadScope =
    doc.querySelector('table') ||
    doc.querySelector('[class*="squad"]') ||
    doc.querySelector('[class*="plantilla"]') ||
    doc.body;
  const playerLinks = Array.from(squadScope.querySelectorAll('a[href*="/jugador/"]'));

  playerLinks.forEach((link) => {
    const name = link.textContent?.replace(/\s+/g, ' ').trim();
    const image = getImageSource(link.querySelector('img') || link.closest('tr')?.querySelector('img'), baseUrl);
    if (name && name.length > 2 && name.length < 45 && !/más|comparar|partidos|trayectoria/i.test(name)) {
      byName.set(name, { id: name, name, image, number: '', position: '', role: 'Reserva', isKey: false });
    }
  });

  return Array.from(byName.values());
};

const cleanImportedName = (value) =>
  value
    .replace(/【\d+†([^】]+)】/g, '$1')
    .replace(/\[|\]|\*|#/g, '')
    .replace(/Image:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const isLikelyPlayerName = (value) => {
  const lower = value.toLowerCase();
  return (
    value.length >= 3 &&
    value.length <= 45 &&
    /[a-záéíóúñü]/i.test(value) &&
    !/plantilla|porteros|defensas|centrocampistas|delanteros|rendimiento|info|totales|edad|rating|temporada|image:|pj|pt|cm|€|seleccionar|copyright|jugadores destacados|máximo goleador|más sancionado|minutos/i.test(lower) &&
    !/^\d+$/.test(value) &&
    !/^\d+\s*(k|m)?\.?€?$/i.test(value)
  );
};

const extractBesoccerPlayersFromText = (text) => {
  const start = text.search(/#\s*Plantilla|##\s*Plantilla|Plantilla\s+.+\s*\|/i);
  const scoped = start >= 0 ? text.slice(start) : text;
  const end = scoped.search(/\n##\s*(Jugadores destacados|Temporada|Últimos|Noticias|Estadio|Fichajes)|Copyright/i);
  const rosterText = end > 0 ? scoped.slice(0, end) : scoped;
  const byName = new Map();
  let currentPosition = '';
  const positionLabels = {
    Desconocido: '',
    Porteros: 'Portero',
    Defensas: 'Defensa central',
    Centrocampistas: 'Mediocentro',
    Delanteros: 'Delantero centro',
  };

  rosterText.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    const indexedMatch = line.match(
      /^(\d{1,2})?\s*(?:【\d+†\s*】\s*)?【\d+†([^】]+)】.*?(?:Image:\s*[a-z]{2}).*?\s(\d{2}|-)\s(?:\d{2,3}|-)\s(?:[\d.,]+K|-)\s+\d+/i
    );
    if (indexedMatch) {
      const [, number = '', rawName, rawAge = ''] = indexedMatch;
      const name = cleanImportedName(rawName);
      if (isLikelyPlayerName(name)) {
        byName.set(name, {
          id: name,
          name,
          image: '',
          number,
          position: currentPosition,
          age: rawAge === '-' ? '' : rawAge,
          role: 'Reserva',
          isKey: false,
        });
      }
      return;
    }

    if (/^(Desconocido|Porteros|Defensas|Centrocampistas|Delanteros)\s*\|/i.test(line)) {
      const groupName = line.split('|')[0].trim();
      currentPosition = positionLabels[groupName] ?? groupName;
    }
    if (!line.includes('|') || !/Image:| \| \| /i.test(line)) return;
    if (/---|PJ\s*\||PT\s*\||Edad|rating|Temp/i.test(line)) return;

    const cells = line.split('|').map(cleanImportedName).filter(Boolean);
    const number = cells.find((cell) => /^\d{1,2}$/.test(cell)) ?? '';
    const nameCell = cells.find((cell, index) => {
      const previous = cells[index - 1] ?? '';
      return isLikelyPlayerName(cell) && !/^([a-z]{2}|ES|AR|VE|TR|NO)$/i.test(cell) && !isLikelyPlayerName(previous);
    });

    const fallbackName = cells.find(isLikelyPlayerName);
    const name = nameCell || fallbackName;
    const imageIndex = cells.findIndex((cell) => /^Image:/i.test(cell));
    const possibleAge = cells
      .slice(Math.max(imageIndex + 6, 0))
      .find((cell) => /^\d{2}$/.test(cell) && Number(cell) >= 15 && Number(cell) <= 45);
    if (name) byName.set(name, { id: name, name, image: '', number, position: currentPosition, age: possibleAge ?? '', role: 'Reserva', isKey: false });
  });

  return Array.from(byName.values());
};

const extractPlayersFromHtml = (html, baseUrl) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const transfermarktPlayers = isTransfermarktUrl(baseUrl) ? extractTransfermarktPlayers(doc, baseUrl) : [];
  if (transfermarktPlayers.length > 0) return { doc, players: transfermarktPlayers };
  if (isTransfermarktUrl(baseUrl)) return { doc, players: [] };

  const besoccerTextPlayers = isBesoccerUrl(baseUrl) ? extractBesoccerPlayersFromText(doc.body.textContent || html) : [];
  if (besoccerTextPlayers.length > 0) return { doc, players: besoccerTextPlayers };

  const besoccerPlayers = isBesoccerUrl(baseUrl) ? extractBesoccerPlayers(doc, baseUrl) : [];
  if (besoccerPlayers.length > 0) return { doc, players: besoccerPlayers };
  if (isBesoccerUrl(baseUrl)) return { doc, players: [] };

  const candidates = Array.from(doc.querySelectorAll('img'))
    .map((img) => ({
      name: img.alt?.replace(/^Image:\s*/i, '').trim(),
      image: getImageSource(img, baseUrl),
    }))
    .filter((player) => player.name && player.name.length > 3 && player.name.length < 45);

  const byName = new Map();
  candidates.forEach((player) => {
    if (!/escudo|logo|flag|bandera|apuestas|avatar|logout|laliga|bundesliga|premier|segunda|serie|ligue|transfermarkt|deadline|banner/i.test(player.name)) {
      byName.set(player.name, player);
    }
  });

  return {
    doc,
    players: byName.size > 0 ? Array.from(byName.values()).slice(0, 35) : extractImportedPlayers(doc.body.textContent ?? ''),
  };
};

const calculateAge = (dob) => {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  const dayDiff = now.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years;
};

const playerLabel = (dob) => (calculateAge(dob) < 23 ? 'Sub-23' : 'Senior');

const displayDorsal = (number) => (number ? number : '-');

function App() {
  const [activeTab, setActiveTab] = useState('Inicio');
  const [players, setPlayers] = useState(samplePlayers);
  const [teams, setTeams] = useState(() => {
    try {
      const savedTeams = window.localStorage.getItem(teamsStorageKey);
      return savedTeams ? JSON.parse(savedTeams) : [];
    } catch {
      return [];
    }
  });
  const [matches, setMatches] = useState(() => {
    try {
      const savedMatches = window.localStorage.getItem(matchesStorageKey);
      return savedMatches ? JSON.parse(savedMatches).map(normalizeMatch) : [];
    } catch {
      return [];
    }
  });
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isMatchPanelOpen, setIsMatchPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [matchFilter, setMatchFilter] = useState('Todos');
  const [matchSections, setMatchSections] = useState({});
  const [matchView, setMatchView] = useState('lista_partidos');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [matchViewSection, setMatchViewSection] = useState('PRE');
  const [preSubTab, setPreSubTab] = useState('Informe rival');
  const [eventTypes, setEventTypes] = useState(['Gol favor', 'Gol rival', 'Ocasión', 'Recuperación', 'Pérdida', 'Tarjeta']);
  const [selectedEventType, setSelectedEventType] = useState('Gol favor');
  const [newEventDraft, setNewEventDraft] = useState({ minute: '', type: 'Gol favor', description: '', player: '' });
  const [formState, setFormState] = useState({
    name: '',
    dob: '',
    number: '',
    position: 'Portero',
    foot: 'Derecha',
    image: '',
  });
  const [teamFormState, setTeamFormState] = useState(emptyTeamForm);
  const [matchFormState, setMatchFormState] = useState(emptyMatchForm);
  const [matchFormSection, setMatchFormSection] = useState('PRE');
  const preSectionRef = useRef(null);
  const postSectionRef = useRef(null);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams]
  );

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [selectedMatchId, matches]
  );

  const updateSelectedMatchFields = (fields) => {
    if (!selectedMatch) return;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, ...fields } : match)));
  };

  const parseLineupText = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  const formatLineupText = (lineup) => (lineup || []).join('\n');
  const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const eventButtonClass = (type) => {
    switch (type) {
      case 'Gol favor':
        return 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30';
      case 'Gol rival':
        return 'bg-red-500/20 text-red-300 hover:bg-red-500/30';
      case 'Ocasión':
        return 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30';
      case 'Recuperación':
        return 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30';
      case 'Pérdida':
        return 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30';
      case 'Tarjeta':
        return 'bg-amber-700/20 text-amber-200 hover:bg-amber-700/30';
      default:
        return 'bg-white/10 text-slate-200 hover:bg-white/15';
    }
  };

  const getRivalBaseTeam = () => {
    if (!selectedMatch?.opponent) return null;
    return teams.find((team) => cleanTeamDisplayName(team.name) === cleanTeamDisplayName(selectedMatch.opponent)) ?? null;
  };

  const getCurrentRivalLineup = () => {
    if (selectedMatch?.preRivalLineup?.length) return selectedMatch.preRivalLineup;
    if (selectedMatch?.rivalLineupPlayers?.length) return selectedMatch.rivalLineupPlayers.map((player) => player.name);
    return [];
  };

  const getCurrentRivalSystem = () => selectedMatch?.preRivalSystem || selectedMatch?.rivalLineupSystem || '4-4-2';

  const runAiAnalysis = () => {
    if (!selectedMatch) return;
    updateSelectedMatchFields({
      preAiAnalysis: {
        advantages: 'Superioridad en bandas con movilidad y apoyos laterales.',
        risks: 'Vulnerable a contraataques entre líneas y pases filtrados detrás de los mediocentros.',
        progress: 'Avanzar por el centro tras rotación de los mediocentros y apoyos exteriores.',
        pressure: 'Presionar al rival en la salida desde atrás y forzar pérdidas en zona de medios.',
        keyMatchups: 'El pivote rival contra nuestro mediocentro más creativo y los laterales en los flancos.',
        recommendedPlan: 'Jugar con transiciones rápidas, apoyar la segunda jugada y cerrar el espacio por dentro.',
      },
    });
  };

  const handleEventDraftChange = (field, value) => {
    setNewEventDraft((prev) => ({ ...prev, [field]: value }));
  };

  const addNewEvent = () => {
    if (!selectedMatch) return;
    if (!newEventDraft.minute || !newEventDraft.description) return;
    const nextEvent = {
      id: Date.now(),
      minute: newEventDraft.minute,
      type: newEventDraft.type,
      description: newEventDraft.description,
      player: newEventDraft.player,
    };
    updateSelectedMatchFields({ events: [...(selectedMatch.events || []), nextEvent] });
    setNewEventDraft({ minute: '', type: selectedEventType, description: '', player: '' });
  };

  useEffect(() => {
    if (activeTab !== 'Partidos') {
      setMatchView('lista_partidos');
      setSelectedMatchId(null);
      setMatchViewSection('PRE');
    }
  }, [activeTab]);

  const openMatchPage = (match, section) => {
    setSelectedMatchId(match.id);
    setMatchView(section === 'PRE' ? 'pre_partido' : section === 'ESTADÍSTICAS' ? 'estadisticas_partido' : 'post_partido');
    setMatchViewSection(section);
    if (section === 'PRE') {
      setPreSubTab('Informe rival');
    }
  };

  const closeMatchPage = () => {
    setMatchView('lista_partidos');
    setSelectedMatchId(null);
    setMatchViewSection('PRE');
  };

  useEffect(() => {
    if (!isMatchPanelOpen) return;
    if (matchFormSection === 'PRE' && preSectionRef.current) {
      preSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (matchFormSection === 'POST' && postSectionRef.current) {
      postSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isMatchPanelOpen, matchFormSection]);

  const groupedPlayers = useMemo(
    () =>
      squadGroups.map((group) => ({
        ...group,
        players: players.filter((player) => group.positions.includes(player.position)),
      })),
    [players]
  );

  const filteredMatches = useMemo(
    () => (matchFilter === 'Todos' ? matches : matches.filter((match) => match.type === matchFilter)),
    [matchFilter, matches]
  );

  const matchStats = useMemo(() => {
    const finished = matches.filter((match) => match.status === 'Finalizado');
    const wins = finished.filter((match) => getMatchResult(match) === 'W').length;
    const goalsFor = finished.reduce((sum, match) => sum + (Number(match.goalsFor) || Number(match.isHome ? match.homeScore : match.awayScore) || 0), 0);
    const goalsAgainst = finished.reduce((sum, match) => sum + (Number(match.goalsAgainst) || Number(match.isHome ? match.awayScore : match.homeScore) || 0), 0);
    const cleanSheets = finished.filter((match) => match.cleanSheet || Number(match.goalsAgainst) === 0).length;
    const recent = finished.slice(-3).map(getMatchResult).filter(Boolean);

    return { finished: finished.length, wins, goalsFor, goalsAgainst, cleanSheets, recent };
  }, [matches]);

  const openForm = (player = null) => {
    if (player) {
      setEditingId(player.id);
      setFormState({
        name: player.name,
        dob: player.dob,
        number: player.number,
        position: player.position,
        foot: player.foot,
        image: player.image,
      });
    } else {
      setEditingId(null);
      setFormState({
        name: '',
        dob: '',
        number: '',
        position: 'Portero',
        foot: 'Derecha',
        image: '',
      });
    }
    setIsPanelOpen(true);
  };

  const closeForm = () => {
    setIsPanelOpen(false);
    setEditingId(null);
  };

  const openTeamForm = (team = null) => {
    if (team) {
      setEditingTeamId(team.id);
      setTeamFormState({
        name: team.name,
        sourceUrl: team.sourceUrl ?? '',
        crest: team.crest ?? '',
        stadium: team.stadium ?? '',
        kitColor: team.kitColor ?? '#ef233c',
        system: team.system,
        squad: team.squad.map(normalizeSquadEntry),
      });
    } else {
      setEditingTeamId(null);
      setTeamFormState(emptyTeamForm);
    }
    setImportStatus('');
    setIsTeamPanelOpen(true);
  };

  const closeTeamForm = () => {
    setIsTeamPanelOpen(false);
    setEditingTeamId(null);
    setImportStatus('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamChange = (event) => {
    const { name, value } = event.target;
    setTeamFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamPlayerChange = (index, field, value) => {
    setTeamFormState((prev) => ({
      ...prev,
      squad: prev.squad.map((player, playerIndex) =>
        playerIndex === index ? { ...normalizeSquadEntry(player), [field]: value } : normalizeSquadEntry(player)
      ),
    }));
  };

  const handleSelectedTeamPlayerChange = (playerName, field, value) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const updatePlayer = (entry) => {
          const player = normalizeSquadEntry(entry);
          return player.name === playerName ? { ...player, [field]: value } : player;
        };

        return {
          ...team,
          squad: team.squad.map(updatePlayer),
          lineup: (team.lineup ?? emptyLineup).map(updatePlayer),
          benchChart: Object.fromEntries(
            Object.entries(team.benchChart ?? emptyDepthChart).map(([starterName, slots]) => [
              starterName,
              slots.map((entry) => (entry ? updatePlayer(entry) : entry)),
            ])
          ),
        };
      })
    );
  };

  const handleAddTeamPlayer = () => {
    setTeamFormState((prev) => ({ ...prev, squad: [...prev.squad.map(normalizeSquadEntry), createBlankTeamPlayer()] }));
  };

  const handleRemoveTeamPlayer = (index) => {
    setTeamFormState((prev) => ({ ...prev, squad: prev.squad.filter((_, playerIndex) => playerIndex !== index) }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      id: editingId ?? Date.now(),
      name: formState.name.trim() || 'Jugador sin nombre',
      dob: formState.dob,
      number: Number(formState.number) || 0,
      position: formState.position,
      foot: formState.foot,
      image: formState.image.trim(),
    };

    if (editingId) {
      setPlayers((current) => current.map((player) => (player.id === editingId ? payload : player)));
    } else {
      setPlayers((current) => [payload, ...current]);
    }
    closeForm();
  };

  const handleDelete = (player) => {
    const confirmed = window.confirm(`¿Eliminar a ${player.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setPlayers((current) => current.filter((item) => item.id !== player.id));
  };

  const importTeamFromSource = async (sourceUrl) => {
    let imported = null;
    let lastError = null;

    for (const url of getReadableUrls(sourceUrl)) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('No se pudo leer el enlace.');
        const text = await response.text();
        const { doc, players } = extractPlayersFromHtml(text, sourceUrl);
        if (players.length === 0) throw new Error('No se detectaron jugadores.');
        imported = {
          name: extractTeamName(doc, teamFormState.name),
          crest: extractCrest(doc, sourceUrl),
          players,
        };
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!imported) throw lastError ?? new Error('No se pudo importar.');
    return imported;
  };

  const handleTeamSubmit = async (event) => {
    event.preventDefault();
    let squad = teamFormState.squad.map(normalizeSquadEntry).filter((player) => player.name.trim());
    let importedData = null;

    if (squad.length === 0 && teamFormState.sourceUrl.trim()) {
      setImportStatus('Importando plantilla...');
      try {
        importedData = await importTeamFromSource(normalizeSourceUrl(teamFormState.sourceUrl));
        squad = importedData.players;
      } catch (error) {
        setImportStatus('No pude importar ese enlace. Pega la plantilla manualmente o prueba otro enlace de plantilla.');
        return;
      }
    }

    const payload = {
      id: editingTeamId ?? Date.now(),
      name: cleanTeamDisplayName(teamFormState.name.trim() || importedData?.name || 'Equipo sin nombre'),
      crest: importedData?.crest || teamFormState.crest || teams.find((team) => team.id === editingTeamId)?.crest || '',
      stadium: teamFormState.stadium.trim(),
      kitColor: teamFormState.kitColor || '#ef233c',
      sourceUrl: normalizeSourceUrl(teamFormState.sourceUrl),
      system: teamFormState.system,
      squad,
      lineup: teams.find((team) => team.id === editingTeamId)?.lineup ?? emptyLineup,
      benchChart: teams.find((team) => team.id === editingTeamId)?.benchChart ?? emptyDepthChart,
    };

    if (editingTeamId) {
      setTeams((current) => current.map((team) => (team.id === editingTeamId ? payload : team)));
    } else {
      setTeams((current) => [payload, ...current]);
    }
    closeTeamForm();
  };

  const handleTeamDelete = (team) => {
    const confirmed = window.confirm(`¿Eliminar a ${team.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setTeams((current) => current.filter((item) => item.id !== team.id));
    if (selectedTeamId === team.id) setSelectedTeamId(null);
  };

  const handleSaveTeams = () => {
    try {
      window.localStorage.setItem(teamsStorageKey, JSON.stringify(teams));
      setSaveStatus('Equipos guardados.');
    } catch {
      setSaveStatus('No se pudieron guardar los equipos.');
    }
  };

  const openMatchForm = (match = null, section = 'PRE') => {
    if (match) {
      setEditingMatchId(match.id);
      setMatchFormState(normalizeMatch(match));
    } else {
      setEditingMatchId(null);
      setMatchFormState(emptyMatchForm);
    }
    setMatchFormSection(section);
    setIsMatchPanelOpen(true);
  };

  const closeMatchForm = () => {
    setIsMatchPanelOpen(false);
    setEditingMatchId(null);
  };

  const handleMatchChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name === 'opponent') {
      const selectedTeam = teams.find((team) => cleanTeamDisplayName(team.name) === cleanTeamDisplayName(value));
      setMatchFormState((prev) => ({
        ...prev,
        opponent: cleanTeamDisplayName(value),
        opponentCrest: selectedTeam?.crest ?? prev.opponentCrest,
      }));
      return;
    }
    setMatchFormState((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMatchSubmit = (event) => {
    event.preventDefault();
    const payload = normalizeMatch({
      ...matchFormState,
      id: editingMatchId ?? Date.now(),
      awayTeam: matchFormState.isHome ? matchFormState.opponent : 'C.D. Caudal',
      homeTeam: matchFormState.isHome ? 'C.D. Caudal' : matchFormState.opponent,
    });

    if (editingMatchId) {
      setMatches((current) => current.map((match) => (match.id === editingMatchId ? payload : match)));
    } else {
      setMatches((current) => [payload, ...current]);
    }
    closeMatchForm();
  };

  const handleMatchDelete = (match) => {
    const confirmed = window.confirm(`¿Eliminar el partido contra ${match.opponent}?`);
    if (!confirmed) return;
    setMatches((current) => current.filter((item) => item.id !== match.id));
  };

  const handleSaveMatches = () => {
    try {
      window.localStorage.setItem(matchesStorageKey, JSON.stringify(matches));
      setSaveStatus('Partidos guardados.');
    } catch {
      setSaveStatus('No se pudieron guardar los partidos.');
    }
  };

  const handleImportSquad = async () => {
    const sourceUrl = normalizeSourceUrl(teamFormState.sourceUrl);
    if (!sourceUrl) {
      setImportStatus('Añade un enlace de BeSoccer o Transfermarkt para importar.');
      return;
    }

    setImportStatus('Importando plantilla...');
    try {
      const imported = await importTeamFromSource(sourceUrl);

      setTeamFormState((prev) => ({
        ...prev,
        name: cleanTeamDisplayName(imported.name || prev.name),
        sourceUrl,
        crest: imported.crest || prev.crest,
        squad: imported.players.map(normalizeSquadEntry),
      }));

      if (editingTeamId) {
        setTeams((current) =>
          current.map((team) => (team.id === editingTeamId ? { ...team, crest: imported.crest || team.crest } : team))
        );
      }

      setImportStatus(`Plantilla importada: ${imported.players.length} jugadores detectados.`);
    } catch (error) {
      setImportStatus('No pude importar ese enlace porque la web bloquea la lectura automática. Prueba con el enlace de plantilla exacto o pega la plantilla.');
    }
  };

  const updateTeamLineup = (teamId, updater) => {
    setTeams((current) =>
      current.map((team) => (team.id === teamId ? { ...team, lineup: updater(team.lineup ?? emptyLineup) } : team))
    );
  };

  const handleDropOnField = (event) => {
    event.preventDefault();
    if (!selectedTeam || !draggedPlayer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(4, Math.min(88, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((event.clientY - rect.top) / rect.height) * 100));

    updateTeamLineup(selectedTeam.id, (lineup) => {
      const playerName = draggedPlayer.name;
      const existing = lineup.find((item) => item.name === playerName);
      if (existing) {
        return lineup.map((item) => (item.name === playerName ? { ...item, x, y } : item));
      }
      return [...lineup.filter((item) => item.name !== playerName), { ...normalizeSquadEntry(draggedPlayer), role: 'Titular', x, y }];
    });
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === draggedPlayer.name ? { ...player, role: 'Titular' } : player;
              }),
            }
          : team
      )
    );
    setDraggedPlayer(null);
  };

  const removeFromLineup = (playerName) => {
    if (!selectedTeam) return;
    updateTeamLineup(selectedTeam.id, (lineup) => lineup.filter((item) => item.name !== playerName));
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === playerName ? { ...player, role: 'Reserva' } : player;
              }),
            }
          : team
      )
    );
  };

  const arrangeSelectedTeam = () => {
    if (!selectedTeam) return;
    const squad = selectedTeam.squad.map(normalizeSquadEntry);
    const starters = squad.filter((player) => player.role === 'Titular');
    const prioritized = starters.length > 0 ? starters : squad.slice(0, 11);
    const fieldCoordinates = getFormationCoordinates(selectedTeam.system);
    const lineup = prioritized.slice(0, 11).map((player, index) => ({ ...player, role: 'Titular', slot: index, ...fieldCoordinates[index] }));

    updateTeamLineup(selectedTeam.id, () => lineup);
  };

  const handleDropOnLineupSlot = (slotIndex) => {
    if (!selectedTeam || !draggedPlayer) return;
    const coordinates = getFormationCoordinates(selectedTeam.system)[slotIndex];
    const droppedPlayer = { ...normalizeSquadEntry(draggedPlayer), role: 'Titular', slot: slotIndex, ...coordinates };

    updateTeamLineup(selectedTeam.id, (lineup) => [
      ...lineup.filter((player) => player.name !== droppedPlayer.name && player.slot !== slotIndex),
      droppedPlayer,
    ]);
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === droppedPlayer.name ? { ...player, role: 'Titular' } : player;
              }),
            }
          : team
      )
    );
    setDraggedPlayer(null);
  };

  const updateSelectedTeamSystem = (system) => {
    if (!selectedTeam) return;
    const coordinates = getFormationCoordinates(system);
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              system,
              lineup: (team.lineup ?? emptyLineup)
                .slice(0, 11)
                .map((player, index) => ({ ...player, slot: player.slot ?? index, ...coordinates[player.slot ?? index] })),
            }
          : team
      )
    );
  };

  const setSelectedTeamPlayerRole = (playerName, role) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === playerName ? { ...player, role } : player;
              }),
              lineup: role === 'Reserva' ? (team.lineup ?? emptyLineup).filter((player) => player.name !== playerName) : team.lineup,
            }
          : team
      )
    );
  };

  const toggleSelectedTeamKeyPlayer = (playerName) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const currentPlayer = team.squad.map(normalizeSquadEntry).find((player) => player.name === playerName);
        const nextIsKey = !currentPlayer?.isKey;

        return {
          ...team,
          squad: team.squad.map((entry) => {
            const player = normalizeSquadEntry(entry);
            return player.name === playerName ? { ...player, isKey: nextIsKey } : player;
          }),
          lineup: (team.lineup ?? emptyLineup).map((player) =>
            player.name === playerName ? { ...player, isKey: nextIsKey } : player
          ),
        };
      })
    );
  };

  const handleDropOnBenchSlot = (starterName, slotIndex) => {
    if (!selectedTeam || !draggedPlayer) return;
    const droppedPlayer = { ...normalizeSquadEntry(draggedPlayer), role: 'Reserva' };

    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const nextBenchChart = Object.fromEntries(
          Object.entries(team.benchChart ?? emptyDepthChart).map(([chartStarter, slots]) => [
            chartStarter,
            slots.map((player) => (player?.name === droppedPlayer.name ? null : player)),
          ])
        );
        const slots = [...(nextBenchChart[starterName] ?? [null, null])].slice(0, 2);
        while (slots.length < 2) slots.push(null);
        slots[slotIndex] = droppedPlayer;
        nextBenchChart[starterName] = slots;

        return {
          ...team,
          benchChart: nextBenchChart,
          lineup: (team.lineup ?? emptyLineup).filter((player) => player.name !== droppedPlayer.name),
          squad: team.squad.map((entry) => {
            const player = normalizeSquadEntry(entry);
            return player.name === droppedPlayer.name ? { ...player, role: 'Reserva' } : player;
          }),
        };
      })
    );
    setDraggedPlayer(null);
  };

  const clearBenchSlot = (starterName, slotIndex) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const slots = [...(team.benchChart?.[starterName] ?? [null, null])].slice(0, 2);
        while (slots.length < 2) slots.push(null);
        slots[slotIndex] = null;
        return { ...team, benchChart: { ...(team.benchChart ?? emptyDepthChart), [starterName]: slots } };
      })
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-caudal-950 via-caudal-900 to-[#05101f] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-5 shadow-glow backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-slate-400">Entrenador</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">C.D. Caudal de Mieres</h1>
            <p className="mt-1 text-sm text-slate-400">Mieres, Asturias</p>
          </div>
          <nav className="flex flex-wrap gap-3">
            {['Inicio', 'Plantilla', 'Equipos', 'Partidos'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab
                    ? 'bg-caudal-electric text-slate-950 shadow-[0_15px_35px_rgba(79,140,255,0.22)]'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === 'Inicio' ? (
          <main className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <section className="space-y-6 rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-sm">
                  <img src={clubCrest} alt="Escudo del C.D. Caudal" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Bienvenida</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">¡Bienvenido, cuerpo técnico!</h2>
                </div>
              </div>
              <div className="space-y-3 text-slate-300">
                <p>Esta es la base para gestionar tu plantilla de manera ágil y deportiva.</p>
                <p>Gestiona alineaciones, jugadores y rápida información de la plantilla sin necesidad de backend.</p>
              </div>
              <button
                onClick={() => setActiveTab('Plantilla')}
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
              >
                Gestionar plantilla
              </button>
            </section>
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-3xl bg-[#15224d] p-4 shadow-inner">
                  <img
                    src={clubCrest}
                    alt="Escudo del equipo"
                    className="h-full w-full rounded-2xl object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Escudo</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">C.D. Caudal</h3>
                </div>
              </div>
              <div className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-caudal-900/80 p-5">
                <p className="text-sm text-slate-300">Plantilla profesional con enfoque joven, organizada para entrenamientos y próximos pasos.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Jugadores</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{players.length}</p>
                  </div>
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sub-23</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{players.filter((player) => calculateAge(player.dob) < 23).length}</p>
                  </div>
                </div>
              </div>
            </section>
          </main>
        ) : null}

        {activeTab === 'Plantilla' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Plantilla</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Gestión de jugadores</h2>
                </div>
                <button
                  onClick={() => openForm(null)}
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Nuevo jugador
                </button>
              </div>
            </section>

            <div className="space-y-6">
              {groupedPlayers.map((group) => (
                <section key={group.title} className="space-y-4">
                  <div className="flex items-end justify-between border-b border-white/10 pb-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Demarcación</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">{group.title}</h3>
                    </div>
                    <span className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-semibold text-slate-200">
                      {group.players.length}
                    </span>
                  </div>

                  {group.players.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.players.map((player) => (
                        <article key={player.id} className="group rounded-3xl border border-white/5 bg-[#091428]/80 p-4 shadow-glow transition hover:-translate-y-1 hover:border-caudal-electric/40">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-slate-800 text-lg font-bold text-slate-200">
                      {player.image ? (
                        <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                      ) : (
                        <span>{player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">#{displayDorsal(player.number)}</p>
                      <h3 className="truncate text-lg font-semibold text-white">{player.name}</h3>
                      <p className="text-sm text-slate-400">{player.position}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>Dorsal</span>
                              <strong className="text-white">{displayDorsal(player.number)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pierna</span>
                      <strong className="text-white">{player.foot}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Edad</span>
                      <strong className="text-white">{calculateAge(player.dob)} años</strong>
                    </div>
                    {playerLabel(player.dob) === 'Sub-23' ? (
                      <div className="flex items-center justify-between rounded-2xl bg-[#10254d] px-3 py-2 text-xs uppercase tracking-[0.25em] text-caudal-electric">
                        <span>Sub-23</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => openForm(player)}
                      className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(player)}
                      className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                    >
                      Eliminar
                    </button>
                  </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
                      No hay jugadores en este grupo.
                    </div>
                  )}
                </section>
              ))}
            </div>
          </main>
        ) : null}

        {activeTab === 'Equipos' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Equipos</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Rivales de competición</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSaveTeams}
                    className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25"
                  >
                    Guardar equipos
                  </button>
                  <button
                    onClick={() => openTeamForm(null)}
                    className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                  >
                    Nuevo equipo
                  </button>
                </div>
              </div>
              {saveStatus ? <p className="mt-3 text-sm text-caudal-electric">{saveStatus}</p> : null}
            </section>

            {selectedTeam ? (
              <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={() => setSelectedTeamId(null)}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Volver a equipos
                  </button>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => openTeamForm(selectedTeam)}
                      className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                    >
                      Editar equipo
                    </button>
                    <button
                      onClick={arrangeSelectedTeam}
                      className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                    >
                      Colocar por sistema
                    </button>
                    <select
                      value={selectedTeam.system}
                      onChange={(event) => updateSelectedTeamSystem(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                    >
                      {gameSystems.map((system) => (
                        <option key={system} value={system}>
                          {system}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[0.34fr_0.66fr]">
                  <aside className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 text-sm font-bold text-caudal-950">
                        {selectedTeam.crest ? (
                          <img src={selectedTeam.crest} alt={`Escudo de ${selectedTeam.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <span>{selectedTeam.name.split(' ').map((part) => part[0]).join('').slice(0, 3)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Alineación</p>
                        <h3 className="truncate text-lg font-semibold text-white">{selectedTeam.name}</h3>
                      </div>
                    </div>

                    <div className="mt-5 space-y-5">
                      {selectedTeam.squad.length > 0 ? (
                        ['Titular', 'Reserva'].map((role) => (
                          <div key={role} className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{role === 'Titular' ? 'Titulares' : 'Reservas'}</p>
                            {selectedTeam.squad
                              .map(normalizeSquadEntry)
                              .filter((player) => player.role === role)
                              .map((player) => (
                                <div
                                  key={player.name}
                                  draggable
                                  onDragStart={() => setDraggedPlayer(player)}
                                  onClick={() => openTeamForm(selectedTeam)}
                                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/20 ${
                                    player.isKey ? 'border border-amber-300/80 bg-amber-300/10' : 'bg-white/10'
                                  }`}
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 text-xs font-bold">
                                    {player.image ? (
                                      <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                                    ) : (
                                      player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1">
                                      <span className="block truncate">{displayPlayerName(player)}</span>
                                      {playerStatusBadges(player).map((badge) => (
                                        <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold ${badge.className}`}>
                                          {badge.label}
                                        </span>
                                      ))}
                                    </span>
                                    {getPlayerMeta(player) ? <span className="block truncate text-xs text-slate-400">{getPlayerMeta(player)}</span> : null}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedTeamPlayerRole(player.name, role === 'Titular' ? 'Reserva' : 'Titular');
                                    }}
                                    className="rounded-xl bg-caudal-950/80 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-caudal-900"
                                  >
                                    {role === 'Titular' ? 'A reserva' : 'Hacer titular'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openTeamForm(selectedTeam);
                                    }}
                                    className="rounded-xl bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/20"
                                  >
                                    Editar
                                  </button>
                                </div>
                              ))}
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                          Añade jugadores en la ficha del equipo.
                        </p>
                      )}
                    </div>
                  </aside>

                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropOnField}
                    className="relative mx-auto aspect-[7/8.9] max-h-[760px] min-h-[620px] w-full max-w-[800px] overflow-hidden rounded-3xl border border-caudal-electric/25 bg-[radial-gradient(circle_at_center,rgba(79,140,255,0.22),transparent_34%),linear-gradient(180deg,rgba(8,32,75,0.96),rgba(5,18,46,0.98))] shadow-glow"
                  >
                    <div className="absolute inset-4 rounded-[28px] border-2 border-white/40" />
                    <div className="absolute left-4 right-4 top-1/2 h-px bg-white/35" />
                    <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
                    <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35" />
                    <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35" />
                    {getFormationCoordinates(selectedTeam.system).map((slot, slotIndex) => {
                      const slotPlayer = getLineupSlotMap(selectedTeam.lineup ?? emptyLineup).get(slotIndex);
                      return (
                        <div
                          key={`${selectedTeam.system}-${slotIndex}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.stopPropagation();
                            handleDropOnLineupSlot(slotIndex);
                          }}
                          className={`absolute flex h-16 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border text-xs font-semibold ${
                            slotPlayer
                              ? 'border-transparent text-transparent'
                              : 'border-dashed border-white/35 bg-white/10 text-white/80'
                          }`}
                          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                        >
                          {slotPlayer ? '' : slotIndex + 1}
                        </div>
                      );
                    })}
                    {(selectedTeam.lineup ?? emptyLineup).map((player) => (
                      <button
                        key={player.name}
                        draggable
                        onDragStart={() => setDraggedPlayer(player)}
                        onDoubleClick={() => removeFromLineup(player.name)}
                        onClick={() => toggleSelectedTeamKeyPlayer(player.name)}
                        className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                        style={{ left: `${player.x}%`, top: `${player.y}%` }}
                        title="Arrastra para mover. Clic marca destacado. Doble clic quita del campo."
                      >
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            removeFromLineup(player.name);
                          }}
                          className="absolute right-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 text-[9px] font-bold text-white opacity-70 shadow transition hover:opacity-100"
                          title="Quitar del once"
                        >
                          X
                        </span>
                        <span
                          className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 bg-caudal-950/70 shadow-glow ${
                            player.isKey ? 'border-amber-300' : 'border-caudal-electric/60'
                          }`}
                        >
                          {player.number ? (
                            <span className="absolute left-1 top-1 z-10 rounded-md bg-caudal-electric px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950">
                              {player.number}
                            </span>
                          ) : null}
                          {player.image ? (
                            <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                          ) : (
                            player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
                          )}
                        </span>
                        <span className="mt-1 flex max-w-24 items-center gap-1 text-xs font-semibold leading-tight text-white drop-shadow">
                          <span className="truncate">{displayPlayerName(player)}</span>
                          {playerStatusBadges(player).map((badge) => (
                            <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          ))}
                        </span>
                        <div
                          className="absolute top-full mt-1 flex w-24 flex-col gap-1"
                        >
                          {[0, 1].map((benchSlotIndex) => {
                            const benchPlayer = getBenchForStarter(player, selectedTeam.benchChart)[benchSlotIndex];
                            return (
                              <span
                                key={`${player.name}-bench-${benchSlotIndex}`}
                                draggable={Boolean(benchPlayer)}
                                onDragStart={(event) => {
                                  if (!benchPlayer) return;
                                  event.stopPropagation();
                                  setDraggedPlayer(benchPlayer);
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.stopPropagation();
                                  handleDropOnBenchSlot(player.name, benchSlotIndex);
                                }}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  clearBenchSlot(player.name, benchSlotIndex);
                                }}
                                className={`relative block min-h-4 max-w-24 truncate rounded-lg px-2 py-0.5 pr-4 text-[11px] leading-tight drop-shadow ${
                                  benchPlayer ? 'bg-caudal-950/70 text-slate-200' : 'border border-dashed border-white/25 text-white/45'
                                }`}
                                title={benchPlayer ? getPlayerMeta(benchPlayer) : 'Arrastra un reserva aquí'}
                              >
                                {benchPlayer ? (
                                  <span className="flex items-center gap-1">
                                    <span className="truncate">{displayPlayerName(benchPlayer)}</span>
                                    {playerStatusBadges(benchPlayer).map((badge) => (
                                      <span key={badge.title} title={badge.title} className={`inline-flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[9px] font-bold ${badge.className}`}>
                                        {badge.label}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  `Reserva ${benchSlotIndex + 1}`
                                )}
                                {benchPlayer ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      clearBenchSlot(player.name, benchSlotIndex);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-300 hover:text-red-100"
                                    title="Quitar reserva"
                                  >
                                    X
                                  </button>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : teams.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {teams.map((team) => (
                  <article
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className="group relative min-h-72 cursor-pointer overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-8 text-center shadow-glow transition hover:-translate-y-1 hover:border-caudal-electric/40"
                  >
                    <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/10 p-2 ring-8 ring-white/5">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white p-3 text-lg font-bold text-caudal-950">
                        {team.crest ? (
                          <img src={team.crest} alt={`Escudo de ${team.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <span>{team.name.split(' ').map((part) => part[0]).join('').slice(0, 3)}</span>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-7 truncate text-xl font-black uppercase text-white">{cleanTeamDisplayName(team.name)}</h3>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{team.stadium || 'Estadio sin definir'}</p>
                    <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-caudal-electric">Sistema: {team.system}</p>
                    <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: team.kitColor ?? '#ef233c' }} />

                    <div className="mt-8 flex justify-center gap-3 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openTeamForm(team);
                        }}
                        className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleTeamDelete(team);
                        }}
                        className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">
                Todavía no hay equipos cargados.
              </section>
            )}
          </main>
        ) : null}

        {activeTab === 'Partidos' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Partidos</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Calendario y análisis</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSaveMatches} className="rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25">
                    Guardar partidos
                  </button>
                  <button onClick={() => openMatchForm(null)} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]">
                    Nuevo partido
                  </button>
                </div>
              </div>
              {saveStatus ? <p className="mt-3 text-sm text-caudal-electric">{saveStatus}</p> : null}
            </section>

            {matchView === 'lista_partidos' ? (
              <>
                <div className="flex flex-wrap gap-3">
              {matchFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setMatchFilter(filter)}
                  className={`rounded-2xl px-5 py-2 text-sm font-semibold uppercase tracking-[0.12em] transition ${
                    matchFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <button onClick={() => openMatchForm(null)} className="min-h-40 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-left transition hover:border-caudal-electric/60">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-caudal-electric/15 text-3xl text-caudal-electric">+</span>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Nuevo partido</p>
              </button>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Partidos totales</p>
                <p className="mt-4 text-4xl font-semibold text-white">{matches.length}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs uppercase text-slate-400">
                  {matchTypes.map((type) => (
                    <div key={type} className="rounded-xl bg-white/5 px-2 py-1">
                      <span className="block truncate">{type}</span>
                      <strong className="text-white">{matches.filter((match) => match.type === type).length}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Efectividad</p>
                <p className="mt-4 text-3xl font-semibold text-emerald-400">{matchStats.wins} Victorias</p>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${matchStats.finished ? (matchStats.wins / matchStats.finished) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Balance de goles</p>
                <p className="mt-4 text-3xl font-semibold text-white">{matchStats.goalsFor} - {matchStats.goalsAgainst}</p>
                <p className="mt-2 text-xs uppercase text-slate-500">Favor / Contra</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Forma reciente</p>
                <div className="mt-5 flex gap-2">
                  {(matchStats.recent.length ? matchStats.recent : ['-', '-', '-']).map((result, index) => (
                    <span key={`${result}-${index}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/60 text-sm font-bold text-emerald-300">{result}</span>
                  ))}
                </div>
                <p className="mt-5 text-xs uppercase text-slate-500">Porterías a cero: {matchStats.cleanSheets}</p>
              </div>
            </div>

            <section className="space-y-4">
              <h3 className="border-l-4 border-caudal-electric pl-3 text-sm font-bold uppercase tracking-[0.25em] text-white">Calendario general</h3>
              {filteredMatches.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredMatches.map((match) => {
                    const activeSection = matchSections[match.id] ?? 'PRE';
                    const caudalIsHome = match.isHome;
                    return (
                      <article key={match.id} className="overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 shadow-glow">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-5">
                          <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2">
                              <img src={caudalIsHome ? clubCrest : match.opponentCrest || clubCrest} alt="" className="h-full w-full object-contain" />
                            </div>
                            <p className="mt-2 text-sm font-bold text-white">{caudalIsHome ? 'C.D. Caudal' : match.opponent}</p>
                          </div>
                          <div className="text-center">
                            <p className="rounded-xl bg-caudal-950 px-3 py-1 text-xs text-slate-400">{matchDisplayDate(match.date)}</p>
                            <p className="mt-3 text-4xl font-bold text-white">{match.status === 'Finalizado' ? `${match.homeScore || 0} - ${match.awayScore || 0}` : 'vs'}</p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{match.type} {match.round}</p>
                            {match.stadium ? <p className="mt-1 text-xs font-semibold text-slate-400">{match.stadium}</p> : null}
                          </div>
                          <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 text-lg font-bold text-white">
                              {caudalIsHome ? (match.opponentCrest ? <img src={match.opponentCrest} alt="" className="h-full w-full object-contain" /> : match.opponent.slice(0, 2).toUpperCase()) : <img src={clubCrest} alt="" className="h-full w-full object-contain" />}
                            </div>
                            <p className="mt-2 text-sm font-bold text-white">{caudalIsHome ? match.opponent : 'C.D. Caudal'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 border-t border-white/10">
                          {['PRE', 'ESTADÍSTICAS', 'POST'].map((section) => (
                            <button
                              key={section}
                              onClick={() => {
                                setMatchSections((prev) => ({ ...prev, [match.id]: section }));
                                openMatchPage(match, section);
                              }}
                              className={`px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] ${activeSection === section ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.03] text-slate-500 hover:text-white'}`}>
                              {section}
                            </button>
                          ))}
                        </div>
                        <div className="p-5 text-sm text-slate-300"></div>
                        <div className="flex gap-3 px-5 pb-5">
                          <button onClick={() => openMatchForm(match)} className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white">Editar</button>
                          <button onClick={() => handleMatchDelete(match)} className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200">Eliminar</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">No hay partidos en este filtro.</div>
              )}
            </section>
              </>
            ) : selectedMatch ? (
              <section className="space-y-6">
                <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <button onClick={closeMatchPage} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
                        ← Volver a partidos
                      </button>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{matchView === 'pre_partido' ? 'Pre partido' : matchView === 'estadisticas_partido' ? 'Estadísticas' : 'Post partido'}</p>
                      <h2 className="mt-2 text-3xl font-semibold text-white">{matchView === 'pre_partido' ? 'PRE partido' : matchView === 'estadisticas_partido' ? 'Estadísticas del partido' : 'POST partido'}</h2>
                      <p className="mt-2 text-sm text-slate-400">{matchDisplayDate(selectedMatch.date)} · {selectedMatch.type} · {selectedMatch.round}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl bg-[#091428]/90 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Rival</p>
                        <p className="mt-3 text-xl font-semibold text-white">{selectedMatch.opponent || 'Sin rival'}</p>
                        {selectedMatch.stadium ? <p className="mt-2 text-sm text-slate-400">Estadio: {selectedMatch.stadium}</p> : null}
                      </div>
                      <div className="rounded-3xl bg-[#091428]/90 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Resultado</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{selectedMatch.status === 'Finalizado' ? `${selectedMatch.homeScore || 0} - ${selectedMatch.awayScore || 0}` : 'Pendiente'}</p>
                        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-400">{selectedMatch.status}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {['PRE', 'ESTADÍSTICAS', 'POST'].map((section) => (
                      <button
                        key={section}
                        onClick={() => openMatchPage(selectedMatch, section)}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${matchViewSection === section ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                        {section}
                      </button>
                    ))}
                  </div>
                </div>

                {matchView === 'pre_partido' ? (
                  <section className="space-y-6">
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">PRE partido</p>
                          <h3 className="mt-2 text-2xl font-semibold text-white">Preparación táctica</h3>
                          <p className="mt-2 text-sm text-slate-400">Gestiona el informe rival y los sistemas enfrentados.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {['Informe rival', 'Sistemas enfrentados'].map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setPreSubTab(tab)}
                              className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${preSubTab === tab ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                              {tab}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {preSubTab === 'Informe rival' ? (
                      <div className="space-y-6">
                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Enlace del informe Canva</span>
                              <input
                                type="url"
                                value={selectedMatch.preCanvaLink || ''}
                                onChange={(event) => updateSelectedMatchFields({ preCanvaLink: event.target.value })}
                                placeholder="https://www.canva.com/..."
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={!selectedMatch.preCanvaLink}
                              onClick={() => selectedMatch.preCanvaLink && window.open(selectedMatch.preCanvaLink, '_blank')}
                              className="h-fit rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:bg-slate-600/40"
                            >
                              Abrir informe
                            </button>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Notas rápidas</h4>
                          <textarea
                            value={selectedMatch.preNotes || ''}
                            onChange={(event) => updateSelectedMatchFields({ preNotes: event.target.value })}
                            placeholder="Resumen rápido del rival, estilo de juego y puntos clave..."
                            className="mt-4 min-h-[180px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                          />
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Análisis táctico IA</h4>
                              <p className="mt-2 text-sm text-slate-400">Espacio para evaluar ventajas, riesgos y plan recomendado.</p>
                            </div>
                            <button
                              type="button"
                              onClick={runAiAnalysis}
                              className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                            >
                              Analizar sistemas
                            </button>
                          </div>
                          {selectedMatch.preAiAnalysis ? (
                            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                              {[
                                { title: 'Ventajas del C.D. Caudal', value: selectedMatch.preAiAnalysis.advantages },
                                { title: 'Riesgos defensivos', value: selectedMatch.preAiAnalysis.risks },
                                { title: 'Dónde progresar', value: selectedMatch.preAiAnalysis.progress },
                                { title: 'Dónde presionar', value: selectedMatch.preAiAnalysis.pressure },
                                { title: 'Emparejamientos clave', value: selectedMatch.preAiAnalysis.keyMatchups },
                                { title: 'Plan recomendado', value: selectedMatch.preAiAnalysis.recommendedPlan },
                              ].map((item) => (
                                <div key={item.title} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.title}</p>
                                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.value || 'Pendiente de análisis.'}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">Aquí se mostrará el análisis IA una vez se haya generado.</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Campo 1</p>
                                <h4 className="mt-2 text-xl font-semibold text-white">C.D. Caudal</h4>
                              </div>
                            </div>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Sistema</span>
                              <select
                                value={selectedMatch.preCaudalSystem || '4-4-2'}
                                onChange={(event) => updateSelectedMatchFields({ preCaudalSystem: event.target.value })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              >
                                {gameSystems.map((system) => (
                                  <option key={system} value={system}>{system}</option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Alineación prevista</span>
                              <textarea
                                value={formatLineupText(selectedMatch.preCaudalLineup || [])}
                                onChange={(event) => updateSelectedMatchFields({ preCaudalLineup: parseLineupText(event.target.value) })}
                                placeholder="Escribe los titulares, uno por línea..."
                                className="min-h-[220px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                              />
                            </label>
                          </div>

                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Campo 2</p>
                                <h4 className="mt-2 text-xl font-semibold text-white">Rival</h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const rivalTeam = getRivalBaseTeam();
                                  if (rivalTeam) {
                                    updateSelectedMatchFields({
                                      preRivalSystem: rivalTeam.system,
                                      preRivalLineup: rivalTeam.squad.slice(0, 11).map(normalizeSquadEntry).map((player) => player.name),
                                    });
                                  }
                                }}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white hover:bg-white/15"
                              >
                                Cargar desde Equipos
                              </button>
                            </div>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Sistema</span>
                              <select
                                value={getCurrentRivalSystem()}
                                onChange={(event) => updateSelectedMatchFields({ preRivalSystem: event.target.value })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              >
                                {gameSystems.map((system) => (
                                  <option key={system} value={system}>{system}</option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Alineación prevista</span>
                              <textarea
                                value={formatLineupText(getCurrentRivalLineup())}
                                onChange={(event) => updateSelectedMatchFields({ preRivalLineup: parseLineupText(event.target.value) })}
                                placeholder="Alineación rival prevista, uno por línea..."
                                className="min-h-[220px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Análisis táctico IA</h4>
                          <p className="mt-3 text-sm text-slate-400">El sistema compara las dos formaciones previstas y muestra los puntos clave.</p>
                          {selectedMatch.preAiAnalysis ? (
                            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                              {[
                                { title: 'Ventajas del C.D. Caudal', value: selectedMatch.preAiAnalysis.advantages },
                                { title: 'Riesgos defensivos', value: selectedMatch.preAiAnalysis.risks },
                                { title: 'Dónde progresar', value: selectedMatch.preAiAnalysis.progress },
                                { title: 'Dónde presionar', value: selectedMatch.preAiAnalysis.pressure },
                                { title: 'Emparejamientos clave', value: selectedMatch.preAiAnalysis.keyMatchups },
                                { title: 'Plan recomendado', value: selectedMatch.preAiAnalysis.recommendedPlan },
                              ].map((item) => (
                                <div key={item.title} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.title}</p>
                                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.value || 'Pendiente de análisis.'}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">Pulsa "Analizar sistemas" en la pestaña Informe rival para obtener una previsión automática.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                ) : matchView === 'estadisticas_partido' ? (
                  <section className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                      {[
                        { label: 'Tiros', value: selectedMatch.shots },
                        { label: 'Tiros a puerta', value: selectedMatch.shotsOnTarget },
                        { label: 'Posesión', value: selectedMatch.possession ? `${selectedMatch.possession}%` : '' },
                        { label: 'Corners', value: selectedMatch.corners },
                        { label: 'Amarillas', value: selectedMatch.yellowCards },
                        { label: 'Rojas', value: selectedMatch.redCards },
                      ].map((item) => (
                        <div key={item.label} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                          <p className="mt-4 text-3xl font-semibold text-white">{item.value || '-'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Resultado y datos clave</h3>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Goles a favor</p>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{selectedMatch.goalsFor || '-'}</p>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Goles en contra</p>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{selectedMatch.goalsAgainst || '-'}</p>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Portería a cero</p>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{selectedMatch.cleanSheet ? 'Sí' : 'No'}</p>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tipo de partido</p>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{selectedMatch.type}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
                    <div className="space-y-6">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">POST partido</p>
                            <h3 className="mt-2 text-2xl font-semibold text-white">Recap visual y eventos</h3>
                            <p className="mt-2 text-sm text-slate-400">Registro rápido de momentos clave y acceso al vídeo del partido.</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Enlace YouTube</p>
                            <input
                              value={selectedMatch.postVideoLink || ''}
                              onChange={(event) => updateSelectedMatchFields({ postVideoLink: event.target.value })}
                              placeholder="https://www.youtube.com/watch?v=..."
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                          </div>
                        </div>
                        <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-3">
                          {getYouTubeEmbedUrl(selectedMatch.postVideoLink) ? (
                            <div className="relative overflow-hidden rounded-3xl bg-black shadow-inner" style={{ paddingTop: '56.25%' }}>
                              <iframe
                                src={getYouTubeEmbedUrl(selectedMatch.postVideoLink)}
                                title="Post partido video"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                className="absolute inset-0 h-full w-full"
                              />
                            </div>
                          ) : (
                            <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 text-center text-sm text-slate-400">
                              Introduce un enlace válido de YouTube para previsualizar el vídeo del partido.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Historial de eventos</h4>
                            <p className="mt-2 text-sm text-slate-400">Registros agrupados por minuto y tipo de evento.</p>
                          </div>
                          <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">{(selectedMatch.events || []).length} eventos</span>
                        </div>
                        <div className="mt-5 space-y-3">
                          {(selectedMatch.events || []).length > 0 ? (
                            [...(selectedMatch.events || [])].reverse().map((event) => (
                              <div key={event.id} className="rounded-3xl bg-[#0f1e38]/80 p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-white">{event.type} - {event.minute}'</p>
                                    <p className="text-sm text-slate-400">{event.player || 'Sin jugador definido'}</p>
                                  </div>
                                  <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">{event.minute}'</span>
                                </div>
                                <p className="mt-3 text-sm leading-7 text-slate-300">{event.description}</p>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-3xl bg-[#0f1e38]/80 p-6 text-sm text-slate-400">No se han registrado eventos postpartido todavía.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <aside className="space-y-6">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Botonera de eventos</h4>
                        <p className="mt-2 text-sm text-slate-400">Pulsa para preparar rápidamente el tipo de evento a registrar.</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {eventTypes.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                setSelectedEventType(type);
                                handleEventDraftChange('type', type);
                              }}
                              className={`rounded-3xl px-4 py-4 text-sm font-semibold transition ${eventButtonClass(type)} ${selectedEventType === type ? 'ring-2 ring-caudal-electric' : ''}`}>
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Registrar evento</h4>
                        <div className="mt-5 space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-sm text-slate-300">
                              <span>Minuto</span>
                              <input
                                value={newEventDraft.minute}
                                onChange={(event) => handleEventDraftChange('minute', event.target.value)}
                                placeholder="Ej. 72"
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              />
                            </label>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span>Jugador</span>
                              <input
                                value={newEventDraft.player}
                                onChange={(event) => handleEventDraftChange('player', event.target.value)}
                                placeholder="Nombre del jugador"
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              />
                            </label>
                          </div>
                          <label className="space-y-2 text-sm text-slate-300">
                            <span>Descripción</span>
                            <textarea
                              value={newEventDraft.description}
                              onChange={(event) => handleEventDraftChange('description', event.target.value)}
                              placeholder="Detalle del evento..."
                              className="min-h-[140px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={addNewEvent}
                            className="w-full rounded-3xl bg-caudal-electric px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                          >
                            Guardar evento
                          </button>
                        </div>
                      </div>
                    </aside>
                  </section>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">Partido no encontrado.</section>
            )}
          </main>
        ) : null}
      </div>

      {isPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingId ? 'Editar jugador' : 'Nuevo jugador'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Formulario de jugador</h3>
              </div>
              <button onClick={closeForm} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Cerrar
              </button>
            </div>
            <form onSubmit={handleSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre completo</span>
                  <input
                    required
                    name="name"
                    value={formState.name}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. Pablo Núñez"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Fecha de nacimiento</span>
                  <input
                    required
                    type="date"
                    name="dob"
                    value={formState.dob}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Dorsal</span>
                  <input
                    required
                    type="number"
                    name="number"
                    min="1"
                    value={formState.number}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                    placeholder="7"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Posición</span>
                  <select
                    required
                    name="position"
                    value={formState.position}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {positions.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Pierna hábil</span>
                  <select
                    required
                    name="foot"
                    value={formState.foot}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {footOptions.map((foot) => (
                      <option key={foot} value={foot}>
                        {foot}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span>URL de imagen</span>
                <input
                  name="image"
                  type="url"
                  value={formState.image}
                  onChange={handleChange}
                  className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  placeholder="https://..."
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Guardar jugador
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isTeamPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingTeamId ? 'Editar equipo' : 'Nuevo equipo'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Ficha del rival</h3>
              </div>
              <button onClick={closeTeamForm} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Cerrar
              </button>
            </div>

            <form onSubmit={handleTeamSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Enlace del equipo</span>
                  <input
                    required
                    name="sourceUrl"
                    value={teamFormState.sourceUrl}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="https://es.besoccer.com/equipo/plantilla/..."
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre del equipo</span>
                  <input
                    name="name"
                    value={teamFormState.name}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Se rellena al importar"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>URL escudo</span>
                  <input
                    name="crest"
                    value={teamFormState.crest}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Se rellena al importar"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Estadio</span>
                  <input
                    name="stadium"
                    value={teamFormState.stadium}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. El Bayu"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Color camiseta</span>
                  <input
                    name="kitColor"
                    type="color"
                    value={teamFormState.kitColor}
                    onChange={handleTeamChange}
                    className="h-[46px] w-full rounded-3xl border border-white/10 bg-white/5 px-3 py-2 shadow-inner"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Sistema habitual</span>
                  <select
                    required
                    name="system"
                    value={teamFormState.system}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {gameSystems.map((system) => (
                      <option key={system} value={system}>
                        {system}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  El importador intenta rellenar nombre, escudo, jugadores y fotos desde el enlace.
                </p>
                <button
                  type="button"
                  onClick={handleImportSquad}
                  className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                >
                  Importar plantilla
                </button>
              </div>
              {importStatus ? <p className="text-sm text-caudal-electric">{importStatus}</p> : null}

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-200">Plantilla</p>
                  <button
                    type="button"
                    onClick={handleAddTeamPlayer}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                  >
                    Añadir jugador
                  </button>
                </div>

                <div className="space-y-3">
                  {teamFormState.squad.length > 0 ? (
                    teamFormState.squad.map((entry, index) => {
                      const player = normalizeSquadEntry(entry);
                      return (
                        <div key={`${player.id}-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="grid gap-3">
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.45fr]">
                              <input
                                value={player.name}
                                onChange={(event) => handleTeamPlayerChange(index, 'name', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Nombre"
                              />
                              <input
                                value={player.image}
                                onChange={(event) => handleTeamPlayerChange(index, 'image', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="URL foto"
                              />
                              <input
                                value={player.number}
                                onChange={(event) => handleTeamPlayerChange(index, 'number', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Dorsal"
                              />
                            </div>
                            <div className="grid gap-3 md:grid-cols-[1fr_0.45fr_0.7fr_auto]">
                              <select
                                value={player.position}
                                onChange={(event) => handleTeamPlayerChange(index, 'position', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner"
                              >
                                <option value="">Posición</option>
                                {positions.map((position) => (
                                  <option key={position} value={position}>
                                    {position}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={player.age}
                                onChange={(event) => handleTeamPlayerChange(index, 'age', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Edad"
                              />
                              <select
                                value={player.role}
                                onChange={(event) => handleTeamPlayerChange(index, 'role', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner"
                              >
                                <option value="Titular">Titular</option>
                                <option value="Reserva">Reserva</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveTeamPlayer(index)}
                                className="rounded-2xl bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                              >
                                Quitar
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                checked={player.isKey}
                                onChange={(event) => handleTeamPlayerChange(index, 'isKey', event.target.checked)}
                                className="h-4 w-4 accent-[#4f8cff]"
                              />
                              Destacado
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                              <input
                                type="checkbox"
                                checked={player.yellowRisk}
                                onChange={(event) => handleTeamPlayerChange(index, 'yellowRisk', event.target.checked)}
                                className="h-4 w-4 accent-yellow-300"
                              />
                              Amarilla
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-100">
                              <input
                                type="checkbox"
                                checked={player.suspended}
                                onChange={(event) => handleTeamPlayerChange(index, 'suspended', event.target.checked)}
                                className="h-4 w-4 accent-red-500"
                              />
                              Roja
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-100">
                              <input
                                type="checkbox"
                                checked={player.injured}
                                onChange={(event) => handleTeamPlayerChange(index, 'injured', event.target.checked)}
                                className="h-4 w-4 accent-red-500"
                              />
                              Cruz
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">
                      Importa desde el enlace o añade jugadores manualmente.
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeTeamForm}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Guardar equipo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isMatchPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <h3 className="text-xl font-black uppercase tracking-[0.18em] text-white">{editingMatchId ? 'Editar partido' : 'Nuevo partido'}</h3>
              </div>
              <button onClick={closeMatchForm} className="text-3xl leading-none text-slate-500 hover:text-white">
                ×
              </button>
            </div>

            <form onSubmit={handleMatchSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Rival</span>
                  <input
                    required
                    list="opponent-teams"
                    name="opponent"
                    value={matchFormState.opponent}
                    onChange={handleMatchChange}
                    placeholder="Escribe o selecciona..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  />
                  <datalist id="opponent-teams">
                    {teams.map((team) => (
                      <option key={team.id} value={cleanTeamDisplayName(team.name)} />
                    ))}
                  </datalist>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Competición</span>
                  <select name="type" value={matchFormState.type} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                    {matchTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jornada</span>
                  <input name="round" value={matchFormState.round} onChange={handleMatchChange} placeholder="0" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Fecha</span>
                  <input type="date" name="date" value={matchFormState.date} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Condición</span>
                  <select name="isHome" value={matchFormState.isHome ? 'true' : 'false'} onChange={(event) => setMatchFormState((prev) => ({ ...prev, isHome: event.target.value === 'true' }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                    <option value="true">Local</option>
                    <option value="false">Visitante</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jugado</span>
                  <span className="flex h-[46px] items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMatchFormState((prev) => ({ ...prev, status: prev.status === 'Finalizado' ? 'Previa' : 'Finalizado' }))}
                      className={`relative h-7 w-14 rounded-full transition ${matchFormState.status === 'Finalizado' ? 'bg-caudal-electric' : 'bg-white/15'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${matchFormState.status === 'Finalizado' ? 'left-8' : 'left-1'}`} />
                    </button>
                    <span className="text-xs font-bold uppercase text-slate-500">{matchFormState.status === 'Finalizado' ? 'Sí' : 'No'}</span>
                  </span>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Estadio</span>
                <input name="stadium" value={matchFormState.stadium} onChange={handleMatchChange} placeholder="Ej. Hermanos Antuña" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              </label>

              {editingMatchId ? (
                <>
                  {/* PRE Partido - Informe Rival */}
                  <section ref={preSectionRef} className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">PRE Partido - Informe rival</p>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Notas sobre el rival</span>
                      <textarea name="preNotes" value={matchFormState.preNotes} onChange={handleMatchChange} placeholder="Características del rival, puntos débiles, jugadores clave..." className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>
                  </section>

                  {/* PRE Partido - Plan de Partido */}
                  <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">Plan de Partido</p>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Con balón (3-5 ideas)</span>
                      <textarea name="planConBalon" value={matchFormState.planConBalon} onChange={handleMatchChange} placeholder="Cómo atacar, estructura ofensiva..." className="min-h-16 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Sin balón (3-5 ideas)</span>
                      <textarea name="planSinBalon" value={matchFormState.planSinBalon} onChange={handleMatchChange} placeholder="Presión, cobertura defensiva, marcajes..." className="min-h-16 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Transiciones (2-3 ideas)</span>
                      <textarea name="planTransiciones" value={matchFormState.planTransiciones} onChange={handleMatchChange} placeholder="Robo-contraataque, transiciones defensivas..." className="min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">🎯 Clave del partido</span>
                      <input name="planClave" value={matchFormState.planClave} onChange={handleMatchChange} placeholder="La idea más importante del partido..." className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Objetivo del partido</span>
                      <input name="planObjetivo" value={matchFormState.planObjetivo} onChange={handleMatchChange} placeholder="Ganar, mejorar defensa, controlar mediocampo..." className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>
                  </section>

                  {/* PRE Partido - ABP Rápida */}
                  <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">ABP Rápida (Recordatorio)</p>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Enlace a Canva o PDF</span>
                      <input name="abpEnlace" value={matchFormState.abpEnlace} onChange={handleMatchChange} placeholder="https://canva.com/..." type="url" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Notas ABP Ofensiva</span>
                      <textarea name="abpOfensiva" value={matchFormState.abpOfensiva} onChange={handleMatchChange} placeholder="Resumen de jugadas ofensivas planificadas..." className="min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Notas ABP Defensiva</span>
                      <textarea name="abpDefensiva" value={matchFormState.abpDefensiva} onChange={handleMatchChange} placeholder="Resumen de situaciones defensivas planificadas..." className="min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>
                  </section>

                  {/* PRE Partido - Alineación Rival */}
                  <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">Alineación rival para el partido</p>
                      <button
                        type="button"
                        onClick={() => {
                          const rivalTeam = teams.find((t) => cleanTeamDisplayName(t.name) === matchFormState.opponent);
                          if (rivalTeam) {
                            setMatchFormState((prev) => ({
                              ...prev,
                              rivalLineupSystem: rivalTeam.system,
                              rivalLineupPlayers: rivalTeam.squad.slice(0, 11).map((p) => normalizeSquadEntry(p)),
                            }));
                          }
                        }}
                        className="rounded-lg bg-caudal-electric/20 px-3 py-2 text-xs font-semibold text-caudal-electric hover:bg-caudal-electric/30"
                      >
                        Cargar desde Equipos
                      </button>
                    </div>

                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Sistema (ej: 4-4-2)</span>
                      <select name="rivalLineupSystem" value={matchFormState.rivalLineupSystem} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                        <option value="">Sin definir</option>
                        {gameSystems.map((system) => (
                          <option key={system} value={system}>
                            {system}
                          </option>
                        ))}
                      </select>
                    </label>

                    <p className="text-xs text-slate-500">
                      {matchFormState.rivalLineupPlayers.length > 0
                        ? `${matchFormState.rivalLineupPlayers.length} jugadores cargados`
                        : 'Pulsa "Cargar desde Equipos" para traer la alineación base del rival.'}
                    </p>
                  </section>

                  <section ref={postSectionRef} className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">POST Partido - Análisis</p>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Notas de análisis postpartido</span>
                      <textarea name="postNotes" value={matchFormState.postNotes} onChange={handleMatchChange} placeholder="Análisis, mejoras, puntos débiles del equipo..." className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
                    </label>
                  </section>
                </>
              ) : null}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeMatchForm} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200">Cancelar</button>
                <button type="submit" className="rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950">Guardar encuentro</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;

