// @ts-check
import { defineConfig } from 'astro/config';

// Minimal Astro documentation shell for Switchboard.
//
// The architecture model lives in `../docs/dev/Architecture/*.c4` and is the
// permanent LikeC4 base model (foundations Decision 9). It is validated and
// rendered with the pinned `likec4` CLI declared alongside Astro in this
// package — see the `arch:*` scripts in package.json, e.g.
//   pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture
//   pnpm --dir site run arch        # interactive view server
//   pnpm --dir site run arch:build  # static LikeC4 site
export default defineConfig({
  srcDir: './src',
});
