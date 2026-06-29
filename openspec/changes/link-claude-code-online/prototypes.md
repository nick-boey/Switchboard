# Prototypes: link-claude-code-online

Ledger for the UI prototypes of this change. One row per `*.stories.tsx` file under
`src/prototypes/link-claude-code-online/`. The filesystem is authoritative: every prototype file on
disk MUST have exactly one row, and there MUST be no rows for files that no longer exist. Archiving
is blocked while any row is `open` or any file on disk is unlisted.

| Story file | Explores | Disposition | Status |
| --- | --- | --- | --- |
| claude-web-link.stories.tsx | The "open in Claude web" deep-link affordance: placement beside the plug vs far-right, its absent-until-bridge-id-resolves behaviour across session states, and its resting/hover icon treatment | open | open |
