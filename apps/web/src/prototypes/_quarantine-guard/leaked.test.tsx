import { it } from 'vitest';

// QUARANTINE POISON PILL — must never be collected by the unit run.
//
// It lives in a sketch folder (a per-change folder under src/prototypes/) and exists only so the
// prototype quarantine can be proven: per-change sketch tests stay excluded even after the Vitest
// exclude was narrowed so shared root modules ARE collected. If this test ever runs, the
// quarantine has regressed — see ../quarantine-guard.test.ts and the exclude arrays in both
// vitest.config.ts files. (Line comments only: the narrowed glob pattern would close a block
// comment early.)
it('sketch-folder co-located test must never be collected by the unit run', () => {
  throw new Error(
    'Quarantine breach: a co-located test under a src/prototypes sketch folder was collected by the unit run.',
  );
});
