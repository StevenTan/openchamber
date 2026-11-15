import * as vscode from 'vscode';
import * as os from 'os';
import { getThemeKindName } from './theme';
import type { ConnectionStatus } from './opencode';
import type { WorkspaceFolderCandidate } from './workspaceResolver';

export interface WebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  workspaceFolder: string;
  workspaceFolders?: WorkspaceFolderCandidate[];
  initialStatus: ConnectionStatus;
  cliAvailable: boolean;
  initialSessionId?: string;
  /** A new-session editor tab that opens its draft in "Run on several models" mode. */
  initialComposer?: 'parallel';
  viewMode?: 'sidebar' | 'editor';
  panelType?: 'chat' | 'settings';
  devServerUrl?: string | null;
  extensionVersion?: string;
}

const asCspToken = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toOrigin = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const uniqueTokens = (values: Array<string | null | undefined>): string => {
  return Array.from(new Set(values.map(asCspToken).filter((value): value is string => Boolean(value)))).join(' ');
};

export const getCspBootstrapHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
</head>
<body></body>
</html>`;

export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const {
    webview,
    extensionUri,
    workspaceFolder,
    workspaceFolders = [],
    initialStatus,
    cliAvailable,
    initialSessionId,
    initialComposer,
    viewMode = 'sidebar',
    panelType = 'chat',
    devServerUrl,
    extensionVersion = '',
  } = options;
  const workspaceFolderJson = JSON.stringify(workspaceFolder).replace(/</g, '\\u003c');
  const workspaceFoldersJson = JSON.stringify(workspaceFolders).replace(/</g, '\\u003c');

  const scriptPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'assets', 'index.js');
  const scriptUri = webview.asWebviewUri(scriptPath);
  const normalizedDevServerUrl = asCspToken(devServerUrl)?.replace(/\/$/, '') ?? null;
  const devServerOrigin = toOrigin(normalizedDevServerUrl);
  const styleSrc = uniqueTokens([webview.cspSource, "'unsafe-inline'", devServerOrigin]);
  const scriptSrc = uniqueTokens([webview.cspSource, "'unsafe-inline'", "'unsafe-eval'", devServerOrigin]);
  const connectSrc = uniqueTokens(['*', 'ws:', 'wss:', 'http:', 'https:', devServerOrigin]);
  const imgSrc = uniqueTokens([webview.cspSource, 'data:', 'https:', devServerOrigin]);
  const fontSrc = uniqueTokens([webview.cspSource, 'data:', devServerOrigin]);
  // fflate's async browser inflater creates blob-backed workers. Keep blob:
  // scoped to worker-src so document decompression works without allowing blob scripts.
  const workerSrc = uniqueTokens([webview.cspSource, 'blob:', devServerOrigin]);

  const themeKind = getThemeKindName(vscode.window.activeColorTheme.kind);

  // Use VS Code CSS variables for proper theme integration
  // These variables are automatically provided by VS Code to webviews
  //
  // The logo markup between the brand:flat-logo markers is written by
  // scripts/brand/generate.mjs, the same drawing as OpenChamberLogo.tsx.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${styleSrc}; script-src ${scriptSrc}; connect-src ${connectSrc}; img-src ${imgSrc}; media-src ${imgSrc}; font-src ${fontSrc}; worker-src ${workerSrc};">
  <style>
    html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
    body { 
      overflow: hidden; 
      background: var(--vscode-editor-background, var(--vscode-sideBar-background)); 
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--vscode-foreground);
    }
    
    /* Initial loading screen styles - uses VS Code theme variables */
    #initial-loading {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 9999;
      background: var(--vscode-editor-background, var(--vscode-sideBar-background));
      transition: opacity 0.3s ease-out;
    }
    #initial-loading.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    /* The logo is drawn in currentColor: the VS Code foreground. */
    #initial-loading .logo {
      color: var(--vscode-foreground);
    }
    #initial-loading .status-text {
      font-size: 13px;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      text-align: center;
    }
    #initial-loading .error-text {
      font-size: 12px;
      color: var(--vscode-errorForeground, #f48771);
      text-align: center;
      max-width: 280px;
    }
  </style>
  <title>OpenChamber</title>
</head>
<body>
  <!-- Initial loading screen with the OpenChamber logo -->
  <div id="initial-loading">
    <svg class="logo" width="70" height="70" viewBox="-50 -50 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- brand:flat-logo:start --><defs>
    <linearGradient id="oc-logo-front" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#2469ED" />
      <stop offset="0.42" stop-color="#2F80ED" />
      <stop offset="1" stop-color="#4B9EF0" />
    </linearGradient>
    <radialGradient id="oc-logo-frontLift" gradientUnits="userSpaceOnUse" cx="330" cy="430" r="470">
      <stop offset="0" stop-color="#5794FA" stop-opacity="0.20" />
      <stop offset="0.62" stop-color="#4788F0" stop-opacity="0.07" />
      <stop offset="1" stop-color="#4788F0" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="oc-logo-rear" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#A9C8FF" />
      <stop offset="0.55" stop-color="#91B9F6" />
      <stop offset="1" stop-color="#A5B8F2" />
    </linearGradient>
    <path id="oc-logo-rear-shape" d="M547 327 L731 274 C792 256 847 297 847 362 L847 682 C847 747 789 783 732 765 L547 710 L547 578 L691 626 C711 633 726 619 726 600 L726 445 C726 425 711 414 691 421 L547 469 Z" />
    <path id="oc-logo-front-shape" d="M245 332 L531 219 C579 200 624 225 624 270 L624 745 C624 794 581 824 537 807 L246 696 C221 686 207 666 207 640 L207 389 C207 363 220 342 245 332 Z" />
  </defs><g transform="translate(-75.285714 -73.142857) scale(0.142857142857)"><g data-brand-panel="rear" data-rest="0.72" data-lit="1"><use href="#oc-logo-rear-shape" fill="url(#oc-logo-rear)" fill-rule="evenodd"/></g><g data-brand-panel="front" data-rest="0.72" data-lit="1"><use href="#oc-logo-front-shape" fill="url(#oc-logo-front)"/><use href="#oc-logo-front-shape" fill="url(#oc-logo-frontLift)"/></g></g><!-- brand:flat-logo:end -->
    </svg>
    <!-- Status text stays empty while things are fine; populated only on error. -->
    <div class="status-text" id="loading-status"></div>
    ${!cliAvailable ? `<div class="error-text" id="cli-missing-text">OpenCode CLI not found. Please install it first.</div>` : ''}
  </div>
  
  <div id="root"></div>
  <script>
    // Loading panels alternate once per second while the splash is visible.
    (function () {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var step = 0;
      var timer = null;
      var tick = function () {
        var splash = document.getElementById('initial-loading');
        var panels = splash ? splash.querySelectorAll('[data-brand-panel]') : [];
        if (!panels.length || splash.classList.contains('fade-out')) { clearInterval(timer); return; }
        var lit = step % panels.length;
        panels.forEach(function (panel, i) {
          panel.setAttribute('opacity', panel.getAttribute(i === lit ? 'data-lit' : 'data-rest'));
        });
        step += 1;
      };
      tick();
      timer = setInterval(tick, 1000);
    })();

    // Polyfill process for Node.js modules running in browser
    window.process = window.process || { env: { NODE_ENV: 'production' }, platform: '', version: '', browser: true };

    window.__VSCODE_CONFIG__ = {
      workspaceFolder: ${workspaceFolderJson},
      workspaceFolders: ${workspaceFoldersJson},
      theme: "${themeKind}",
      connectionStatus: "${initialStatus}",
      cliAvailable: ${cliAvailable},
      extensionVersion: "${extensionVersion.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",
      platform: "${os.platform()}",
      arch: "${os.arch()}",
      viewMode: "${viewMode}",
      panelType: "${panelType}",
      initialSessionId: ${initialSessionId ? `"${initialSessionId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'},
      initialComposer: ${initialComposer ? `"${initialComposer}"` : 'null'},
    };
    window.__OPENCHAMBER_HOME__ = ${workspaceFolderJson};
    // VS Code's display language. The UI bundle uses it as the default locale
    // until the user picks one; the splash below picks its strings from it too.
    window.__OPENCHAMBER_HOST_LANGUAGE__ = ${JSON.stringify(vscode.env.language)};

    // OpenChamber's own saved locale wins; before one exists, VS Code's display
    // language decides, so a fresh install in a supported language never boots
    // in English.
    function resolveBootstrapLanguage() {
      try {
        var rawLocale = window.localStorage.getItem('openchamber.i18n.v1');
        if (rawLocale) {
          var parsedLocale = JSON.parse(rawLocale);
          if (parsedLocale && typeof parsedLocale.locale === 'string') return parsedLocale.locale.toLowerCase();
        }
      } catch {}
      return String(window.__OPENCHAMBER_HOST_LANGUAGE__ || '').toLowerCase();
    }

    function getBootstrapMessages() {
      var locale = 'en';
      var detected = resolveBootstrapLanguage();
      if (detected.indexOf('fr') === 0) {
        locale = 'fr';
      } else if (detected.indexOf('tr') === 0) {
        locale = 'tr';
      }

      if (locale === 'fr') {
        return {
          startingApi: 'Démarrage de l’API OpenCode…',
          initializing: 'Initialisation…',
          connecting: 'Connexion…',
          connected: 'Connecté !',
          connectionError: 'Erreur de connexion',
          reconnecting: 'Reconnexion…',
          cliNotFound: 'L’interface en ligne de commande OpenCode est introuvable. Veuillez l’installer d’abord.',
        };
      }
      if (locale === 'tr') {
        return {
          startingApi: 'OpenCode API başlatılıyor…',
          initializing: 'Başlatılıyor…',
          connecting: 'Bağlanıyor…',
          connected: 'Bağlandı!',
          connectionError: 'Bağlantı hatası',
          reconnecting: 'Yeniden bağlanıyor…',
          cliNotFound: 'OpenCode CLI bulunamadı. Lütfen önce kurun.',
        };
      }
      return {
        startingApi: 'Starting OpenCode API…',
        initializing: 'Initializing…',
        connecting: 'Connecting…',
        connected: 'Connected!',
        connectionError: 'Connection error',
        reconnecting: 'Reconnecting…',
        cliNotFound: 'OpenCode CLI not found. Please install it first.',
      };
    }

    (function applyBootstrapLocale() {
      var statusEl = document.getElementById('loading-status');
      var cliMissingEl = document.getElementById('cli-missing-text');
      var messages = getBootstrapMessages();
      if (cliMissingEl) {
        cliMissingEl.textContent = messages.cliNotFound;
      }
      if (statusEl) {
        statusEl.textContent = '';
      }
    })();

    // Handle connection status updates to update loading screen
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg && msg.type === 'connectionStatus') {
        var messages = getBootstrapMessages();
        var statusEl = document.getElementById('loading-status');
        if (statusEl) {
          // Only show text when something is wrong — progress states stay silent
          // (the animated logo already signals "working").
          if (msg.status === 'error') {
            statusEl.textContent = msg.error || messages.connectionError;
            statusEl.classList.add('error-text');
          } else {
            statusEl.textContent = '';
            statusEl.classList.remove('error-text');
          }
        }
      }
    });
  </script>
  <script type="module">
    const prodEntryUrl = ${JSON.stringify(scriptUri.toString())};
    const devServerUrl = ${normalizedDevServerUrl ? JSON.stringify(normalizedDevServerUrl) : 'null'};

    const loadProductionBundle = () => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = prodEntryUrl;
      document.body.appendChild(script);
    };

    if (!devServerUrl) {
      loadProductionBundle();
    } else {
      const baseUrl = devServerUrl;

      const statusEl = document.getElementById('loading-status');
      const getDevMessages = () => {
        const detected = resolveBootstrapLanguage();
        if (detected.indexOf('fr') === 0) {
          return {
            startingDevServer: (host) => 'Démarrage du serveur de développement de la webview (' + host + ')...',
            waitingDevServer: (host, attempt) => 'En attente du serveur de développement de la webview (' + host + ')... tentative ' + attempt,
          };
        }
        if (detected.indexOf('tr') === 0) {
          return {
            startingDevServer: (host) => 'Webview dev sunucusu başlatılıyor (' + host + ')...',
            waitingDevServer: (host, attempt) => 'Webview dev sunucusu bekleniyor (' + host + ')... deneme ' + attempt,
          };
        }
        return {
          startingDevServer: (host) => 'Starting webview dev server (' + host + ')...',
          waitingDevServer: (host, attempt) => 'Waiting for webview dev server (' + host + ')... attempt ' + attempt,
        };
      };
      const setStatus = (text) => {
        if (statusEl) {
          statusEl.textContent = text;
        }
      };

      const retryDelayMs = 500;
      let attempt = 0;

      const waitForRootMount = (timeoutMs) => {
        const root = document.getElementById('root');
        if (!root) {
          return Promise.resolve(false);
        }

        if (root.childNodes.length > 0) {
          return Promise.resolve(true);
        }

        return new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            if (root.childNodes.length > 0) {
              observer.disconnect();
              clearTimeout(timer);
              resolve(true);
            }
          });

          observer.observe(root, { childList: true, subtree: true });
          const timer = window.setTimeout(() => {
            observer.disconnect();
            resolve(root.childNodes.length > 0);
          }, timeoutMs);
        });
      };

      const tryLoadDevBundle = () => {
        const viteClientUrl = baseUrl + '/@vite/client';
        const reactRefreshUrl = baseUrl + '/@react-refresh';
        const devEntryUrl = baseUrl + '/main.tsx';
        const hostLabel = (() => {
          try {
            return new URL(baseUrl).host;
          } catch {
            return baseUrl;
          }
        })();

        const devMessages = getDevMessages();
        setStatus(devMessages.startingDevServer(hostLabel));

        Promise.resolve()
          .then(() => import(viteClientUrl))
          .then(() => import(reactRefreshUrl))
          .then((mod) => {
            const runtime = mod && mod.default ? mod.default : null;
            if (runtime && typeof runtime.injectIntoGlobalHook === 'function') {
              runtime.injectIntoGlobalHook(window);
              window.$RefreshReg$ = () => {};
              window.$RefreshSig$ = () => (type) => type;
              window.__vite_plugin_react_preamble_installed__ = true;
            }
          })
          .then(() => import(devEntryUrl))
          .then(() => waitForRootMount(4000))
          .then((mounted) => {
            if (!mounted) {
              throw new Error('Dev bundle loaded but app did not mount');
            }
          })
          .catch((error) => {
            attempt += 1;
            console.warn('[OpenChamber] VS Code webview dev bundle unavailable, retrying...', error);
            setStatus(devMessages.waitingDevServer(hostLabel, attempt));
            window.setTimeout(() => {
              tryLoadDevBundle();
            }, retryDelayMs);
          });
      };

      tryLoadDevBundle();
    }
  </script>
</body>
</html>`;
}
