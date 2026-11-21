export const parseEnvelope = (raw: string): { type: string; properties: unknown } | null => {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const type = typeof parsed?.type === 'string' ? parsed.type : '';
    const properties = parsed?.properties;
    if (!type) {
      return null;
    }
    return { type, properties };
  } catch {
    return null;
  }
};

export const getEventProperties = (properties: unknown): Record<string, unknown> | null => {
  if (!properties || typeof properties !== 'object') {
    return null;
  }
  return properties as Record<string, unknown>;
};
