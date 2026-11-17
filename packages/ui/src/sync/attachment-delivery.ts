import { opencodeClient } from '@/lib/opencode/client';
import { isAbsoluteFilePath } from '@/lib/path-utils';
import { attachmentCopyName } from '@/lib/attachmentIdentity';
import { isDocumentAttachmentFilename } from './attachment-files';
import { normalizeDroppedPath } from '@/components/chat/composer/attachments/filePaths';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey } from '@/lib/runtime-switch';

type AttachmentInput = { type: 'file'; mime: string; url: string; filename: string };

/** Files are tool-readable references; supported images retain their native input. */
export async function prepareAttachmentInputs(
  files: AttachmentInput[],
  inputModalities: string[] | undefined,
  directory: string | null | undefined,
  runtimeKey: string = getRuntimeKey(),
): Promise<AttachmentInput[]> {
  const supportsImages = !inputModalities || inputModalities.some((modality) => modality.trim().toLowerCase() === 'image');
  return Promise.all(files.map(async (file) => {
    if (file.mime.startsWith('image/') && supportsImages) return file;
    let path = isAbsoluteFilePath(file.filename) ? file.filename
      : file.url.startsWith('file://') ? normalizeDroppedPath(file.url) : null;
    if (!path) {
      const response = file.url.startsWith('data:') ? await fetch(file.url) : await runtimeFetch(file.url);
      if (!response.ok) throw new Error(`Could not read attachment ${file.filename} (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const name = attachmentCopyName(file.filename);
      const filename = file.mime === 'text/plain' && (isDocumentAttachmentFilename(name) || /\.ipynb$/i.test(name)) ? `${name}.txt` : name;
      const [saved] = await opencodeClient.writeOpenCodeTempFiles(directory, [{ filename, bytes }], runtimeKey);
      if ('error' in saved) throw saved.error;
      path = saved.path;
    }
    const text = `File on disk: ${path}. Read this file with your tools. Its binary content is not included in this message.\n`;
    const encoded = btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(''));
    return { ...file, mime: 'text/plain', url: `data:text/plain;base64,${encoded}`, filename: path };
  }));
}
