export interface SessionRevertMarker {
  messageID?: string;
  partID?: string;
}

export interface SanitizedSessionListItem {
  id?: unknown;
  parentID?: unknown;
  projectID?: unknown;
  location?: unknown;
  subpath?: unknown;
  title?: unknown;
  agent?: unknown;
  model?: unknown;
  cost?: unknown;
  tokens?: unknown;
  outcome?: unknown;
  time?: unknown;
  metadata?: unknown;
  fork?: unknown;
  revert?: SessionRevertMarker;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

const SESSION_LIST_ALLOWED_FIELDS = [
  'id',
  'parentID',
  'projectID',
  'location',
  'subpath',
  'title',
  'agent',
  'model',
  'cost',
  'tokens',
  'outcome',
  'time',
  'metadata',
  'fork',
] as const;

const RETIRED_SESSION_METADATA_KEYS = ['knowledge_context_delivered'];

export const withoutRetiredMetadataKeys = <Metadata>(metadata: Metadata) => {
  const openchamber = hasMetadataFields(metadata) ? metadata.openchamber : undefined;
  if (!isObject(openchamber) || !RETIRED_SESSION_METADATA_KEYS.some((key) => key in openchamber)) return metadata;
  const kept = { ...openchamber };
  for (const key of RETIRED_SESSION_METADATA_KEYS) delete kept[key];
  return { ...metadata, openchamber: kept };
};

const hasMetadataFields = (value: unknown): value is { openchamber?: unknown } => value != null;

export const sanitizeSessionListItem = <Session>(session: Session) => {
  if (!isObject(session) || Array.isArray(session)) {
    return session;
  }

  const sanitized: SanitizedSessionListItem = {};
  for (const key of SESSION_LIST_ALLOWED_FIELDS) {
    if (key in session) {
      sanitized[key] = session[key];
    }
  }

  if ('metadata' in sanitized) sanitized.metadata = withoutRetiredMetadataKeys(sanitized.metadata);

  const revert = session.revert;
  if (isObject(revert) && !Array.isArray(revert)) {
    const revertMarker: SessionRevertMarker = {};
    if (isString(revert.messageID)) {
      revertMarker.messageID = revert.messageID;
    }
    if (isString(revert.partID)) {
      revertMarker.partID = revert.partID;
    }
    if (Object.keys(revertMarker).length > 0) {
      sanitized.revert = revertMarker;
    }
  }

  return sanitized;
};

export const sanitizeSessionListPayload = <Payload>(payload: Payload) => {
  if (Array.isArray(payload)) {
    return payload.map((session) => sanitizeSessionListItem(session));
  }
  if (isObject(payload) && Array.isArray(payload.data)) {
    return { ...payload, data: payload.data.map((session) => sanitizeSessionListItem(session)) };
  }
  return payload;
};

export const sessionListRecords = <Payload>(payload: Payload): unknown[] | null => {
  if (Array.isArray(payload)) return payload;
  if (isObject(payload) && Array.isArray(payload.data)) return payload.data;
  return null;
};

