import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrapper = readFileSync('src/components/video/AuthorizedVideoAnalysis.jsx', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');
assert.match(wrapper, /loadAuthorizedSportsContexts\(client\)/);
assert.match(wrapper, /verifySelectableSportsContext\(client, selectedId\)/);
assert.match(wrapper, /loadCtsMatches\(client, coordinator, token\)/);
assert.doesNotMatch(wrapper, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/,
  'la integración no abre consultas amplias ni escrituras remotas');
assert.match(app, /LOCAL_VIDEO_LAB_ENABLED && activeTab === 'Videoanálisis' && AuthorizedVideoAnalysis/);
assert.match(app, /LOCAL_VIDEO_LAB_ENABLED && activeTab === 'Videoanálisis' && LocalVideoAnalysisLab/);
console.log('Video lab authorized scope: OK');
