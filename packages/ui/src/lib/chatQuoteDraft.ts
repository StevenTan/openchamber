import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';

/** A quote attached to a conversation whose visible history does not contain its source. */
export const chatQuoteDraft = (quote: string): Omit<InlineCommentDraft, 'id' | 'createdAt' | 'sessionKey'> => ({
  source: 'chat-quote',
  fileLabel: '',
  startLine: 1,
  endLine: 1,
  code: quote,
  language: '',
  text: '',
});
