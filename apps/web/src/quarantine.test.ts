import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * Quarantine guard (task 8.7): the ESLint `no-restricted-imports` rule fails app code under `src/`
 * that imports from `src/prototypes/**`, while the matured primitives import cleanly from their
 * production paths. Runs the real flat config (eslint.config.js) over virtual fixtures.
 */
const eslint = new ESLint();

async function restrictedImportCount(source: string): Promise<number> {
  const [result] = await eslint.lintText(source, {
    filePath: 'apps/web/src/__quarantine_fixture__.tsx',
  });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('prototype quarantine guard', () => {
  it('fails app code importing from prototypes/**', async () => {
    const count = await restrictedImportCount(
      "import { kit } from '../../prototypes/ui-prototypes-mvp/kit';\nexport const x = kit;\n",
    );
    expect(count).toBeGreaterThan(0);
  });

  it('allows app code importing the matured primitives from their production paths', async () => {
    const count = await restrictedImportCount(
      "import { Card } from './ui/surface';\nimport { Plug } from './ui/plug';\nexport const x = [Card, Plug];\n",
    );
    expect(count).toBe(0);
  });
});
