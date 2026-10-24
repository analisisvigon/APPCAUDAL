export const PDF_THEME = Object.freeze({
  page: { width: 210, height: 297, margin: 15 },
  colors: {
    navy: [7, 19, 36],
    navySoft: [14, 34, 58],
    graphite: [25, 36, 48],
    ink: [18, 31, 47],
    slate: [91, 108, 126],
    muted: [155, 171, 188],
    paper: [255, 255, 255],
    mist: [244, 247, 250],
    line: [218, 226, 234],
    blue: [45, 137, 209],
    cyan: [77, 187, 226],
    green: [25, 145, 96],
    amber: [204, 139, 32],
    violet: [113, 87, 176],
    red: [174, 63, 74],
    neutral: [105, 119, 134],
    pitch: [22, 113, 78],
    pitchAlt: [25, 125, 86],
  },
});

export const competitionColor = (key) => {
  const { colors } = PDF_THEME;
  return ({ league: colors.green, cup: colors.amber, friendly: colors.violet })[key]
    || colors.neutral;
};
