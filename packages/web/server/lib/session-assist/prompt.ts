import { excerpt } from './context.js';
import type { AssistTurn } from './contracts.js';

const MAX_PROMPT_CHARS = 32_000;

export function buildAssistSystemPrompt() {
  return [
    'Return exactly one JSON object with a string field: "recap".',
    'recap is a reminder of the actual work accomplished or conclusion reached in the recent conversation. In at most 20 words, name the concrete behavior or subject and its current result. The reader wants to remember WHAT changed or was learned.',
    'Write the recap for the person using the app, not for someone reviewing its code. Name the feature and the concrete difference the user will notice. Replace generic "implemented and tested" summaries with what now works differently or what was learned. File paths, internal module names, test counts, and lists of checks belong in the recap only when they are the subject of the user\'s request. Preserve a specific finding or limitation when it changes the meaning of the result.',
    'For a closing exchange such as a commit, push, acknowledgment, or thank-you, summarize the substantive work from the preceding answers. Commit bookkeeping, authorship, branch names, and hashes are secondary and usually omitted. A recap saying only that optimizations or changes were committed does not serve this purpose.',
    'Use the latest state of that work. Distinguish recommendations from actions already performed, and implementations from verified deployments. Retain the reported conclusion without recalculating detailed lists. Earlier unrelated topics are not part of the recap.',
    'Language: recap follows the latest user-authored communication, including the user\'s comments on quotes. Ignore the language of the quoted material, code, logs, assistant responses, and these instructions. For a language-neutral acknowledgment use recent user-authored communication. Keep technical names unchanged where useful.',
  ].join('\n');
}

function renderTurn(turn: AssistTurn, index: number, userText = turn.user.text, answerText = turn.assistant?.text ?? '') {
  return [
    `Turn ${index + 1}${turn.complete ? '' : ' (interrupted before a final response)'}`,
    'User message with attached context:', userText,
    turn.complete ? 'Assistant final response:' : 'Assistant progress before interruption:', answerText,
  ].join('\n');
}

export function buildAssistPrompt(turns: AssistTurn[], charBudget: number) {
  const budget = Math.min(MAX_PROMPT_CHARS, Math.floor(charBudget));
  if (!Number.isFinite(budget) || budget < 1_000 || !turns.length) return null;
  const languageBudget = Math.min(3_600, Math.floor(budget / 5));
  const language = excerpt(turns.map((turn) => excerpt(turn.user.authored, 1_200)).filter(Boolean).join('\n'), languageBudget);
  const header = 'Recent conversation turns, oldest first. Older turns may be omitted.\n\n';
  const footer = `\n\n--- End of conversation evidence ---\n\nRecent user-authored communication, excluding attached quotes, oldest first:\n\n${language}\n\nReturn a reminder of the recent substantive work in recap.`;
  const available = budget - header.length - footer.length;
  const kept = turns.slice();
  let body = kept.map((turn, i) => renderTurn(turn, i)).join('\n\n---\n\n');
  while (body.length > available && kept.length > 1) {
    kept.shift();
    body = kept.map((turn, i) => renderTurn(turn, i)).join('\n\n---\n\n');
  }
  if (body.length > available) {
    const turn = kept[0];
    if (!turn) return null;
    const textBudget = available - renderTurn(turn, 0, '', '').length;
    if (textBudget < 128) return null;
    const answer = turn.assistant?.text ?? '';
    const userBudget = Math.min(turn.user.text.length, Math.max(Math.floor(textBudget / 3), textBudget - answer.length));
    body = renderTurn(turn, 0, excerpt(turn.user.text, userBudget), excerpt(answer, textBudget - userBudget));
  }
  return { text: header + body + footer, language };
}
