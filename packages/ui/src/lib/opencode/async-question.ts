import { z } from 'zod';
import type { Message } from './model';

const answeredSchema = z.object({
  question_id: z.string().min(1),
  status: z.literal('answered'),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).min(1),
});
const replySchema = z.discriminatedUnion('status', [answeredSchema, z.object({ question_id: z.string().min(1), status: z.literal('cancelled') })]);
const typeSchema = z.object({ type: z.literal('async_question_response') });
const envelopeSchema = z.union([
  replySchema.and(typeSchema).transform(reply => [reply]),
  typeSchema.extend({ responses: z.array(replySchema).min(1) }).transform(envelope => envelope.responses),
]);

export function readAsyncQuestionAnswer(message: Message) {
  if (message.role !== 'synthetic' || message.metadata?.source !== 'openchamber-async-question') return undefined;
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(message.text));
    if (!parsed.success) return undefined;
    const answers = parsed.data.flatMap(reply => reply.status === 'answered' ? reply.answers : []);
    return answers.length ? { answers } : undefined;
  } catch { return undefined; }
}
