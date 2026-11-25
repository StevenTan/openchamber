import { describe, expect, test } from 'bun:test';
import type { AssistantMessage, Part, ToolPart } from '@/lib/opencode/model';
import { projectTurnChangedFiles } from './projectTurnSummary';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry } from './types';

const diff = '@@ -1,1 +1,2 @@\n-before\n+after\n+added';

function user(): ChatMessageEntry {
    return {
        info: { id: 'user', sessionID: 'session', role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', id: 'request', messageID: 'user', sessionID: 'session', text: 'Request' }],
    };
}

function assistant(id: string, parts: Part[], finish?: AssistantMessage['finish']): ChatMessageEntry {
    return {
        info: {
            id, sessionID: 'session', role: 'assistant', finish,
            time: { created: 2, completed: finish ? 3 : undefined },
            modelID: 'model', providerID: 'provider', agent: 'build', cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
        parts,
    };
}

function edit(id: string, filePath: string, patch = diff): ToolPart {
    return {
        id, callID: id, type: 'tool', tool: 'edit', messageID: 'assistant', sessionID: 'session',
        state: { status: 'completed', input: { filePath }, metadata: { diff: patch }, output: '', time: { start: 1, end: 2 } },
    };
}

describe('projectTurnChangedFiles', () => {
    test('lists the files the turn edited, with the counts from each call patch', () => {
        expect(projectTurnChangedFiles([
            assistant('a', [edit('one', '/project/src/a.ts'), edit('two', '/project/src/b.ts')], 'stop'),
        ])).toEqual([
            { file: '/project/src/a.ts', additions: 2, deletions: 1 },
            { file: '/project/src/b.ts', additions: 2, deletions: 1 },
        ]);
    });

    test('keeps a file the tool touched even when its counts are unknown', () => {
        const write: ToolPart = {
            id: 'write', callID: 'write', type: 'tool', tool: 'write', messageID: 'assistant', sessionID: 'session',
            state: { status: 'completed', input: { filePath: '/project/src/c.ts', content: 'x' }, metadata: {}, output: '', time: { start: 1, end: 2 } },
        };
        expect(projectTurnChangedFiles([assistant('a', [write], 'stop')]))
            .toEqual([{ file: '/project/src/c.ts' }]);
    });

    test('a turn that edited nothing yields no files', () => {
        expect(projectTurnChangedFiles([assistant('a', [], 'stop')])).toBeUndefined();
    });

    test('uses the latest recorded net statistics rather than summing repeated edits', () => {
        const first = edit('one', '/project/src/a.ts');
        const last = edit('two', '/project/src/a.ts');
        last.state = { ...last.state, status: 'completed', output: '', time: { start: 1, end: 2 }, metadata: {
            openchamberTurnDiff: { turnID: 'turn', revision: 2, files: [{ file: 'src/a.ts', status: 'modified', additions: 1, deletions: 1 }] },
        } };
        expect(projectTurnChangedFiles([assistant('a', [first]), assistant('b', [last], 'stop')])).toEqual([
            { file: 'src/a.ts', additions: 1, deletions: 1, turnId: 'turn' },
        ]);
        last.state.metadata = { openchamberTurnDiff: { turnID: 'turn', revision: 3, files: [] } };
        expect(projectTurnChangedFiles([assistant('a', [first]), assistant('b', [last], 'stop')])).toBeUndefined();
    });

    test('keeps each native turn reference when hidden prompts share a displayed turn', () => {
        const one = edit('one', 'a.ts');
        const two = edit('two', 'b.ts');
        if (one.state.status !== 'completed' || two.state.status !== 'completed') throw new Error('Expected settled tools');
        one.state.metadata = { openchamberTurnDiff: { turnID: 'visible', revision: 1, files: [{ file: 'a.ts', status: 'modified', additions: 1, deletions: 1 }] } };
        two.state.metadata = { openchamberTurnDiff: { turnID: 'hidden', revision: 1, files: [{ file: 'b.ts', status: 'modified', additions: 2, deletions: 1 }] } };
        const messages = [assistant('a', [one]), assistant('b', [two], 'stop')];
        expect(projectTurnChangedFiles(messages)?.map(({ file, turnId }) => ({ file, turnId }))).toEqual([{ file: 'a.ts', turnId: 'visible' }, { file: 'b.ts', turnId: 'hidden' }]);
        two.state.metadata = { openchamberTurnDiff: { turnID: 'hidden', revision: 2, files: [] } };
        expect(projectTurnChangedFiles(messages)?.map((file) => file.file)).toEqual(['a.ts']);
        one.state.metadata = { openchamberTurnDiff: { turnID: 'visible', error: 'Storage unavailable' } };
        two.state.metadata = { openchamberTurnDiff: { turnID: 'hidden', revision: 3, files: [{ file: 'b.ts', status: 'modified', additions: 1, deletions: 1 }] } };
        expect(projectTurnChangedFiles(messages)?.map(({ file, turnId }) => ({ file, turnId }))).toEqual([{ file: 'b.ts', turnId: 'hidden' }]);
    });

    test('v2 has no working-tree snapshot, so a subagent turn lists nothing of its own', () => {
        const task: ToolPart = {
            id: 'child', callID: 'child', type: 'tool', tool: 'task', messageID: 'assistant', sessionID: 'session',
            state: { status: 'completed', input: {}, metadata: { sessionId: 'child-session' }, output: '', time: { start: 1, end: 2 } },
        };
        expect(projectTurnChangedFiles([assistant('a', [task], 'stop')])).toBeUndefined();
    });

    test('uses completed net statistics when parallel tools finish in reverse transcript order', () => {
        const first = edit('one', 'a.ts');
        const second = edit('two', 'b.ts');
        if (first.state.status !== 'completed' || second.state.status !== 'completed') throw new Error('Expected settled tools');
        first.state.metadata = { openchamberTurnDiff: { turnID: 'turn', revision: 2, files: [{ file: 'b.ts', status: 'modified', additions: 1, deletions: 1 }] } };
        second.state.metadata = { openchamberTurnDiff: { turnID: 'turn', revision: 1 } };
        expect(projectTurnChangedFiles([assistant('a', [first, second], 'stop')])).toEqual([
            { file: 'b.ts', additions: 1, deletions: 1, turnId: 'turn' },
        ]);
    });
});

describe('projectTurnRecords changed files', () => {
    const options = { showTurnChangedFiles: true };

    test('projects files once the turn has a final answer and not before', () => {
        const parts = [edit('one', '/project/src/a.ts')];
        const streaming = projectTurnRecords([user(), assistant('a', parts)], options);
        expect(streaming.turns[0]?.changedFiles).toBeUndefined();

        const finished = projectTurnRecords([user(), assistant('a', parts, 'stop')], options);
        expect(finished.turns[0]?.changedFiles).toEqual([{ file: '/project/src/a.ts', additions: 2, deletions: 1 }]);
    });

    test('leaves files out while the setting is off', () => {
        const projection = projectTurnRecords(
            [user(), assistant('a', [edit('one', '/project/src/a.ts')], 'stop')],
            { ...options, showTurnChangedFiles: false },
        );
        expect(projection.turns[0]?.changedFiles).toBeUndefined();
    });
});
