import { z } from "zod";

export const questionInput = z.object({
  questions: z.array(z.object({
    title: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(1).optional(),
  }).strict()).min(1),
}).strict();

export const createQuestionPluginSource = () => `export default {
  id: "openchamber-question-tool",
  async setup(ctx) {
    const endpoint = new URL('/api/openchamber/async-question', process.env.OPENCHAMBER_AGENT_TOOL_URL).href
    const host = new URL(endpoint).hostname.replace(/^\\[|\\]$/g, '')
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const entries = (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean)
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(',')
    }
    await ctx.tool.transform(tools => tools.add({
      name: 'request_user_input_async',
      description: 'Ask the user one or more concise questions about missing information, preferences, constraints, clarification, or approval. Returns immediately without pausing work. The user can choose a suggested answer or enter free text. Put the recommended option first; do not add an Other option. Answers arrive as a subsequent message in this session. Continue independent work while waiting; required answers must arrive before dependent work proceeds.',
      options: { codemode: false, permission: 'question' },
      input: ${JSON.stringify(z.toJSONSchema(questionInput))},
      async execute(input, context) {
        await ctx.permission.assert({
          sessionID: context.sessionID, agent: context.agent, action: 'question',
          resources: ['*'], save: ['*'],
          source: { type: 'tool', messageID: context.messageID, id: context.id },
        })
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN, 'content-type': 'application/json' },
          body: JSON.stringify({ sessionID: context.sessionID, callID: context.id, input }),
          signal: context.signal,
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        return { content: JSON.stringify(result), metadata: { questionID: result.question_id } }
      },
    }))
  },
}
`;
