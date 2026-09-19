import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSnapshotPath } from '../src/ports/supabase-snapshot.ts';

/**
 * Trust-boundary test: what may enter a snapshot. .env (publishable keys,
 * regenerated per turn anyway), npm artifacts, and dot-dirs must stay out.
 */
test('isSnapshotPath keeps source, excludes secrets and npm artifacts', () => {
  assert.equal(isSnapshotPath('src/App.tsx'), true);
  assert.equal(isSnapshotPath('package.json'), true);
  assert.equal(isSnapshotPath('supabase/migrations/001.sql'), true);

  assert.equal(isSnapshotPath('.env'), false);
  assert.equal(isSnapshotPath('src/.env.local'), false);
  assert.equal(isSnapshotPath('node_modules/vite/index.js'), false);
  assert.equal(isSnapshotPath('.git/config'), false);
  assert.equal(isSnapshotPath('package-lock.json'), false);
  assert.equal(isSnapshotPath('tsconfig.tsbuildinfo'), false);
});
