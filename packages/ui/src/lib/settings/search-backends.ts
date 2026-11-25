import type { SettingsSearchItem } from './search';

export const BACKEND_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  {
    id: 'sessions.opencode-binary',
    page: 'general',
    titleKey: 'settings.openchamber.opencodeCli.field.binaryPath',
    keywords: ['opencode', 'cli', 'binary', 'path'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    id: 'sessions.opencode-restart',
    page: 'general',
    titleKey: 'settings.openchamber.opencodeCli.actions.restart',
    keywords: ['opencode', 'restart', 'reload', 'plugin'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  { id: 'general.antigravity-binary', page: 'general', titleKey: 'settings.backends.binary', keywords: ['antigravity', 'agy', 'cli', 'binary'], isAvailable: ctx => !ctx.isVSCode && !ctx.enterpriseMode },
  { id: 'general.antigravity-login', page: 'general', titleKey: 'settings.backends.login', descriptionKey: 'settings.backends.install', keywords: ['antigravity', 'google', 'login', 'agy', 'install', 'download'], isAvailable: ctx => !ctx.isVSCode && !ctx.enterpriseMode },
];
