import { z } from "zod";

const option = z.string().trim().min(1);
const options = z.tuple([option], option);
const question = z.object({
  title: z.string().trim().min(1),
  options: options.optional(),
}).strict();
const questions = z.tuple([question], question);
export const questionInput = z.object({ questions }).strict();

const questionOutput = z.object({
  question_id: z.string(),
  status: z.literal("pending"),
  message: z.string(),
});

export const questionTool = {
  name: 'user_input_async',
  description: 'Creates user questions and immediately returns a receipt object containing question_id, status: "pending", and message. Awaiting this call waits for question creation; execution then continues in the same turn while the user answers. Answers arrive later as a new message in this session. Use for missing information, preferences, constraints, clarification, or approval. Continue independent work after the receipt; use required answers before dependent work. List only suggested answers as options, with the recommended option first; free-text entry is provided automatically.',
  inputSchema: { ...z.toJSONSchema(questionInput, {
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema === questions || zodSchema === options) delete jsonSchema.prefixItems;
    },
  }), type: 'object' as const },
  outputSchema: { ...z.toJSONSchema(questionOutput), type: 'object' as const },
};

export const createQuestionPluginSource = () => `export default {
  id: "openchamber-question-tool",
  async setup(ctx) {
    const endpoint = new URL('/api/openchamber/async-question/mcp', process.env.OPENCHAMBER_AGENT_TOOL_URL).href
    const host = new URL(endpoint).hostname.replace(/^\\[|\\]$/g, '')
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const entries = (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean)
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(',')
    }
    await ctx.tool.transform(tools => {
      tools.update('question', tool => {
        tool.description = 'Waits for the user to answer before returning. Use when the answer is required before further work can proceed.\\n\\n' + tool.description
      })
      tools.update('request_user_input_async', tool => {
        tool.options = { ...tool.options, permission: 'question' }
      })
    })
    await ctx.mcp.transform(servers => {
      servers.set('request', {
        type: 'remote', url: endpoint, oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN },
      })
    })
    await ctx.tool.hook('execute.after', async event => {
      if (event.status !== 'completed' || event.tool !== 'request_user_input_async') return
      event.result.metadata = { ...event.result.metadata, questionID: event.result.output.question_id }
    })
  },
}
`;
