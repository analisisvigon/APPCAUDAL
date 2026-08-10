const countPagesForPairs = (items) => Math.ceil((Array.isArray(items) ? items.length : 0) / 2);

export const getDossierPageContribution = (pageId, content = {}) => {
  if (pageId === 'lineup') return content.hasLineup ? 1 : 0;
  if (pageId === 'keys') return 1;
  if (pageId === 'takers') return content.hasTakers ? 1 : 0;
  if (pageId === 'offensive') return countPagesForPairs(content.offensiveDiagrams);
  if (pageId === 'defensive') return countPagesForPairs(content.defensiveDiagrams);
  if (pageId === 'kickoff') return countPagesForPairs(content.kickoffDiagrams);
  if (pageId === 'match_plan') return countPagesForPairs(content.matchPlanSituations);
  return 0;
};

export const getDossierTotalPages = (pages = [], content = {}) =>
  pages
    .filter((page) => page?.active !== false)
    .reduce((total, page) => total + getDossierPageContribution(page.id, content), 0);

export const getDossierStartPageNumber = (pages = [], targetId, content = {}) => {
  let pageNumber = 1;
  for (const page of pages.filter((item) => item?.active !== false)) {
    if (page.id === targetId) return pageNumber;
    pageNumber += getDossierPageContribution(page.id, content);
  }
  return pageNumber;
};
