export interface OpenCodeUpgradeInput {
  isExternal: boolean;
  hasManagedProcess: boolean;
  activeBinary: string | null | undefined;
  pinnedByPolicy?: boolean;
}

export type OpenCodeUpgradeCapability =
  | { supported: false; manager: 'external'; reason: 'external' }
  | { supported: false; manager: 'administrator'; reason: 'policy' }
  | { supported: false; manager: null; reason: 'unavailable' }
  | { supported: true; manager: 'opencode'; reason: null };

export const resolveOpenCodeUpgradeCapability = ({
  isExternal,
  hasManagedProcess,
  activeBinary,
  pinnedByPolicy = false,
}: OpenCodeUpgradeInput): OpenCodeUpgradeCapability => {
  if (isExternal) {
    return {
      supported: false,
      manager: 'external',
      reason: 'external',
    };
  }

  if (pinnedByPolicy) {
    return {
      supported: false,
      manager: 'administrator',
      reason: 'policy',
    };
  }

  if (!hasManagedProcess || !activeBinary) {
    return {
      supported: false,
      manager: null,
      reason: 'unavailable',
    };
  }

  return {
    supported: true,
    manager: 'opencode',
    reason: null,
  };
};
