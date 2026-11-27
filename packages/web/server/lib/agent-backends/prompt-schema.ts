import { z } from 'zod';

const metadata = z.record(z.string(), z.json());
export const conversationContext = z.object({ id: z.string().optional(), text: z.string(), description: z.string().optional(), metadata: metadata.optional() });
export const conversationPrompt = z.object({
  id: z.string(), text: z.string(),
  files: z.array(z.object({ mime: z.string(), filename: z.string().optional(), url: z.string() })),
  context: z.array(conversationContext),
  agents: z.array(z.object({ name: z.string(), mention: z.object({ start: z.number(), end: z.number(), text: z.string() }).optional() })),
  skills: z.array(z.object({ id: z.string() })),
  metadata: metadata.optional(), delivery: z.enum(['steer', 'queue']).optional(),
});
