export const SEMANTIC_TYPOGRAPHY = {
  markdown: '0.875rem',
  code: '0.8125rem',
  uiHeader: '0.875rem',
  uiLabel: '0.84375rem',
  uiSection: '0.9375rem',
  meta: '0.78125rem',
  micro: '0.75rem',
  settingsPageTitle: '1.0625rem',
} as const;

export const VSCODE_TYPOGRAPHY = {
  markdown: '0.8438rem',
  code: '0.8125rem',
  uiHeader: '0.8438rem',
  uiLabel: '0.7813rem',
  uiSection: '0.9375rem',
  meta: '0.7813rem',
  micro: '0.75rem',
  settingsPageTitle: '1rem',
} as const;

export type SemanticTypographyKey = keyof typeof SEMANTIC_TYPOGRAPHY;

function getTypographyVariable(key: SemanticTypographyKey): string {
  return `--text-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

export const DEFAULT_INTERFACE_FONT_SIZE = 16;
export const DEFAULT_CHAT_FONT_SIZE = 16;
export const DEFAULT_APP_ZOOM = 100;

export function getInterfaceTypographyStyle(
  pixels: number,
  base: Record<SemanticTypographyKey, string> = SEMANTIC_TYPOGRAPHY,
): Record<string, string> {
  const scale = pixels / (Number.parseFloat(base.uiLabel) * 16);
  const entries = Object.entries(base) as Array<[SemanticTypographyKey, string]>;
  const utilities = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48 };
  return Object.fromEntries([
    ...entries.map(([key, size]) => [getTypographyVariable(key), `${Number.parseFloat(size) * 16 * scale}px`]),
    ...Object.entries(utilities).map(([key, size]) => [`--text-${key}`, `${size * scale}px`]),
  ]);
}

export const getChatTypographyStyle = (pixels: number) => ({
  '--text-markdown': `${pixels}px`,
});

/** Root typography tokens are authored in rem and set in px by preferences. */
export const typographyPixels = (value: string, rem: number): number =>
  Number.parseFloat(value) * (value.trim().endsWith('rem') ? rem : 1);

export const legacyInterfaceFontPixels = (
  percent: number,
  base: Record<SemanticTypographyKey, string> = SEMANTIC_TYPOGRAPHY,
): number => Number.parseFloat(base.uiLabel) * 16 * percent / 100;
export const legacyChatFontPixels = (
  interfacePercent: number,
  chatPercent: number,
  base: Record<SemanticTypographyKey, string> = SEMANTIC_TYPOGRAPHY,
): number => Number.parseFloat(base.markdown) * 16 * interfacePercent / 100 * chatPercent / 100;

export const typography = {

  semanticMarkdown: {
    fontSize: 'var(--text-markdown)',
  },

   semanticCode: {
     fontSize: 'var(--text-code)',
   },

  uiHeader: {
    fontSize: 'var(--text-ui-header)',
  },

  uiLabel: {
    fontSize: 'var(--text-ui-label)',
  },

  meta: {
    fontSize: 'var(--text-meta)',
  },

  micro: {
    fontSize: 'var(--text-micro)',
  },

  ui: {
    button: {
      fontSize: 'var(--text-ui-label)',
      lineHeight: 'var(--ui-button-line-height)',
      letterSpacing: 'var(--ui-button-letter-spacing)',
      fontWeight: 'var(--ui-button-font-weight)',
    },
    buttonSmall: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--ui-button-small-line-height)',
      letterSpacing: 'var(--ui-button-small-letter-spacing)',
      fontWeight: 'var(--ui-button-small-font-weight)',
    },
    buttonLarge: {
      fontSize: 'var(--text-ui-label)',
      lineHeight: 'var(--ui-button-large-line-height)',
      letterSpacing: 'var(--ui-button-large-letter-spacing)',
      fontWeight: 'var(--ui-button-large-font-weight)',
    },
    label: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--ui-label-line-height)',
      letterSpacing: 'var(--ui-label-letter-spacing)',
      fontWeight: 'var(--ui-label-font-weight)',
    },
    caption: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--ui-caption-line-height)',
      letterSpacing: 'var(--ui-caption-letter-spacing)',
      fontWeight: 'var(--ui-caption-font-weight)',
    },
    badge: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--ui-badge-line-height)',
      letterSpacing: 'var(--ui-badge-letter-spacing)',
      fontWeight: 'var(--ui-badge-font-weight)',
    },
    tooltip: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--ui-tooltip-line-height)',
      letterSpacing: 'var(--ui-tooltip-letter-spacing)',
      fontWeight: 'var(--ui-tooltip-font-weight)',
    },
    input: {
      fontSize: 'var(--text-ui-label)',
      lineHeight: 'var(--ui-input-line-height)',
      letterSpacing: 'var(--ui-input-letter-spacing)',
      fontWeight: 'var(--ui-input-font-weight)',
    },
    helperText: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--ui-helper-text-line-height)',
      letterSpacing: 'var(--ui-helper-text-letter-spacing)',
      fontWeight: 'var(--ui-helper-text-font-weight)',
    },
  },

  code: {
    inline: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-inline-line-height)',
      letterSpacing: 'var(--code-inline-letter-spacing)',
      fontWeight: 'var(--code-inline-font-weight)',
    },
    block: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-block-line-height)',
      letterSpacing: 'var(--code-block-letter-spacing)',
      fontWeight: 'var(--code-block-font-weight)',
    },
    lineNumbers: {
      fontSize: 'var(--text-micro)',
      lineHeight: 'var(--code-line-numbers-line-height)',
      letterSpacing: 'var(--code-line-numbers-letter-spacing)',
      fontWeight: 'var(--code-line-numbers-font-weight)',
    },
  },

   markdown: {
    body: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-body-line-height)',
      letterSpacing: 'var(--markdown-body-letter-spacing)',
      fontWeight: 'var(--markdown-body-font-weight)',
    },
    bodySmall: {
      fontSize: 'var(--text-meta)',
      lineHeight: 'var(--markdown-body-small-line-height)',
      letterSpacing: 'var(--markdown-body-small-letter-spacing)',
      fontWeight: 'var(--markdown-body-small-font-weight)',
    },
    bodyLarge: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-body-large-line-height)',
      letterSpacing: 'var(--markdown-body-large-letter-spacing)',
      fontWeight: 'var(--markdown-body-large-font-weight)',
    },
    blockquote: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-blockquote-line-height)',
      letterSpacing: 'var(--markdown-blockquote-letter-spacing)',
      fontWeight: 'var(--markdown-blockquote-font-weight)',
    },
    list: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-list-line-height)',
      letterSpacing: 'var(--markdown-list-letter-spacing)',
      fontWeight: 'var(--markdown-list-font-weight)',
    },
    link: {
      fontSize: 'var(--text-markdown)',
      lineHeight: 'var(--markdown-link-line-height)',
      letterSpacing: 'var(--markdown-link-letter-spacing)',
      fontWeight: 'var(--markdown-link-font-weight)',
    },
    code: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--markdown-code-line-height)',
      letterSpacing: 'var(--markdown-code-letter-spacing)',
      fontWeight: 'var(--markdown-code-font-weight)',
    },
    codeBlock: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--markdown-code-block-line-height)',
      letterSpacing: 'var(--markdown-code-block-letter-spacing)',
      fontWeight: 'var(--markdown-code-block-font-weight)',
    },
  },

  tool: {

    collapsed: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-block-line-height)',
      letterSpacing: 'var(--code-block-letter-spacing)',
      fontWeight: 'var(--code-block-font-weight)',
    },

    popup: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-block-line-height)',
      letterSpacing: 'var(--code-block-letter-spacing)',
      fontWeight: 'var(--code-block-font-weight)',
    },

    inline: {
      fontSize: 'var(--text-code)',
      lineHeight: 'var(--code-inline-line-height)',
      letterSpacing: 'var(--code-inline-letter-spacing)',
      fontWeight: 'var(--code-inline-font-weight)',
    },
  },
};

export const toolDisplayStyles = {

  padding: {
    collapsed: '0.375rem',
    popup: '0.75rem',
    popupContainer: '1rem',
  },

  backgroundOpacity: {
    muted: '30',
    mutedAlt: '50',
  },

  getCollapsedStyles: () => ({
    ...typography.tool.collapsed,
    background: 'transparent',
    backgroundColor: 'transparent',
    margin: 0,
    padding: toolDisplayStyles.padding.collapsed,
    borderRadius: 0,
  }),

  getPopupStyles: () => ({
    ...typography.tool.popup,
    background: 'transparent',
    backgroundColor: 'transparent',
    margin: 0,
    padding: toolDisplayStyles.padding.popup,
    borderRadius: '0.75rem',
  }),

  getPopupContainerStyles: () => ({
    ...typography.tool.popup,
    background: 'transparent',
    backgroundColor: 'transparent',
    margin: 0,
    padding: toolDisplayStyles.padding.popupContainer,
    borderRadius: '0.5rem',
    overflowX: 'auto' as const,
  }),

  getInlineStyles: () => ({
    ...typography.tool.inline,
  }),
};
