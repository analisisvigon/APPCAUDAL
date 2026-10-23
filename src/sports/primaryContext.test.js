import assert from 'node:assert/strict';
import { findPreferredActiveContext } from './primaryContext.js';

const libya = Object.freeze({ id: 'libya-cts', role: 'owner', seasonStatus: 'open', isActiveSeason: true });
const caudal = Object.freeze({ id: 'caudal-cts', role: 'owner', seasonStatus: 'closed', isActiveSeason: false });
const contexts = [caudal, libya];

assert.equal(findPreferredActiveContext(contexts, 'libya-cts'), libya);
assert.equal(findPreferredActiveContext(contexts, ''), null);
assert.equal(findPreferredActiveContext(contexts, 'unknown-cts'), null);
assert.equal(findPreferredActiveContext(contexts, 'caudal-cts'), null);
assert.equal(findPreferredActiveContext([libya, libya], 'libya-cts'), null);
assert.equal(findPreferredActiveContext([{ ...libya, role: 'staff' }], 'libya-cts'), null);
assert.equal(findPreferredActiveContext([{ ...libya, isActiveSeason: false }], 'libya-cts'), null);

console.log('Preferred CTS navigation checks passed.');
