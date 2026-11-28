import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';

const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const catalog = await readJSON('circuits/catalog.json');

test('all circuit source archives have traceable, intact files and consistent timing evidence', async () => {
  assert.equal(catalog.length, 24);
  for (const circuit of catalog) {
    const base = path.resolve('circuits', circuit.directory, 'sources');
    const index = await readJSON(path.join(base, 'source.json'));
    assert.equal(index.circuitId, circuit.id);
    assert.deepEqual(Object.keys(index.categories).sort(), ['annotations', 'elevation', 'layout', 'pit-lane', 'sessions']);
    for (const [category, filename] of Object.entries(index.categories)) {
      const manifest = await readJSON(path.join(base, filename));
      assert.ok(manifest.files.length > 0, `${circuit.directory}/${category}`);
      assert.equal(new Set(manifest.files.map(row => row.file)).size, manifest.files.length);
      for (const row of manifest.files) {
        const file = path.resolve(base, category, row.file);
        assert.ok(file.startsWith(base + path.sep), 'archive references stay within the circuit');
        const data = await readFile(file);
        assert.equal(createHash('sha256').update(data).digest('hex'), row.sha256, file);
        assert.match(row.url, /^https?:\/\//, file);
        assert.ok(row.year === null || Number.isInteger(row.year), file);
        if (row.file.endsWith('/reference-lap.json')) {
          const lap = JSON.parse(data);
          assert.ok(Math.abs(lap.duration_sector_1 + lap.duration_sector_2 + lap.duration_sector_3 - lap.lap_duration) < .02, file);
        }
      }
    }
    const map = await readJSON(path.join(base, 'annotations/fia-map-index.json'));
    if (map.sectorLengthsM) {
      assert.ok(Math.abs(Object.values(map.sectorLengthsM).reduce((a, b) => a + b, 0) - map.lengthM) <= 2);
    }
  }
});

test('Bahrain source selection remains Sakhir 2025', async () => {
  const base = 'circuits/bahrain/sources';
  const source = await readJSON(`${base}/source.json`);
  assert.deepEqual(source.yearPreference, [2025, 2024, 2023]);
  const facts = await readJSON(`${base}/layout/official-facts-2025.json`);
  assert.equal(facts.statistics['Circuit Length'], '5.412km');
  const session = await readJSON(`${base}/sessions/2025/session.json`);
  assert.equal(session.circuit_key, 63);
  assert.equal(session.year, 2025);
});
