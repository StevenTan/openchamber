import { afterEach, expect, spyOn, test } from 'bun:test';
import { opencodeClient } from '@/lib/opencode/client';
import { prepareAttachmentInputs } from './attachment-delivery';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { attachmentWireName } from '@/lib/attachmentIdentity';

const writes = spyOn(opencodeClient, 'writeOpenCodeTempFiles');
afterEach(() => { writes.mockReset(); });

const pdf = { type: 'file' as const, mime: 'application/pdf', url: 'data:application/pdf;base64,JVBERi0=', filename: '/tmp/报告.pdf' };
const textOf = async (url: string) => (await fetch(url)).text();

test('a PDF-capable model receives a tool-readable PDF path', async () => {
  const [file] = await prepareAttachmentInputs([pdf], ['text', 'pdf'], '/repo');
  expect(file.mime).toBe('text/plain');
  expect(await textOf(file.url)).toContain(pdf.filename);
  expect(await textOf(file.url)).not.toContain('%PDF-');
  expect(writes).not.toHaveBeenCalled();
});

test('a text model receives a readable file reference for a PDF and a saved image', async () => {
  const image = { type: 'file' as const, mime: 'image/png', url: 'data:image/png;base64,aQ==', filename: '/tmp/image.png' };
  const result = await prepareAttachmentInputs([pdf, image], ['text'], '/repo');
  expect(result.map((file) => [file.mime, file.filename])).toEqual([['text/plain', pdf.filename], ['text/plain', image.filename]]);
  expect(await textOf(result[0].url)).toContain(pdf.filename);
  expect(await textOf(result[1].url)).toContain(image.filename);
  expect(writes).not.toHaveBeenCalled();
});

test('an image-capable model receives image bytes while its PDF is a file reference', async () => {
  const image = { ...pdf, mime: 'image/png', filename: '/tmp/image.png' };
  const result = await prepareAttachmentInputs([image, pdf], ['text', 'IMAGE'], '/repo');
  expect(result[0]).toBe(image);
  expect(result[1].mime).toBe('text/plain');
});

test('a restored attachment without a path is saved on the target OpenCode host', async () => {
  writes.mockResolvedValue([{ filename: 'report.pdf', path: '/remote/tmp/report.pdf' }]);
  const [file] = await prepareAttachmentInputs([{ ...pdf, filename: 'report.pdf' }], ['text'], '/remote/repo');
  expect(writes.mock.calls).toEqual([['/remote/repo', [{ filename: 'report.pdf', bytes: new TextEncoder().encode('%PDF-') }], getRuntimeKey()]]);
  expect(file.filename).toBe('/remote/tmp/report.pdf');
  expect(await textOf(file.url)).toContain('/remote/tmp/report.pdf');
});

test('a file URI keeps its existing path without copying it', async () => {
  const [file] = await prepareAttachmentInputs([{ ...pdf, filename: 'report.pdf', url: 'file:///tmp/report%20one.pdf' }], ['text'], '/repo');
  expect(await textOf(file.url)).toContain('/tmp/report one.pdf');
  expect(writes).not.toHaveBeenCalled();
});

test('a failed path allocation fails the send instead of sending an unsupported PDF', async () => {
  writes.mockResolvedValue([{ filename: 'report.pdf', error: new Error('write denied') }]);
  await expect(prepareAttachmentInputs([{ ...pdf, filename: 'report.pdf' }], ['text'], '/repo')).rejects.toThrow('write denied');
});

test('unknown model capabilities keep native images and reference ordinary files', async () => {
  const image = { ...pdf, mime: 'image/png', filename: '/tmp/image.png' };
  const [sentImage, sentPdf] = await prepareAttachmentInputs([image, pdf], undefined, '/repo');
  expect(sentImage).toBe(image);
  expect(sentPdf.mime).toBe('text/plain');
});

test('a large HTML attachment sends its path without its body', async () => {
  const html = { ...pdf, mime: 'text/plain', filename: '/downloads/page.html', url: `data:text/plain;base64,${btoa('<html>' + 'x'.repeat(1_000_000) + '</html>')}` };
  const [file] = await prepareAttachmentInputs([html], ['text', 'image'], '/repo');
  expect(await textOf(file.url)).toContain(html.filename);
  expect(file.url.length).toBeLessThan(512);
  expect(writes).not.toHaveBeenCalled();
});

test('a captured document text payload is saved with a text extension', async () => {
  writes.mockResolvedValue([{ filename: 'report.docx.txt', path: '/remote/tmp/report.docx.txt' }]);
  const [file] = await prepareAttachmentInputs([{ ...pdf, filename: 'report.docx', mime: 'text/plain' }], ['text'], '/repo');
  expect(writes.mock.calls[0][1][0].filename).toBe('report.docx.txt');
  expect(file.filename).toBe('/remote/tmp/report.docx.txt');
});

test('an editor selection saves its captured text rather than referencing its display label', async () => {
  const filename = attachmentWireName({ filename: '/repo/code.ts:12-18', vscodeSource: 'selection' });
  writes.mockResolvedValue([{ filename, path: `/remote/tmp/${filename}` }]);
  const [file] = await prepareAttachmentInputs([{ ...pdf, filename, mime: 'text/plain' }], ['text'], '/repo');
  expect(writes.mock.calls[0][1][0].filename).toBe('code.ts-12-18');
  expect(file.filename).toBe('/remote/tmp/code.ts-12-18');
});
