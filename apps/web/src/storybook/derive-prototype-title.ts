/**
 * The quarantine tags every prototype story carries. `prototype` marks it for filtering;
 * `!autodocs` keeps it out of autodocs. A single shared constant so the indexer and the
 * `definePrototypeMeta` helper cannot disagree (design Decision: "tags only" helper +
 * "Location-based indexer"). The leading `!` is Storybook's tag-negation syntax.
 */
export const PROTOTYPE_TAGS = ['prototype', '!autodocs'] as const;

const PROTOTYPES_SEGMENT = '/prototypes/';
const STORY_EXTENSION = /\.stories\.[jt]sx?$/;

/**
 * Derive a prototype story's sidebar title from its file location:
 * `…/src/prototypes/<change>/<name>.stories.tsx` → `Prototypes/<change>/<name>`, preserving any
 * intermediate directories. The prototype config's indexer assigns this single title to the file,
 * so Storybook nests each named export beneath it — overriding any hand-written `title`. Pure and
 * separator-agnostic so it is trivially unit-tested apart from Storybook's indexer API.
 */
export function derivePrototypeTitle(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  const segmentIndex = normalized.lastIndexOf(PROTOTYPES_SEGMENT);
  const relativeToPrototypes =
    segmentIndex === -1 ? normalized : normalized.slice(segmentIndex + PROTOTYPES_SEGMENT.length);
  return `Prototypes/${relativeToPrototypes.replace(STORY_EXTENSION, '')}`;
}
