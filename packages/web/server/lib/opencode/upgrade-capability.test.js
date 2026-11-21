import { describe, expect, it } from 'vitest';
import { resolveOpenCodeUpgradeCapability } from './upgrade-capability.js';

describe('OpenCode upgrade capability', () => {
  it('never upgrades external or unresolved runtimes', () => {

    expect(resolveOpenCodeUpgradeCapability({
      isExternal: true,
      hasManagedProcess: false,
      activeBinary: null,
    })).toEqual({
      supported: false,
      manager: 'external',
      reason: 'external',
    });
    expect(resolveOpenCodeUpgradeCapability({
      isExternal: false,
      hasManagedProcess: false,
      activeBinary: '/usr/local/bin/opencode',
    })).toEqual({
      supported: false,
      manager: null,
      reason: 'unavailable',
    });
  });

  it('leaves a binary pinned by the policy file to the administrator', () => {
    expect(resolveOpenCodeUpgradeCapability({
      isExternal: false,
      hasManagedProcess: true,
      activeBinary: '/opt/acme/opencode',
      pinnedByPolicy: true,
    })).toEqual({
      supported: false,
      manager: 'administrator',
      reason: 'policy',
    });
  });

  it('offers CLI upgrades for a managed binary', () => {
    expect(resolveOpenCodeUpgradeCapability({
      isExternal: false,
      hasManagedProcess: true,
      activeBinary: '/Users/alice/.opencode/bin/opencode',
    })).toEqual({
      supported: true,
      manager: 'opencode',
      reason: null,
    });
  });
});
