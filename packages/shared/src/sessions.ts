import { z } from 'zod';
import { isValidRepoId } from './repos.js';
import { isValidWorktreeId, slugForBranch } from './worktrees.js';
import { sha256Hex } from './sha256.js';

/**
 * Claude-session-launch slice contracts (design Decisions 1, 4, 5, 8). Owned by `packages/shared`
 * so the server validates and the web client consumes one source of truth.
 *
 * The tmux session name **reuses the canonical path-safe primitives** (`slugForBranch` +
 * `sha256Hex`) that `idForBranch` is built from — not a parallel scheme — over `(repo-id, wt-id)`,
 * so the same branch in two repos still gets distinct names (tmux is one flat namespace). It is
 * pure, deterministic, and browser-safe (vendored sync SHA-256, no `node:*`), so it lives in the
 * barrel module beside `idForBranch`.
 */

/** Hash suffix length — 12 hex chars (48 bits), the same backstop philosophy as `<wt-id>`. */
const HASH_LEN = 12;
/** Fixed prefix so Switchboard sessions are identifiable in `tmux ls` and never collide with the user's. */
const SESSION_PREFIX = 'sb-';
/**
 * A valid tmux session name: the `sb-` prefix, a lowercase slug of `[a-z0-9-]` (no `.`/`:`/`/`/
 * whitespace — tmux reserves `.` and `:`), the `--` separator, and exactly 12 hex of hash.
 */
const TMUX_SESSION_NAME = /^sb-[a-z0-9-]+--[0-9a-f]{12}$/;

/**
 * Derive the deterministic, tmux-safe session name for a worktree from `(repoId, wtId)` (Decision
 * 1). Composes the SAME primitives `idForBranch` uses — `slugForBranch` for the recognisable slug
 * and `sha256Hex` for the collision-resistant suffix — keyed on the EXACT `repoId/wtId` (not the
 * branch-only `<wt-id>`, which collides across repos in tmux's flat namespace). The shared slug
 * charset permits `.`, which tmux treats as a `window.pane` separator, so any `.` is folded to `-`
 * after composition, yielding a legal tmux session name. Forward-derivation only — the name is
 * lossy and is never decoded back into a branch (Decision 1).
 */
export function tmuxSessionName(repoId: string, wtId: string): string {
  const slug = slugForBranch(`${repoId} ${wtId}`);
  const hash = sha256Hex(`${repoId}/${wtId}`).slice(0, HASH_LEN);
  // tmux-safety pass: fold the slug-charset's `.` to `-` (tmux reserves `.` and `:`).
  return `${SESSION_PREFIX}${slug}--${hash}`.replace(/\./g, '-');
}

/**
 * True when `value` is a well-formed tmux session name (defence in depth — re-checks the shape a
 * derived name must have, mirroring `isValidWorktreeId`). Rejects a missing prefix, reserved
 * characters, and a missing/short hash.
 */
export function isValidTmuxSessionName(value: string): boolean {
  return TMUX_SESSION_NAME.test(value);
}

// --- Launch / stop request schemas (Decision 8) -----------------------------

/**
 * The session launch request: a canonical `<repo-id>` + a valid `<wt-id>`. Malformed ids fail Zod
 * (→ `422`, handler not run). Keyed by `(repo-id, wt-id)` — never the branch (which is sensitive).
 */
export const sessionLaunchRequestSchema = z.object({
  repoId: z.string().refine(isValidRepoId, { message: 'invalid repoId' }),
  wtId: z.string().refine(isValidWorktreeId, { message: 'invalid wtId' }),
});
export type SessionLaunchRequest = z.infer<typeof sessionLaunchRequestSchema>;

/** The session stop request — the same `(repo-id, wt-id)` shape as launch. */
export const sessionStopRequestSchema = z.object({
  repoId: z.string().refine(isValidRepoId, { message: 'invalid repoId' }),
  wtId: z.string().refine(isValidWorktreeId, { message: 'invalid wtId' }),
});
export type SessionStopRequest = z.infer<typeof sessionStopRequestSchema>;

// --- Session summary + list response (Decision 4) ---------------------------

/**
 * The plug's session status (Decision 5): `off` (no live session), `starting` (a launch is in
 * flight), `on` (a live session), `error` (a launch or stop failed). The web maps this to the
 * plug's visual; the server reports the launch op status + tmux liveness, from which it is derived.
 */
export const plugSessionStatusSchema = z.enum(['off', 'starting', 'on', 'error']);
export type PlugSessionStatus = z.infer<typeof plugSessionStatusSchema>;

/**
 * One listed session: existence + worktree mapping ONLY (Decision 4). Listing reports live sessions
 * (`status: 'on'`) for the repo's existing worktrees; it carries NO conversation metadata (model,
 * context, last message) — that is the mobile app's domain.
 */
export const sessionSummarySchema = z.object({
  repoId: z.string(),
  wtId: z.string(),
  status: z.literal('on'),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** The per-repository session-list response: existence + mapping for the repo's live sessions. */
export const sessionListResponseSchema = z.object({
  repoId: z.string(),
  sessions: z.array(sessionSummarySchema),
});
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
