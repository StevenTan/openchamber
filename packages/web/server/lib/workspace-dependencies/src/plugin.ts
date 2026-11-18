import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const metadata = z.object({
  bundleFormatVersion: z.literal(1),
  bundleVersion: z.string(),
  targetPlatform: z.string(),
  targetArch: z.string(),
  pythonVersion: z.string(),
  packages: z.record(z.string(), z.string()),
  popplerVersion: z.string(),
});
const input = z.object({}).strict();
const output = z.object({
  bundleVersion: z.string(),
  python: z.object({ executable: z.string(), packages: z.string(), version: z.string() }),
  pdf: z.object({ packages: z.record(z.string(), z.string()), popplerVersion: z.string(), pdftoppm: z.string(), pdfinfo: z.string() }),
});

export async function loadDependencies(root: string) {
  const info = metadata.parse(JSON.parse(await fs.readFile(path.join(root, "runtime.json"), "utf8")));
  if (info.targetPlatform !== process.platform || info.targetArch !== process.arch) {
    throw new Error(`Workspace runtime targets ${info.targetPlatform}/${info.targetArch}; this host is ${process.platform}/${process.arch}.`);
  }
  const packages = path.join(root, "dependencies", "python");
  const executable = path.join(packages, ...(process.platform === "win32" ? ["python.exe"] : ["bin", "python3"]));
  const bin = path.join(root, "dependencies/bin/override");
  const suffix = process.platform === "win32" ? ".cmd" : "";
  const pdftoppm = path.join(bin, "pdftoppm" + suffix);
  const pdfinfo = path.join(bin, "pdfinfo" + suffix);
  const native = path.join(root, "dependencies/native/poppler", process.platform === "win32" ? "poppler-utils.exe" : "poppler-utils");
  for (const file of [executable, pdftoppm, pdfinfo, native]) {
    await fs.access(file, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
  }
  await fs.access(path.join(root, "dependencies/native/poppler/fonts.conf"));
  return { bundleVersion: info.bundleVersion, python: { executable, packages, version: info.pythonVersion }, pdf: { packages: info.packages, popplerVersion: info.popplerVersion, pdftoppm, pdfinfo } };
}

interface Context {
  tool: { transform(update: (editor: { add(tool: {
    name: string; description: string; options: { codemode: true };
    input: z.core.JSONSchema.JSONSchema; output: z.core.JSONSchema.JSONSchema;
    execute(args: z.infer<typeof input>): Promise<{ output: z.infer<typeof output>; content: string }>;
  }): void }) => void): Promise<void> };
}

export default {
  id: "openchamber-workspace-dependencies",
  async setup(ctx: Context) {
    const runtime = z.union([z.object({ root: z.string() }), z.object({ installationError: z.string() })]).parse(JSON.parse(await fs.readFile(new URL("./runtime-root.json", import.meta.url), "utf8")));
    await ctx.tool.transform(editor => editor.add({
      name: "load_workspace_dependencies",
      description: "Locate bundled Python, PDF libraries and Poppler commands. Returns absolute paths for Python, pdftoppm (PNG rendering) and pdfinfo, plus bundle and dependency versions. Use these paths for the pdf skill. Reads local runtime metadata; does not install packages.",
      options: { codemode: true },
      input: z.toJSONSchema(input),
      output: z.toJSONSchema(output),
      async execute(args) {
        input.parse(args);
        if ("installationError" in runtime) throw new Error(`Workspace runtime installation failed: ${runtime.installationError}. Check the server's cache permissions and runtime bundle, then restart the managed process.`);
        try {
          const result = await loadDependencies(runtime.root);
          return { output: result, content: JSON.stringify(result) };
        } catch (error) {
          throw new Error(`Bundled workspace runtime is unavailable: ${error instanceof Error ? error.message : String(error)}. Prepare the server runtime with prepare:workspace-runtime or configure OPENCHAMBER_WORKSPACE_RUNTIME_DIR.`);
        }
      },
    }));
  },
};
