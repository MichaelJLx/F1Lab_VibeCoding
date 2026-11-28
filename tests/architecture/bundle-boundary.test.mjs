import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadConfigFromFile} from 'vite';

const loaded = await loadConfigFromFile({command: 'build', mode: 'production'});
const config = loaded.config;
const pageGuard = config.plugins.find(plugin => plugin.name === 'circuit-runtime-only');
const workerGuard = config.worker.plugins().find(plugin => plugin.name === 'circuit-runtime-only');
const context = {error(message) { throw new Error(message); }};

test('page and worker builds exclude circuit source material', () => {
  for (const guard of [pageGuard, workerGuard]) {
    assert.ok(guard);
    assert.equal(guard.load.call(context, path.resolve('circuits/spa/circuit.json')), undefined);
    for (const file of [
      'circuits/spa/sources/sessions/flying/car_data.json',
      'circuits/spa/sources/layout/be-1925.geojson?raw',
      'circuits/spa/sources/elevation/Spa官方地图_2026.pdf?url',
      'circuits/shanghai/sources/elevation/terrain.json',
    ]) {
      assert.throws(() => guard.load.call(context, path.resolve(file)), /reference material/);
    }
  }
});

test('the circuit loader imports exactly one runtime payload per registered circuit', async () => {
  const registry = JSON.parse(await readFile('circuits/catalog.json', 'utf8'));
  const loader = await readFile('src/tracks/CircuitLoader.ts', 'utf8');
  const imports = [...loader.matchAll(/import\(([^)]+)\)/g)].map(match => match[1]);
  assert.deepEqual(imports, registry.map(row => `'../../circuits/${row.directory}/circuit.json'`));
  assert.equal(loader.includes('import.meta.glob'), false);
});
