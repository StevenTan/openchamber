import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { useInputStore } from "./input-store"
import { getChatDraftIdentityKey } from "@/lib/chatDraftPersistence"
import { opencodeClient } from "@/lib/opencode/client"

// A HEIC conversion that fails the way the vendored decoder does for Apple's
// HDR gain-map photos.
const decodeHeic = async (): Promise<Blob> => {
  throw new Error("ERR_LIBHEIF format not supported")
}

mock.module("heic2any", () => ({
  default: async () => decodeHeic(),
}))

class MockFileReader {
  result: string | ArrayBuffer | null = null
  onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  error: DOMException | null = null

  readAsDataURL() {
    pendingReaders.push(this)
  }
}

const pendingReaders: MockFileReader[] = []
const originalFileReader = globalThis.FileReader

const restoreFileReader = () => {
  pendingReaders.length = 0
  globalThis.FileReader = originalFileReader
}

const testWithMockFileReader = (name: string, fn: () => Promise<void>) => {
  test(name, async () => {
    try {
      await fn()
    } finally {
      restoreFileReader()
    }
  })
}

const resolveReader = (reader: MockFileReader, result: string) => {
  reader.result = result
  reader.onload?.call(reader as unknown as FileReader, {} as ProgressEvent<FileReader>)
}

const rejectReader = (reader: MockFileReader) => {
  reader.error = new DOMException("read failed", "NotReadableError")
  reader.onerror?.call(reader as unknown as FileReader, {} as ProgressEvent<FileReader>)
}

