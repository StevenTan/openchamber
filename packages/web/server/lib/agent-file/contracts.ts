import { z } from 'zod';

const patchTextDescription = "File operation sections beginning with '*** Add File:', '*** Update File:' or '*** Delete File:'. The tool supplies the outer '*** Begin Patch' and '*** End Patch' lines. Complete patches containing both boundary lines are also accepted.";
const inputs = {
  write: z.object({ path: z.string(), content: z.string() }),
  edit: z.object({ path: z.string(), oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() }),
  patch: z.object({ patchText: z.string().describe(patchTextDescription) }),
  view_image: z.object({ path: z.string() }),
};
export const fileCall = z.discriminatedUnion('name', [
  z.object({ name: z.literal('write'), input: inputs.write }),
  z.object({ name: z.literal('edit'), input: inputs.edit }),
  z.object({ name: z.literal('patch'), input: inputs.patch }),
  z.object({ name: z.literal('view_image'), input: inputs.view_image }),
]);
export type FileCall = z.infer<typeof fileCall>;
export const FILE_MCP_TOOLS = ['file_write', 'file_edit', 'file_patch', 'file_view_image'];

const descriptions = {
  write: 'Writes a file to the local filesystem, overwriting if one exists. Missing parent directories are created automatically. Use write to create or overwrite a file, edit for partial text changes, and patch for changes spanning files.',
  edit: 'Edit a file by finding and replacing text. Preserve exact indentation and omit line-number prefixes. Line breaks match and preserve the file\'s CRLF or LF endings. To change line endings themselves, make oldString and newString differ only in \\r. Matching first uses exact text, then typographic quote, dash and space variants, then trailing whitespace. By default oldString must identify one location. Add surrounding context or set replaceAll to true for every occurrence. oldString must be nonempty and differ from newString.',
  patch: `${patchTextDescription}

Each operation starts with its action header:
- *** Add File: <path> creates a file. Prefix every content line with +.
- *** Delete File: <path> deletes a file.
- *** Update File: <path> updates a file. *** Move to: <path> optionally renames it.

Within an update, prefix unchanged lines with a space, removed lines with -, and added lines with +. Use @@ or @@ <context> to identify a change section.

Example patchText:
\`\`\`diff
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
\`\`\``,
  view_image: 'View a local PNG, JPEG, GIF or WebP image. Attaches the image to the model and returns its path and MIME type. Read text files and directories with shell commands; use the pdf skill for PDF extraction and rendering.',
};
export const fileTools = (['write', 'edit', 'patch', 'view_image'] as const).map(name => ({
  name, description: descriptions[name],
  inputSchema: { ...z.toJSONSchema(inputs[name]), type: 'object' as const },
}));
