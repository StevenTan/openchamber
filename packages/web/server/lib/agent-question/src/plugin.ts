import { z } from "zod";

export const questionInput = z.object({
  questions: z.array(z.object({
    title: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(1).optional(),
  }).strict()).min(1),
}).strict();

const questionOutput = z.object({
  question_id: z.string(),
  status: z.literal("pending"),
  message: z.string(),
});

export const createQuestionPluginSource = () => `import { randomUUID } from 'node:crypto'
export default {
  id: "openchamber-question-tool",
  async setup(ctx) {
    const endpoint = new URL('/api/openchamber/async-question', process.env.OPENCHAMBER_AGENT_TOOL_URL).href
    const host = new URL(endpoint).hostname.replace(/^\\[|\\]$/g, '')
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const entries = (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean)
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(',')
    }
    await ctx.tool.transform(tools => {
      tools.update('question', tool => {
        tool.description = 'Waits for the user to answer before returning. Use when the answer is required before further work can proceed.\\n\\n' + tool.description
      })
      tools.add({
        name: 'request_user_input_async',
        description: 'Creates user questions and immediately returns a receipt object containing question_id, status: "pending", and message. Awaiting this call waits for question creation; execution then continues in the same turn while the user answers. Answers arrive later as a new message in this session. Use for missing information, preferences, constraints, clarification, or approval. Continue independent work after the receipt; use required answers before dependent work. List only suggested answers as options, with the recommended option first; free-text entry is provided automatically.',
        options: { codemode: false, permission: 'question' },
        input: ${JSON.stringify(z.toJSONSchema(questionInput))},
        output: ${JSON.stringify(z.toJSONSchema(questionOutput))},
        async execute(input, context) {
          await ctx.permission.assert({
            sessionID: context.sessionID, agent: context.agent, action: 'question',
            resources: ['*'], save: ['*'],
            source: { type: 'tool', messageID: context.messageID, id: context.id },
          })
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN, 'content-type': 'application/json' },
            body: JSON.stringify({ sessionID: context.sessionID, callID: context.id + ':' + randomUUID(), input }),
            signal: context.signal,
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error)
          return { output: result, content: JSON.stringify(result), metadata: { questionID: result.question_id } }
        },
      })
    })
  },
}
`;
