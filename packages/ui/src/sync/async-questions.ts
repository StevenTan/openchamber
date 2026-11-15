import type { FormRequest } from '@/lib/opencode/model';
import { z } from 'zod';

const metadataSchema = z.object({ kind: z.literal('openchamber-async-question'), order: z.number().int().positive() });

export const isAsyncQuestion = (form: Pick<FormRequest, 'metadata'>): boolean => (
  metadataSchema.safeParse(form.metadata).success
);

export const orderAsyncQuestions = (forms: FormRequest[]): FormRequest[] => {
  const questions = forms.filter(isAsyncQuestion);
  if (questions.length < 2) return forms;
  questions.sort((left, right) => metadataSchema.parse(left.metadata).order - metadataSchema.parse(right.metadata).order);
  let index = 0;
  return forms.map(form => isAsyncQuestion(form) ? questions[index++] : form);
};
