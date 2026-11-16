import { beforeEach, expect, it, vi } from "vitest";
import { inheritContext } from "./src/inherit.ts";

const user = { id: "user", type: "user", time: { created: 1 }, text: "Task", files: [{ data: "image-bytes", mime: "image/png" }] };
const assistant = { id: "assistant", type: "assistant", time: { created: 2, completed: 3 }, content: [{ type: "tool", id: "tool-call", state: { content: [{ type: "text", text: "Tool output" }] } }] };
const spawnCall = { type: "tool", id: "spawn", name: "subagent", state: { status: "running", input: {}, metadata: {} }, time: { created: 4 } };
const boundary = { id: "boundary", type: "assistant", agent: "build", model: { providerID: "fixture", id: "chat" }, time: { created: 4 }, content: [spawnCall] };
const parent = { id: "parent", projectID: "project", location: { directory: "/project" }, model: { providerID: "fixture", id: "chat" }, agent: "build", metadata: { fixture: true }, permissions: [], cost: 20, tokens: { input: 10 }, time: { created: 1, archived: 9 }, revert: { messageID: "user" } };

let api;
beforeEach(() => {
  api = {
    session: { get: vi.fn(async () => parent), remove: vi.fn(async () => {}) },
    message: { list: vi.fn(async () => ({ data: [user, assistant, boundary], cursor: {} })) },
    experimental: { session: {
      import: vi.fn(async () => {}),
      instructions: { entry: { list: vi.fn(async () => [{ key: "context", value: "Session instruction" }]), put: vi.fn(async () => {}) } },
    } },
  };
});
const run = (signal = new AbortController().signal) => inheritContext(api, { sessionID: "parent", messageID: "boundary", callID: "spawn", title: "Child" }, signal);

it("copies settled history before the invocation boundary with independent identities and accounting", async () => {
  const id = await run();
  const imported = api.experimental.session.import.mock.calls[0][0];
  expect(imported.location).toEqual(parent.location);
  expect(imported.info).toMatchObject({ id, parentID: "parent", projectID: "project", title: "Child", model: parent.model, metadata: parent.metadata, cost: 0, tokens: { input: 0, output: 0 } });
  expect(imported.info).not.toHaveProperty("agent");
  expect(imported.info).not.toHaveProperty("revert");
  expect(imported.info.time).not.toHaveProperty("archived");
  expect(imported.messages).toHaveLength(2);
  expect(imported.messages[0]).toMatchObject({ text: "Task", files: user.files });
  expect(imported.messages[1].content).toEqual(assistant.content);
  expect(imported.messages.map(message => message.id)).not.toEqual([user.id, assistant.id]);
  expect(api.experimental.session.instructions.entry.put).toHaveBeenCalledWith({ sessionID: id, key: "context", value: "Session instruction" });
  expect(user.id).toBe("user");
  expect(assistant.id).toBe("assistant");
});

it("paginates in transcript order and excludes unfinished history and messages after the invocation", async () => {
  api.message.list.mockResolvedValueOnce({ data: [user, { ...boundary, id: "unfinished" }, { id: "shell", type: "shell", status: "running" }], cursor: { next: "page2" } });
  api.message.list.mockResolvedValueOnce({ data: [assistant, boundary, { ...user, id: "later" }], cursor: { next: "page3" } });
  await run();
  expect(api.message.list).toHaveBeenCalledTimes(2);
  expect(api.message.list.mock.calls[1][0]).toEqual({ sessionID: "parent", limit: 200, cursor: "page2" });
  expect(api.experimental.session.import.mock.calls[0][0].messages.map(message => message.type)).toEqual(["user", "assistant"]);
});

it("remaps compaction references to the inherited kept message", async () => {
  api.message.list.mockResolvedValue({ data: [user, { id: "summary", type: "compaction", status: "completed", metadata: { keepID: "user", extra: true }, text: "Summary" }, boundary], cursor: {} });
  await run();
  const messages = api.experimental.session.import.mock.calls[0][0].messages;
  expect(messages[1].metadata).toEqual({ keepID: messages[0].id, extra: true });
});

it("fails without creating a child when the boundary is missing or an authoritative read fails", async () => {
  api.message.list.mockResolvedValue({ data: [user], cursor: {} });
  await expect(run()).rejects.toThrow("boundary");
  expect(api.experimental.session.import).not.toHaveBeenCalled();
  api.message.list.mockRejectedValue(new Error("Read failed"));
  await expect(run()).rejects.toThrow("Read failed");
  expect(api.experimental.session.import).not.toHaveBeenCalled();
});

it("deletes only the new child if instruction copying fails", async () => {
  api.experimental.session.instructions.entry.put.mockRejectedValue(new Error("Instruction failed"));
  await expect(run()).rejects.toThrow("Instruction failed");
  const id = api.experimental.session.import.mock.calls[0][0].info.id;
  expect(api.session.remove).toHaveBeenCalledWith({ sessionID: id });
});

it("allows an import write to settle before rolling back cancellation", async () => {
  const controller = new AbortController();
  api.experimental.session.import.mockImplementation(async () => { controller.abort(); });
  await expect(run(controller.signal)).rejects.toThrow();
  expect(api.experimental.session.import.mock.calls[0]).toHaveLength(1);
  expect(api.session.remove).toHaveBeenCalledOnce();
  expect(api.experimental.session.instructions.entry.put).not.toHaveBeenCalled();
});

it("inherits recorded text and settled tool results before the current spawn call", async () => {
  const text = { type: "text", text: "PARENT_CHECK_7C92" };
  const completed = { type: "tool", id: "earlier", name: "read", time: { created: 2, completed: 3 }, state: { status: "completed", input: {}, content: [{ type: "text", text: "Prior tool result" }] } };
  const running = { ...spawnCall, id: "parallel", name: "read" };
  const current = { ...boundary, content: [text, completed, running, spawnCall, { type: "text", text: "After spawn" }] };
  api.message.list.mockResolvedValue({ data: [user, assistant, current], cursor: {} });
  await run();
  const copied = api.experimental.session.import.mock.calls[0][0].messages;
  expect(copied).toHaveLength(3);
  expect(copied[2]).toMatchObject({ type: "assistant", content: [text, completed], time: { completed: expect.any(Number) } });
  expect(current).not.toHaveProperty("time.completed");
  expect(current.content).toHaveLength(5);
});

it("fails before importing when the current tool call is absent from its message", async () => {
  api.message.list.mockResolvedValue({ data: [user, { ...boundary, content: [] }], cursor: {} });
  await expect(run()).rejects.toThrow("tool call");
  expect(api.experimental.session.import).not.toHaveBeenCalled();
});
