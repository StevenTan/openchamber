import type { getOctokitForAccountId, getOctokitForHost, SourceControlIdentity } from './octokit.js';
import type { resolveGitHubRepoFromDirectory } from './repo/index.js';
import type { resolveRepoNetwork } from './repo/fork-detection.js';

interface Repository { owner: string; repo: string }

export interface ChangeRequestPatchInput {
  session?: { accountId: string };
  directory: string;
  remote: string;
  number: number;
  sourceRepo?: Repository | null;
  linked?: boolean;
}

export interface ChangeRequestFileInput extends ChangeRequestPatchInput {
  path: string;
  previousPath?: string;
  status?: string;
  binary?: boolean;
}

export interface ChangeRequestPatchDependencies {
  resolveGitHubRepoFromDirectory?: typeof resolveGitHubRepoFromDirectory;
  resolveRepoNetwork?: typeof resolveRepoNetwork;
  getOctokitForHost?: typeof getOctokitForHost;
  getOctokitForAccountId?: typeof getOctokitForAccountId;
  onAccountUnavailable?: (identity: SourceControlIdentity) => void | Promise<void>;
}

export function readGitHubChangeRequestPatch(input: ChangeRequestPatchInput, dependencies?: ChangeRequestPatchDependencies): Promise<{
  patch: string;
  meta: Repository & { number: number };
}>;

export function readGitHubChangeRequestFile(input: ChangeRequestFileInput, dependencies?: ChangeRequestPatchDependencies): Promise<{
  original: string;
  modified: string;
}>;
