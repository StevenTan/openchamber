import { describe, expect, test } from 'bun:test';
import type { SyntheticMessage } from './model';
import { readAsyncQuestionAnswer } from './async-question';
import { readSessionNotice } from './session-notices';
import { isSkippedTimelineMessage, isBackgroundReportEntry } from '@/components/chat/lib/timelineRoles';

const message = (text: string): SyntheticMessage => ({
  id: 'msg_answer', sessionID: 'ses_1', role: 'synthetic', time: { created: 1 },
  metadata: { source: 'openchamber-async-question', questionID: 'frm_ocq1' }, text,
  description: 'Which color?',
});

describe('asynchronous answers in the transcript', () => {
  test('renders all answers from one grouped response', () => {
    const input = message(JSON.stringify({ type: 'async_question_response', responses: [
      { question_id: 'frm_first', status: 'answered', answers: [{ question: 'Color?', answer: 'Blue' }] },
      { question_id: 'frm_second', status: 'answered', answers: [{ question: 'Directory?', answer: '/tmp/output' }] },
    ] }));
    expect(readAsyncQuestionAnswer(input)?.answers).toEqual([{ question: 'Color?', answer: 'Blue' }, { question: 'Directory?', answer: '/tmp/output' }]);
    expect(isSkippedTimelineMessage(input)).toBe(false);
  });
  test('shows the original questions and answers as a visible turn', () => {
    const input = message(JSON.stringify({ type: 'async_question_response', question_id: 'frm_ocq1', status: 'answered', answers: [{ question: 'Which color?', answer: 'Blue' }] }));
    expect(readAsyncQuestionAnswer(input)?.answers).toEqual([{ question: 'Which color?', answer: 'Blue' }]);
    expect(isBackgroundReportEntry(input)).toBe(true);
    expect(isSkippedTimelineMessage(input)).toBe(false);
    expect(readSessionNotice(input)).toBeUndefined();
  });
  test('keeps cancellation signals and malformed envelopes out of the transcript', () => {
    expect(readAsyncQuestionAnswer(message('not json'))).toBeUndefined();
    const cancelled = message(JSON.stringify({ type: 'async_question_response', question_id: 'frm_ocq1', status: 'cancelled' }));
    expect(readAsyncQuestionAnswer(cancelled)).toBeUndefined();
    expect(readSessionNotice(cancelled)).toBeUndefined();
    expect(isSkippedTimelineMessage(cancelled)).toBe(true);
  });
});