const waitForReaderCount = async (count: number) => {
  for (let attempt = 0; attempt < 100 && pendingReaders.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

describe("input-store composer restore", () => {
  beforeEach(() => {
    useInputStore.setState({ pendingComposerRestore: null })
  })

  test("only the destination can consume a restore, and only once", () => {
    const target = { runtimeKey: "runtime", directory: "/repo", sessionId: "fork" }
    const pending = { target, text: "replay", files: [] }
    useInputStore.setState({ pendingComposerRestore: pending })
    for (const identity of [
      null,
      { ...target, sessionId: "source" },
      { ...target, directory: "/elsewhere" },
      { ...target, runtimeKey: "other-runtime" },
    ]) {
      expect(useInputStore.getState().consumePendingComposerRestore(identity)).toBeNull()
      expect(useInputStore.getState().pendingComposerRestore).toBe(pending)
    }
    expect(useInputStore.getState().consumePendingComposerRestore(target)).toBe(pending)
    expect(useInputStore.getState().consumePendingComposerRestore(target)).toBeNull()
  })

  test("keeps ordinary pending text independent from fork restoration", () => {
    const target = { runtimeKey: "runtime", directory: "/repo", sessionId: "fork" }
    const pending = { target, text: "", files: [] }
    useInputStore.setState({ pendingComposerRestore: pending })
    useInputStore.getState().setPendingInputText("ordinary insertion", "append")
    expect(useInputStore.getState().consumePendingInputText()).toEqual({ text: "ordinary insertion", mode: "append" })
    expect(useInputStore.getState().consumePendingComposerRestore(target)).toBe(pending)
  })
})

describe("input-store attachments", () => {
  beforeEach(() => {
    pendingReaders.length = 0
    globalThis.FileReader = MockFileReader as unknown as typeof FileReader
    useInputStore.setState({
      pendingInputText: null,
      pendingInputMode: "replace",
      pendingSyntheticParts: null,
      pendingGuestIssue: null,
      pendingBtwComposerRequest: null,
      activeEditorFile: null,
      attachmentDraftKey: null,
      attachmentDrafts: new Map(),
    })
    useInputStore.getState().setAttachedFiles([])
  })

  testWithMockFileReader("a PDF keeps preview bytes and its saved path in one attachment", async () => {
    useInputStore.getState().clearAttachedFiles()
    const write = spyOn(opencodeClient, 'writeOpenCodeTempFiles').mockResolvedValue([{ filename: 'report.pdf', path: '/remote/tmp/report.pdf' }])
    try {
      const adding = useInputStore.getState().addAttachedFile(new File(['%PDF-fixture'], 'report.pdf', { type: 'application/pdf' }))
      await waitForReaderCount(1)
      resolveReader(pendingReaders[0], 'data:application/pdf;base64,JVBERg==')
      expect(await adding).toBe(true)
      expect(useInputStore.getState().attachedFiles).toMatchObject([{ filename: 'report.pdf', agentPath: '/remote/tmp/report.pdf', mimeType: 'application/pdf' }])
    } finally { write.mockRestore() }
  })

  testWithMockFileReader("a binary clipboard file is saved and attached as a tool-readable reference", async () => {
    useInputStore.getState().clearAttachedFiles()
    const write = spyOn(opencodeClient, 'writeOpenCodeTempFiles').mockResolvedValue([{ filename: 'archive.zip', path: '/remote/tmp/archive.zip' }])
    try {
      const adding = useInputStore.getState().addAttachedFile(new File([new Uint8Array([80, 75, 0, 0])], 'archive.zip', { type: 'application/zip' }))
      await waitForReaderCount(1)
      resolveReader(pendingReaders[0], 'data:text/plain;base64,bm90ZQ==')
      expect(await adding).toBe(true)
      const [attachment] = useInputStore.getState().attachedFiles
      expect(attachment).toMatchObject({ filename: 'archive.zip', agentPath: '/remote/tmp/archive.zip', mimeType: 'text/plain' })
      expect(await attachment.file.text()).toContain('/remote/tmp/archive.zip')
    } finally { write.mockRestore() }
  })

  test("a PDF save finishing after the attachment draft changed cannot attach there", async () => {
    useInputStore.getState().clearAttachedFiles()
    let resolveSaved!: (files: Array<{ filename: string; path: string }>) => void
    const saved = new Promise<Array<{ filename: string; path: string }>>((resolve) => { resolveSaved = resolve })
    const write = spyOn(opencodeClient, 'writeOpenCodeTempFiles').mockImplementation(() => saved)
    try {
      const adding = useInputStore.getState().addAttachedFile(new File(['%PDF-fixture'], 'report.pdf', { type: 'application/pdf' }))
      useInputStore.getState().clearAttachedFiles()
      resolveSaved([{ filename: 'report.pdf', path: '/remote/tmp/report.pdf' }])
      expect(await adding).toBe(false)
      expect(useInputStore.getState().attachedFiles).toEqual([])
    } finally { write.mockRestore() }
  })


  testWithMockFileReader("refuses a file over 10 MB without reading it when it has no path on disk", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "place.rbxl")

    await expect(useInputStore.getState().addAttachedFile(big)).rejects.toThrow("place.rbxl")

    expect(pendingReaders).toHaveLength(0)
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader("refuses a file over 20 MB without suggesting an @-mention, which OpenCode would refuse too", async () => {
    const huge = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "map.png", { type: "image/png" })

    let message = ""
    try {
      await useInputStore.getState().addAttachedFile(huge)
    } catch (error) {
      message = error instanceof Error ? error.message : ""
    }

    expect(message.includes("map.png")).toBe(true)
    expect(message.includes("@")).toBe(false)
    expect(pendingReaders).toHaveLength(0)
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader("saves a HEIC the decoder cannot read where OpenCode runs and attaches a note naming it", async () => {
    const write = spyOn(opencodeClient, "writeOpenCodeTempFiles").mockImplementation(async (_directory, files) => (
      files.map(({ filename }) => ({ filename, path: `/tmp/opencode/openchamber/abc/${filename}` }))
    ))
    try {
      const adding = useInputStore.getState().addAttachedFile(new File(["heic-data"], "IMG_4015.heic", { type: "image/heic" }))
      await waitForReaderCount(1)
      resolveReader(pendingReaders[0], "data:text/plain;base64,bm90ZQ==")
      expect(await adding).toBe(true)

      // The original bytes, unconverted, under the original name.
      const [, files] = write.mock.calls[0]
      expect(files.map(({ filename }) => filename)).toEqual(["IMG_4015.heic"])
      expect(new TextDecoder().decode(files[0].bytes)).toBe("heic-data")
      const [file] = useInputStore.getState().attachedFiles
      expect(file?.mimeType).toBe("text/plain")
      expect(file?.filename).toBe("IMG_4015.heic")
      expect(file?.agentPath).toBe("/tmp/opencode/openchamber/abc/IMG_4015.heic")
      expect(await file?.file?.text()).toContain("/tmp/opencode/openchamber/abc/IMG_4015.heic")
    } finally {
      write.mockRestore()
    }
  })

  testWithMockFileReader("names a HEIC the decoder cannot read when saving it where OpenCode runs fails too", async () => {
    const write = spyOn(opencodeClient, "writeOpenCodeTempFiles").mockImplementation(async () => {
      throw new Error("OpenCode is not reachable")
    })
    try {
      await expect(
        useInputStore.getState().addAttachedFile(new File(["heic-data"], "IMG_4015.heic", { type: "image/heic" })),
      ).rejects.toThrow("IMG_4015.heic could not be converted from HEIC to JPEG")

      expect(pendingReaders).toHaveLength(0)
      expect(useInputStore.getState().attachedFiles).toEqual([])
    } finally {
      write.mockRestore()
    }
  })

  test("a large VS Code file remains a reference to its host path", () => {
    useInputStore.getState().addVSCodeFileAttachment("/workspace/map.bin", "map.bin", 25 * 1024 * 1024)
    expect(useInputStore.getState().attachedFiles).toMatchObject([{ dataUrl: "file:///workspace/map.bin", size: 25 * 1024 * 1024 }])
  })

  testWithMockFileReader("does not attach a local file that finishes reading after attachments are cleared", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    useInputStore.getState().clearAttachedFiles()
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader("rejects pending file and selection reads after switching drafts, even after returning", async () => {
    const source = { runtimeKey: "runtime", directory: "/repo", sessionId: "source" }
    const input = useInputStore.getState()
    input.selectAttachmentDraft(source)
    input.addRestoredAttachment({ url: "data:text/plain;base64,aGVsbG8=", mimeType: "text/plain", filename: "ready.txt" })
    const ready = useInputStore.getState().attachedFiles
    const local = input.addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    const selection = input.addVSCodeSelectionAttachment("/repo/code.ts", new File(["hello"], "selection.ts", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(2)
    input.selectAttachmentDraft({ ...source, sessionId: "other" })
    expect(useInputStore.getState().attachedFiles).toEqual([])
    input.selectAttachmentDraft(source)
    for (const reader of pendingReaders) resolveReader(reader, "data:text/plain;base64,aGVsbG8=")
    expect(await local).toBe(false)
    await selection
    expect(useInputStore.getState().attachedFiles).toBe(ready)
  })

  testWithMockFileReader("files an attachment into the named slot without taking the current one", async () => {
    const current = { runtimeKey: "runtime", directory: "/repo", sessionId: "current" }
    const composer = { runtimeKey: "runtime", directory: "/repo", sessionId: "fork" }
    const input = useInputStore.getState()
    input.selectAttachmentDraft(current)

    const addPromise = input.addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }), composer)
    await waitForReaderCount(1)
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(input.getAttachedFiles()).toEqual([])
    expect(input.getAttachedFiles(composer).map((attachment) => attachment.filename)).toEqual(["hello.txt"])
    expect(useInputStore.getState().attachmentDraftKey).toBe(getChatDraftIdentityKey(current))
  })

  testWithMockFileReader("restores an attachment into the named slot", async () => {
    const current = { runtimeKey: "runtime", directory: "/repo", sessionId: "current" }
    const composer = { runtimeKey: "runtime", directory: "/repo", sessionId: "fork" }
    const input = useInputStore.getState()
    input.selectAttachmentDraft(current)

    input.addRestoredAttachment({ url: "data:text/plain;base64,aGVsbG8=", mimeType: "text/plain", filename: "ready.txt" }, composer)

    expect(input.getAttachedFiles()).toEqual([])
    expect(input.getAttachedFiles(composer).map((attachment) => attachment.filename)).toEqual(["ready.txt"])
  })

  testWithMockFileReader("keeps concurrent appends into the selected named slot", async () => {
    const target = { runtimeKey: "runtime", directory: "/repo", sessionId: "fork" }
    const input = useInputStore.getState()
    input.selectAttachmentDraft(target)
    const first = input.addAttachedFile(new File(["one"], "one.txt", { type: "text/plain" }), target)
    const second = input.addAttachedFile(new File(["two"], "two.txt", { type: "text/plain" }), target)
    await waitForReaderCount(2)
    resolveReader(pendingReaders[0], "data:text/plain;base64,b25l")
    expect(await first).toBe(true)
    resolveReader(pendingReaders[1], "data:text/plain;base64,dHdv")
    expect(await second).toBe(true)
    expect(input.getAttachedFiles(target).map((file) => file.filename)).toEqual(["one.txt", "two.txt"])
  })

  testWithMockFileReader("does not attach a local file after attached files are replaced", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    useInputStore.getState().setAttachedFiles([])
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader("a pending selection in another draft does not block the same selection here", async () => {
    const source = { runtimeKey: "runtime", directory: "/repo", sessionId: "source" }
    const input = useInputStore.getState()
    const file = new File(["hello"], "selection.ts", { type: "text/plain" })
    input.selectAttachmentDraft(source)
    const first = input.addVSCodeSelectionAttachment("/repo/code.ts", file)
    input.selectAttachmentDraft({ ...source, sessionId: "other" })
    const second = input.addVSCodeSelectionAttachment("/repo/code.ts", file)
    expect(pendingReaders).toHaveLength(2)
    // A repeated selection of the current identity must not cancel its read.
    input.selectAttachmentDraft({ ...source, sessionId: "other" })
    input.clearAttachedFiles(source)
    for (const reader of pendingReaders) resolveReader(reader, "data:text/plain;base64,aGVsbG8=")
    await Promise.all([first, second])
    expect(useInputStore.getState().attachedFiles.map((attachment) => attachment.filename)).toEqual(["selection.ts"])
    input.selectAttachmentDraft(source)
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader("does not attach a local file after attached files are restored", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    const restored = new File(["restored"], "restored.txt", { type: "text/plain" })
    useInputStore.getState().setAttachedFiles([{
      id: "restored",
      file: restored,
      dataUrl: "data:text/plain;base64,cmVzdG9yZWQ=",
      mimeType: "text/plain",
      filename: "restored.txt",
      size: restored.size,
      source: "local",
    }])
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles.map((file) => file.filename)).toEqual(["restored.txt"])
  })

  testWithMockFileReader("does not attach a VS Code selection that finishes reading after attachments are cleared", async () => {
    const addPromise = useInputStore.getState().addVSCodeSelectionAttachment(
      "/workspace/hello.txt",
      new File(["hello"], "hello.txt", { type: "text/plain" })
    )
    expect(pendingReaders).toHaveLength(1)

    useInputStore.getState().clearAttachedFiles()
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  test("moves the selected draft's files onto another draft, merged with its own", () => {
    const parent = { runtimeKey: "runtime", directory: "/repo", sessionId: "parent" }
    const btw = { ...parent, sessionId: "btw-pending:parent" }
    const input = useInputStore.getState()
    input.selectAttachmentDraft(btw)
    input.addRestoredAttachment({ url: "data:text/plain;base64,aGVsbG8=", mimeType: "text/plain", filename: "earlier.txt" })
    input.selectAttachmentDraft(parent)
    input.addRestoredAttachment({ url: "data:image/png;base64,AQID", mimeType: "image/png", filename: "image-1.png" })

    input.moveAttachedFiles(parent, btw)

    expect(useInputStore.getState().attachedFiles).toEqual([])
    input.selectAttachmentDraft(btw)
    expect(useInputStore.getState().attachedFiles.map((file) => file.filename)).toEqual(["earlier.txt", "image-1.png"])
    input.selectAttachmentDraft(parent)
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  test("leaves files in place when the drafts are the same", () => {
    const parent = { runtimeKey: "runtime", directory: "/repo", sessionId: "parent" }
    const input = useInputStore.getState()
    input.selectAttachmentDraft(parent)
    input.addRestoredAttachment({ url: "data:image/png;base64,AQID", mimeType: "image/png", filename: "image-1.png" })
    input.moveAttachedFiles(parent, { ...parent })
    expect(useInputStore.getState().attachedFiles.map((file) => file.filename)).toEqual(["image-1.png"])
  })

  test("does not leave local file reads pending after a reader error", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    rejectReader(pendingReaders[0])
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  test("cleans up pending VS Code selection keys after a reader error", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" })
    const firstAdd = useInputStore.getState().addVSCodeSelectionAttachment("/workspace/hello.txt", file)
    expect(pendingReaders).toHaveLength(1)

    rejectReader(pendingReaders[0])
    await firstAdd

    const secondAdd = useInputStore.getState().addVSCodeSelectionAttachment("/workspace/hello.txt", file)
    expect(pendingReaders).toHaveLength(2)
    resolveReader(pendingReaders[1], "data:text/plain;base64,aGVsbG8=")
    await secondAdd

    expect(useInputStore.getState().attachedFiles.map((attached) => attached.filename)).toEqual(["hello.txt"])
  })

  testWithMockFileReader("normalizes code files to text/plain", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(
      new File(["const value = 1"], "example.ts", { type: "text/typescript" })
    )
    expect(pendingReaders).toHaveLength(1)

    resolveReader(pendingReaders[0], "data:text/typescript;base64,Y29uc3QgdmFsdWUgPSAx")

    expect(await addPromise).toBe(true)
    expect(useInputStore.getState().attachedFiles[0]?.filename).toBe("example.ts")
    expect(useInputStore.getState().attachedFiles[0]?.mimeType).toBe("text/plain")
    expect(useInputStore.getState().attachedFiles[0]?.dataUrl).toBe(
      "data:text/plain;base64,Y29uc3QgdmFsdWUgPSAx"
    )
  })

  testWithMockFileReader("normalizes structured text MIME types to text/plain", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(
      new File(["{}"], "example.json", { type: "application/json" })
    )
    expect(pendingReaders).toHaveLength(1)

    resolveReader(pendingReaders[0], "data:application/json;base64,e30=")

    expect(await addPromise).toBe(true)
    expect(useInputStore.getState().attachedFiles[0]?.mimeType).toBe("text/plain")
    expect(useInputStore.getState().attachedFiles[0]?.dataUrl).toBe("data:text/plain;base64,e30=")
  })

  test("rejects an unknown binary file after inspecting its contents", async () => {
    const attached = await useInputStore.getState().addAttachedFile(
      new File([new Uint8Array([0, 1, 2, 3])], "archive.bin", { type: "application/octet-stream" })
    )

    expect(attached).toBe(false)
    expect(pendingReaders).toHaveLength(0)
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  test("rejects unknown content with too many control bytes", async () => {
    const attached = await useInputStore.getState().addAttachedFile(
      new File([new Uint8Array([1, 2, 3, 65])], "encoded.custom", { type: "application/octet-stream" })
    )

    expect(attached).toBe(false)
    expect(pendingReaders).toHaveLength(0)
  })

  testWithMockFileReader("accepts an unknown MIME type when its contents are text", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(
      new File(["custom text"], "example.custom", { type: "application/octet-stream" })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pendingReaders).toHaveLength(1)

    resolveReader(pendingReaders[0], "data:application/octet-stream;base64,Y3VzdG9tIHRleHQ=")

    expect(await addPromise).toBe(true)
    expect(useInputStore.getState().attachedFiles[0]?.mimeType).toBe("text/plain")
    expect(useInputStore.getState().attachedFiles[0]?.dataUrl).toBe(
      "data:text/plain;base64,Y3VzdG9tIHRleHQ="
    )
  })

  testWithMockFileReader("preserves supported image MIME types", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(
      new File([new Uint8Array([1, 2, 3])], "image.webp", { type: "image/webp" })
    )
    expect(pendingReaders).toHaveLength(1)

    resolveReader(pendingReaders[0], "data:image/webp;base64,AQID")

    expect(await addPromise).toBe(true)
    expect(useInputStore.getState().attachedFiles[0]?.mimeType).toBe("image/webp")
    expect(useInputStore.getState().attachedFiles[0]?.dataUrl).toBe("data:image/webp;base64,AQID")
  })

  testWithMockFileReader("a document is saved intact and represented by one tool-readable reference", async () => {
    const write = spyOn(opencodeClient, "writeOpenCodeTempFiles").mockResolvedValue([{ filename: "design.docx", path: "/remote/tmp/design.docx" }])
    try {
      const original = new File(["office-package-bytes"], "design.docx")
      const adding = useInputStore.getState().addAttachedFile(original)
      await waitForReaderCount(1)
      resolveReader(pendingReaders[0], "data:text/plain;base64,bm90ZQ==")
      expect(await adding).toBe(true)
      const files = useInputStore.getState().attachedFiles
      expect(files).toHaveLength(1)
      expect(files[0]).toMatchObject({ filename: "design.docx", agentPath: "/remote/tmp/design.docx", mimeType: "text/plain" })
      expect(write.mock.calls[0][1][0].bytes).toEqual(new TextEncoder().encode("office-package-bytes"))
      expect(await files[0].file.text()).toContain("/remote/tmp/design.docx")
    } finally { write.mockRestore() }
  })

  test("removing a grouped attachment preserves unrelated files", () => {
    const store = useInputStore.getState()
    for (const filename of ["document.docx", "diagram.png", "separate.txt"]) {
      store.addRestoredAttachment({ url: "data:text/plain,content", mimeType: "text/plain", filename })
    }
    const files = useInputStore.getState().attachedFiles
    store.setAttachedFiles(files.map((file, index) => index < 2 ? { ...file, sourceDocumentId: "document" } : file))
    store.removeAttachedFile(files[1].id)
    expect(useInputStore.getState().attachedFiles.map((file) => file.filename)).toEqual(["separate.txt"])
  })

  testWithMockFileReader("non-document attachments do not have sourceDocumentId and remove individually", async () => {
    const addPromise = useInputStore.getState().addAttachedFile(
      new File(["hello"], "hello.txt", { type: "text/plain" })
    )
    expect(pendingReaders).toHaveLength(1)
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")

    expect(await addPromise).toBe(true)
    const files = useInputStore.getState().attachedFiles
    expect(files).toHaveLength(1)
    expect(files[0].sourceDocumentId).toBe(undefined)

    useInputStore.getState().removeAttachedFile(files[0].id)
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })


})

describe("input-store guest attach", () => {
  beforeEach(() => {
    useInputStore.setState({ pendingGuestIssue: null })
  })

  test("holds a guest issue until the composer consumes it", () => {
    const issue = {
      providerId: "clickup",
      id: "abc",
      title: "Login",
      url: "https://app.clickup.com/t/abc",
    }
    useInputStore.getState().setPendingGuestIssue(issue)
    expect(useInputStore.getState().pendingGuestIssue).toEqual(issue)
    expect(useInputStore.getState().consumePendingGuestIssue()).toEqual(issue)
    expect(useInputStore.getState().pendingGuestIssue).toBeNull()
    expect(useInputStore.getState().consumePendingGuestIssue()).toBeNull()
  })

  test("holds a guest pull with author and branches", () => {
    const pull = {
      providerId: "gitlab",
      id: "!12",
      title: "Fix login",
      url: "https://gitlab.com/acme/app/-/merge_requests/12",
      kind: "pull" as const,
      author: "ada",
      branches: { head: "feature", base: "main" },
    }
    useInputStore.getState().setPendingGuestIssue(pull)
    expect(useInputStore.getState().pendingGuestIssue).toEqual(pull)
    expect(useInputStore.getState().consumePendingGuestIssue()).toEqual(pull)
  })
})

describe("input-store BTW composer requests", () => {
  test("keeps the request scoped to its parent without changing the normal composer", () => {
    useInputStore.setState({
      pendingInputText: "normal draft",
      pendingInputMode: "replace",
      pendingBtwComposerRequest: null,
      attachedFiles: [],
    })
    useInputStore.getState().requestBtwComposer({
      parentSessionId: "parent-1",
      quote: "selected text",
    })

    expect(useInputStore.getState().consumePendingBtwComposerRequest("parent-2")).toBeNull()
    expect(useInputStore.getState().pendingInputText).toBe("normal draft")
    expect(useInputStore.getState().consumePendingBtwComposerRequest("parent-1")).toEqual({
      parentSessionId: "parent-1",
      quote: "selected text",
    })
    expect(useInputStore.getState().consumePendingBtwComposerRequest("parent-1")).toBeNull()
    expect(useInputStore.getState().pendingInputText).toBe("normal draft")
  })
})

describe("input-store pinned composer addressing", () => {
  beforeEach(() => {
    useInputStore.setState({
      pendingInputText: null,
      pendingInputMode: "replace",
      pendingInputTarget: null,
      pendingSyntheticParts: null,
      pinnedSyntheticParts: new Map(),
      attachedFiles: [],
      attachmentDraftKey: null,
      attachmentDrafts: new Map(),
    })
  })

  test("app-wide text reaches the main composer and never a pinned one", () => {
    useInputStore.getState().setPendingInputText("from a plugin", "append")

    expect(useInputStore.getState().consumePendingInputText("ses_pinned")).toBeNull()
    expect(useInputStore.getState().consumePendingInputText()).toEqual({ text: "from a plugin", mode: "append" })
    expect(useInputStore.getState().pendingInputTarget).toBeNull()
  })

  test("text quoted in a pinned chat reaches only that chat's composer", () => {
    useInputStore.getState().setPendingInputText("> quoted", "append", "ses_pinned")

    expect(useInputStore.getState().consumePendingInputText()).toBeNull()
    expect(useInputStore.getState().consumePendingInputText("ses_other")).toBeNull()
    expect(useInputStore.getState().consumePendingInputText("ses_pinned")).toEqual({ text: "> quoted", mode: "append" })
    expect(useInputStore.getState().consumePendingInputText("ses_pinned")).toBeNull()
  })

  test("pending context of the main and a pinned composer stays apart", () => {
    const main = [{ text: "main context" }]
    const pinned = [{ text: "pinned context" }]
    useInputStore.getState().setPendingSyntheticParts(main)
    useInputStore.getState().setPendingSyntheticParts(pinned, "ses_pinned")

    expect(useInputStore.getState().getPendingSyntheticParts()).toBe(main)
    expect(useInputStore.getState().consumePendingSyntheticParts("ses_pinned")).toBe(pinned)
    expect(useInputStore.getState().getPendingSyntheticParts("ses_pinned")).toBeNull()
    expect(useInputStore.getState().consumePendingSyntheticParts()).toBe(main)
    expect(useInputStore.getState().pendingSyntheticParts).toBeNull()
  })

  test("moving the selected attachment slot between two composers keeps both drafts' files", () => {
    const main = { runtimeKey: "runtime", directory: "/repo", sessionId: "ses_main" }
    const pinned = { runtimeKey: "runtime", directory: "/repo", sessionId: "ses_pinned" }
    const file = (id: string) => ({
      id, file: new File([], `${id}.txt`), dataUrl: "", mimeType: "text/plain", filename: `${id}.txt`, size: 0, source: "local" as const,
    })
    const store = useInputStore.getState()
    store.selectAttachmentDraft(main)
    store.setAttachedFiles([file("a")])
    store.setAttachedFiles([file("b")], pinned)

    useInputStore.getState().selectAttachmentDraft(pinned)
    expect(useInputStore.getState().attachedFiles.map((entry) => entry.id)).toEqual(["b"])
    expect(useInputStore.getState().attachmentDrafts.get(getChatDraftIdentityKey(main))?.map((entry) => entry.id)).toEqual(["a"])

    useInputStore.getState().selectAttachmentDraft(main)
    expect(useInputStore.getState().attachedFiles.map((entry) => entry.id)).toEqual(["a"])
    expect(useInputStore.getState().attachmentDrafts.get(getChatDraftIdentityKey(pinned))?.map((entry) => entry.id)).toEqual(["b"])
  })
})

describe("input-store draft submit", () => {
  beforeEach(() => {
    useInputStore.setState({ pendingDraftSubmit: null })
  })

  test("the requested draft takes its first message once", () => {
    useInputStore.getState().requestDraftSubmit(7, "Fix the build")

    expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBe("Fix the build")
    expect(useInputStore.getState().consumePendingDraftSubmit(7)).toBeNull()
  })

  test("another draft or a session drops the message instead of sending it", () => {
    useInputStore.getState().requestDraftSubmit(7, "Fix the build")
    expect(useInputStore.getState().consumePendingDraftSubmit(8)).toBeNull()
    expect(useInputStore.getState().pendingDraftSubmit).toBeNull()

    useInputStore.getState().requestDraftSubmit(7, "Fix the build")
    expect(useInputStore.getState().consumePendingDraftSubmit(null)).toBeNull()
    expect(useInputStore.getState().pendingDraftSubmit).toBeNull()
  })
})

test("composer focus is consumed once by the addressed runtime, directory and session", () => {
  const target = { runtimeKey: "focus-runtime", directory: "/project", sessionId: "side" }
  const store = useInputStore.getState()
  store.requestComposerFocus(target)
  for (const other of [
    { ...target, runtimeKey: "another-runtime" },
    { ...target, directory: "/another-project" },
    { ...target, sessionId: "main" },
  ]) expect(store.consumeComposerFocus(other)).toBe(false)
  expect(useInputStore.getState().pendingComposerFocus).toEqual(target)
  expect(store.consumeComposerFocus(target)).toBe(true)
  expect(store.consumeComposerFocus(target)).toBe(false)
  expect(useInputStore.getState().pendingComposerFocus).toBeNull()
})
