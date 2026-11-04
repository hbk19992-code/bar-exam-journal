import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the actual JSX module without changing its public exports or signing in.
const source = await readFile(new URL('../src/variance-tracker.jsx', import.meta.url), 'utf8');
const { outputFiles } = await build({
  stdin: {
    contents: `${source}\nexport { CYCLE_DEFS, normalizeSettings, normalizeStoredState, getCycleInfo, addDays, CalendarView, SettingsView };`,
    resolveDir: fileURLToPath(new URL('../src/', import.meta.url)),
    loader: 'jsx',
  },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  define: { 'import.meta.env': '{}' },
  write: false,
});
const compiled = { exports: {} };
runInThisContext(`(function(require, module, exports) { ${outputFiles[0].text}\n})`)(
  createRequire(import.meta.url), compiled, compiled.exports,
);
const { CYCLE_DEFS, normalizeSettings, normalizeStoredState, getCycleInfo, addDays, CalendarView, SettingsView } = compiled.exports;

function legacyCycles() {
  return [[8, 6, 5], [5, 3, 2]].map((days, i) => ({
    id: i + 1,
    label: `사이클 ${i + 1}`,
    blocks: ['민사법', '형사법', '공법'].map((subject, j) => ({ subject, days: days[j] })),
  }));
}

test('new users get one 10-day 5/3/2 cycle', () => {
  const settings = normalizeSettings();
  assert.equal(settings.cycleDefs.length, 1);
  assert.deepEqual(settings.cycleDefs[0].blocks.map(b => b.days), [5, 3, 2]);
  assert.equal(settings.cycleDefs[0].label, '5·3·2 회독');
});

test('saved legacy settings migrate without mutating other settings or study records', () => {
  const saved = {
    settings: { cycleDefs: legacyCycles(), cycleEnabled: false, examDate: '2027-01-12', weeklyTargets: { 민사법: 120 } },
    logs: { '2026-11-04': { 민사법: 60 } },
    reviews: [{ id: 'review-1', intervals: [5, 3, 2], done: [true, false, false] }],
    courses: [{ id: 'course-1', lectures: [{ num: 1, completed: true }] }],
    rankScores: [{ id: 'rank-1', score: 30 }],
  };
  const before = structuredClone(saved);
  const migrated = normalizeStoredState(saved);
  assert.deepEqual(migrated.settings.cycleDefs, CYCLE_DEFS);
  assert.equal(migrated.settings.cycleEnabled, false);
  assert.equal(migrated.settings.examDate, saved.settings.examDate);
  assert.equal(migrated.settings.weeklyTargets.민사법, 120);
  for (const key of ['logs', 'reviews', 'courses', 'rankScores']) {
    assert.deepEqual(migrated[key], saved[key]);
  }
  assert.deepEqual(saved, before);
  assert.deepEqual(normalizeStoredState(migrated), migrated);
  assert.deepEqual(normalizeStoredState(JSON.parse(JSON.stringify(saved))), migrated);
});

test('standalone old cycle 2 receives the new name, while custom blocks stay intact', () => {
  assert.deepEqual(normalizeSettings({ cycleDefs: [legacyCycles()[1]] }).cycleDefs, CYCLE_DEFS);
  const custom = legacyCycles();
  custom[0].blocks[0].days = 7;
  assert.deepEqual(normalizeSettings({ cycleDefs: custom }).cycleDefs, custom);
});

test('each of six rotations has 5 civil, 3 criminal and 2 public law days', () => {
  const settings = normalizeSettings({ examDate: '2027-01-12', mockExams: [], cycleDefs: legacyCycles() });
  const subjects = [...Array(5).fill('민사법'), ...Array(3).fill('형사법'), ...Array(2).fill('공법')];
  for (let rotation = 1; rotation <= 6; rotation++) {
    subjects.forEach((subject, i) => {
      const info = getCycleInfo(addDays(settings.examDate, -10 * rotation + i), settings);
      assert.equal(info.subject, subject);
      assert.equal(info.blockDays, subject === '민사법' ? 5 : subject === '형사법' ? 3 : 2);
      assert.equal(info.dayInBlock, i < 5 ? i + 1 : i < 8 ? i - 4 : i - 7);
      assert.equal(info.dayInCycle, i + 1);
      assert.equal(info.cycleDays, 10);
      assert.equal(info.rotation, rotation);
      assert.equal(info.isBlockLast, [4, 7, 9].includes(i));
      assert.equal(info.isCycleLast, i === 9);
    });
  }
});

test('mock and final exam boundaries, disabled cycles and missing anchors still work', () => {
  const settings = normalizeSettings({
    cycleDefs: legacyCycles(), examDate: '2027-01-12',
    mockExams: [{ start: '2026-11-10', end: '2026-11-13', label: '모의고사' }],
  });
  const before = getCycleInfo('2026-11-09', settings);
  assert.equal(before.subject, '공법');
  assert.equal(before.dayInBlock, 2);
  assert.equal(before.anchorLabel, '모의고사');
  for (let i = 0; i < 4; i++) assert.equal(getCycleInfo(addDays('2026-11-10', i), settings), null);
  assert.equal(getCycleInfo('2026-11-14', settings).anchorDate, settings.examDate);
  for (let i = 0; i < 7; i++) assert.equal(getCycleInfo(addDays(settings.examDate, i), settings), null);
  assert.equal(getCycleInfo('2026-11-09', { ...settings, cycleEnabled: false }), null);
  assert.equal(getCycleInfo('2026-11-09', { ...settings, examDate: '', mockExams: [] }), null);
});

test('calendar and settings render the migrated 5/3/2 cycle only', () => {
  const settings = normalizeSettings({ cycleDefs: legacyCycles(), examDate: '2026-11-14', mockExams: [] });
  const calendar = renderToStaticMarkup(React.createElement(CalendarView, {
    today: '2026-11-01', logs: {}, reviews: [], todos: {}, settings, tracks: {}, moods: {},
  }));
  const preferences = renderToStaticMarkup(React.createElement(SettingsView, { settings, user: { displayName: 'Test' } }));
  for (const markup of [calendar, preferences]) {
    assert.ok(markup.includes('5·3·2 회독'));
    assert.ok(!markup.includes('사이클 1'));
    assert.ok(!markup.includes('사이클 2'));
  }
  assert.match(calendar, /블록 3\/3일/);
});
