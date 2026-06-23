import { describe, expect, it } from 'vitest';
import type { RepoListResponse } from '@switchboard/shared';
import {
  cloneTargetFromSelection,
  cloneTargetFromUrl,
  isOwnerValid,
  isRepoValid,
  reposForOwner,
  selectableOwners,
} from './repo-selection';

/**
 * Failing-first logic tests for the New repository screen's selection/validation (task 8.1):
 * owners = account + orgs, owner-scoped repos, the personal-account and organisation happy paths,
 * and From-URL parsing with `.git` normalized away.
 */
const listing: RepoListResponse = {
  status: 'ok',
  owners: [
    { login: 'nick-boey', kind: 'user' },
    { login: 'acme', kind: 'organisation' },
  ],
  repositories: [
    { owner: 'nick-boey', name: 'switchboard' },
    { owner: 'acme', name: 'widget-factory' },
  ],
};

describe('repo selection (Select repository)', () => {
  it('offers the authenticated account and organisations as owners', () => {
    expect(selectableOwners(listing).map((o) => o.login)).toEqual(['nick-boey', 'acme']);
    expect(selectableOwners({ status: 'not-configured' })).toEqual([]);
  });

  it('scopes repositories to the selected owner', () => {
    expect(reposForOwner(listing, 'acme')).toEqual(['widget-factory']);
    expect(reposForOwner(listing, 'nick-boey')).toEqual(['switchboard']);
  });

  it('enables a personal-account repository (happy path)', () => {
    expect(isOwnerValid(listing, 'nick-boey')).toBe(true);
    expect(isRepoValid(listing, 'nick-boey', 'switchboard')).toBe(true);
    expect(cloneTargetFromSelection(listing, 'nick-boey', 'switchboard')).toBe(
      'nick-boey/switchboard',
    );
  });

  it('enables an organisation repository (happy path)', () => {
    expect(cloneTargetFromSelection(listing, 'acme', 'widget-factory')).toBe('acme/widget-factory');
  });

  it('rejects an invalid owner or repository', () => {
    expect(cloneTargetFromSelection(listing, 'ghost', 'x')).toBeNull();
    expect(cloneTargetFromSelection(listing, 'acme', 'not-a-repo')).toBeNull();
  });
});

describe('repo selection (From URL)', () => {
  it('parses a full URL, a bare owner/repo, and normalizes a trailing .git', () => {
    expect(cloneTargetFromUrl('https://github.com/acme/widget-factory')).toBe(
      'acme/widget-factory',
    );
    expect(cloneTargetFromUrl('https://github.com/acme/widget-factory.git')).toBe(
      'acme/widget-factory',
    );
    expect(cloneTargetFromUrl('octocat/Hello-World')).toBe('octocat/Hello-World');
  });

  it('rejects an unparseable value', () => {
    expect(cloneTargetFromUrl('../evil')).toBeNull();
    expect(cloneTargetFromUrl('')).toBeNull();
  });
});
