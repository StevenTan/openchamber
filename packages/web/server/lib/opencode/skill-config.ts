import { readConfigLayers } from './config-files.js';

const hasSkillPaths = (value: unknown): value is { paths?: unknown } => value != null;
const isUnknownList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

export function configuredSkillPaths(workingDirectory: string | null): readonly unknown[] {
  try {
    const layers = readConfigLayers(workingDirectory);
    return [layers.userConfig, layers.userOverrideConfig, layers.projectConfig, layers.customConfig].flatMap(config => {
      const configured = config.skills;
      return isUnknownList(configured)
        ? configured
        : (hasSkillPaths(configured) && isUnknownList(configured.paths) ? configured.paths : []);
    });
  } catch {
    return [];
  }
}
