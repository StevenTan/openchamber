import { describe, expect, test } from 'bun:test';
import { StreamTextBuffer } from './streamTextBuffer';

describe('StreamTextBuffer', () => {
    test('reveals unfinished prose and open code as source prefixes', () => {
        for (const source of ['An unfinished paragraph keeps growing', '```ts\nconst value = 1;\nconst tail']) {
            const buffer = new StreamTextBuffer('', 0);
            buffer.update(source, 100);
            let previous = '';
            for (let now = 132; now <= 228; now += 32) {
                const visible = buffer.advance(now);
                expect(visible.startsWith(previous)).toBe(true);
                expect(source.startsWith(visible)).toBe(true);
                expect(visible.length).toBeGreaterThan(previous.length);
                previous = visible;
                if (!buffer.pending) break;
            }
            expect(buffer.text).toBe(source);
            expect(buffer.pending).toBe(false);
        }
    });

    test('catches up with steady arrivals without accumulating a growing delay', () => {
        const buffer = new StreamTextBuffer('', 0);
        let source = '';
        for (let now = 100; now <= 5000; now += 100) {
            source += 'word '.repeat(6);
            buffer.update(source, now);
            for (const offset of [32, 64, 96]) buffer.advance(now + offset);
            expect(source.length - buffer.text.length).toBeLessThan(35);
        }
        expect(buffer.advance(5300)).toBe(source);
        expect(buffer.pending).toBe(false);
    });

    test('preserves surrogate pairs while releasing Unicode text', () => {
        const buffer = new StreamTextBuffer('', 0);
        const source = '你好😀你好😀你好😀';
        buffer.update(source, 100);
        for (let now = 101; now <= 220; now += 1) {
            const visible = buffer.advance(now);
            expect(/[\uD800-\uDBFF]$/.test(visible)).toBe(false);
            expect(source.startsWith(visible)).toBe(true);
        }
        expect(buffer.text).toBe(source);
    });

    test('renders existing text and authoritative replacements immediately', () => {
        const buffer = new StreamTextBuffer('Existing text', 0);
        expect(buffer.text).toBe('Existing text');
        buffer.update('Replacement', 100);
        expect(buffer.text).toBe('Replacement');
        buffer.update('Re', 110);
        expect(buffer.text).toBe('Re');
        expect(buffer.pending).toBe(false);
    });

    test('flushes a pending suffix at completion', () => {
        const buffer = new StreamTextBuffer('Start', 0);
        buffer.update('Start with a pending suffix', 100);
        expect(buffer.pending).toBe(true);
        expect(buffer.flush(101)).toBe('Start with a pending suffix');
        expect(buffer.pending).toBe(false);
    });

    test('a single character after a long pause catches up promptly', () => {
        const buffer = new StreamTextBuffer('Text', 0);
        buffer.update('Text.', 10000);
        for (let now = 10032; now <= 10128; now += 32) buffer.advance(now);
        expect(buffer.text).toBe('Text.');
        expect(buffer.pending).toBe(false);
    });
});
