import { Effect, Predicate, Schema } from "effect";
import { Tool } from "@opencode/schema/tool";

export interface FileToolEditor {
  get(id: string): Tool.Info | undefined;
  add(tool: Tool.Info): void;
  remove(id: string): void;
}

const imageMimes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const imageInput = Schema.Struct({ path: Schema.String.annotate({ description: "Path to a local PNG, JPEG, GIF or WebP image. Relative paths resolve against the workspace directory." }) });
const imageOutput = Schema.Struct({ path: Schema.String, mime: Schema.String });

export function adaptFileTools(editor: FileToolEditor) {
  const read = editor.get("read");
  if (!read) return;
  editor.remove("read");
  const image: Tool.Info<typeof imageInput, typeof imageOutput> = {
    name: "view_image",
    description: "View a local PNG, JPEG, GIF or WebP image. Attaches the image to the model and returns its path and MIME type. Read text files and directories with shell commands; use the pdf skill for PDF extraction and rendering.",
    input: imageInput,
    output: imageOutput,
    options: { ...read.options, permission: read.options?.permission ?? "read", codemode: true, pinned: true },
    execute: (input, context) => Effect.gen(function* () {
      const result = yield* read.execute(input, context);
      const files = Predicate.isString(result.content) ? [] : result.content ?? [];
      const file = files.find(part => part.type === "file" && imageMimes.has(part.mime));
      if (!file || file.type !== "file") return yield* Effect.fail(new Tool.Error({ message: "Expected a PNG, JPEG, GIF or WebP image. Read text with shell commands and use the pdf skill for PDFs." }));
      return { ...result, output: { path: file.name ?? input.path, mime: file.mime } };
    }),
  };
  editor.add(image);
}
