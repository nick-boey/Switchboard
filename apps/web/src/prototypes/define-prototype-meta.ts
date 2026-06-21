import type { Meta } from '@storybook/react-vite';
import { PROTOTYPE_TAGS } from '../storybook/derive-prototype-title';

/**
 * Pre-fill a prototype story's `meta` with the quarantine tags (`prototype`, `!autodocs`) from the
 * single shared constant. Spread it into the meta literal — Storybook's static indexer rejects
 * `export default definePrototypeMeta(...)`:
 *
 * ```ts
 * const meta = { ...definePrototypeMeta({ component: MyComponent }) } satisfies Meta<typeof MyComponent>;
 * ```
 *
 * It takes no `change-name` argument and sets no `title`: the `.storybook-prototypes` indexer owns
 * titles, deriving `Prototypes/<change>/<name>` from the file location. Caller `component`,
 * `parameters`, `args`, and any caller-supplied `tags` are preserved (the quarantine tags are
 * always present).
 */
export function definePrototypeMeta<M extends Omit<Meta, 'title'>>(
  meta: M & { title?: never },
): M & { tags: string[] } {
  return { ...meta, tags: [...PROTOTYPE_TAGS, ...(meta.tags ?? [])] };
}
