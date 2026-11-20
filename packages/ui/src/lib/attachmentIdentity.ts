type AttachmentIdentity = {
  filename: string;
  agentPath?: string;
  vscodeSource?: 'file' | 'selection';
};

export const attachmentWireName = (attachment: AttachmentIdentity): string =>
  attachment.agentPath ?? (attachment.vscodeSource === 'selection'
    ? attachmentCopyName(attachment.filename)
    : attachment.filename);

export const attachmentBasename = (value: string): string => {
  const normalized = /^(?:[A-Za-z]:\\|\\\\)/.test(value) ? value.replace(/\\/g, '/') : value;
  const segments = normalized.split('/');
  return segments[segments.length - 1] || value;
};

export const attachmentCopyName = (value: string): string => Array.from(
  attachmentBasename(value),
  (char) => char.charCodeAt(0) < 32 || '\\/:<>"|?*'.includes(char) ? '-' : char,
).join('');
