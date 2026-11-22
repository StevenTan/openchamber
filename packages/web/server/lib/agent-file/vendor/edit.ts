// Adapted from OpenCode v2.3.2, https://github.com/anomalyco/opencode. MIT; see LICENSE.txt.
const crlf = "\r\n";
interface Match {
    readonly start: number;
    readonly end: number;
}
const normalizeForMatch = (value: string) => value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
export const findOccurrences = (content: string, search: string) => {
    const result: Match[] = [];
    let offset = 0;
    while ((offset = content.indexOf(search, offset)) !== -1) {
        result.push({ start: offset, end: offset + search.length });
        offset += search.length;
    }
    return result;
};
const findLineOccurrences = (content: string, search: string) => {
    const trailingNewline = search.endsWith("\n");
    const expected = search.split("\n");
    if (trailingNewline)
        expected.pop();
    const lines = [...content.matchAll(/[^\n]*(?:\n|$)/g)]
        .filter((match) => match[0] !== "")
        .map((match) => {
        const newline = match[0].endsWith("\n");
        const text = newline ? match[0].slice(0, -1) : match[0];
        return {
            start: match.index,
            end: match.index + match[0].length,
            text,
            contentEnd: match.index + text.length - (text.endsWith("\r") ? 1 : 0),
            newline,
        };
    });
    const candidates = lines.flatMap((line, index) => {
        const actual = lines.slice(index, index + expected.length);
        if (actual.length !== expected.length)
            return [];
        // SAFETY: The enclosing match or loop establishes this indexed value.
        if (!actual.every((item, lineIndex) => normalizeForMatch(item.text.trimEnd()) === normalizeForMatch((expected[lineIndex] as string).trimEnd())))
            return [];
        // SAFETY: The enclosing match or loop establishes this indexed value.
        const last = actual.at(-1) as (typeof actual)[number];
        if (trailingNewline && !last.newline)
            return [];
        return [{ start: line.start, end: trailingNewline ? last.end : last.contentEnd }];
    });
    return candidates.reduce<Match[]>((result, candidate) => {
        if (result.some((match) => match.end > candidate.start && match.start < candidate.end))
            return result;
        result.push(candidate);
        return result;
    }, []);
};
const lineEnding = (text: string, fallback: string) => {
    const crlfCount = text.split(crlf).length - 1;
    const lfCount = text.split("\n").length - 1 - crlfCount;
    if (crlfCount === lfCount)
        return fallback;
    return crlfCount > lfCount ? crlf : "\n";
};
const withRegionEndings = (region: string, replacement: string, fallback: string) => {
    const before = region.split(/\r?\n/);
    const endings = [...region.matchAll(/\r?\n/g)].map((match) => match[0]);
    const after = replacement.split("\n");
    const key = (line: string) => normalizeForMatch(line.trimEnd());
    const source = alignLines(before.map(key), after.map(key));
    // SAFETY: The enclosing match or loop establishes this indexed value.
    return after.map((line, index) => (index === after.length - 1 ? line : line + (endings[source[index] as number] ?? fallback))).join("");
};
const alignLines = (before: string[], after: string[]) => {
    const width = after.length + 1;
    const table = new Uint32Array((before.length + 1) * width);
    for (let i = before.length - 1; i >= 0; i--)
        for (let j = after.length - 1; j >= 0; j--)
            // SAFETY: Both loop coordinates and their next-row/column cells are inside the allocated table.
            table[i * width + j] =
                before[i] === after[j]
                    // SAFETY: The enclosing match or loop establishes this indexed value.
                    ? (table[(i + 1) * width + j + 1] as number) + 1
                    // SAFETY: The enclosing match or loop establishes this indexed value.
                    : Math.max((table[(i + 1) * width + j] as number), (table[i * width + j + 1] as number));
    const result: (number | undefined)[] = [];
    // SAFETY: The enclosing match or loop establishes this indexed value.
    const gap = { before: [] as number[], after: [] as number[] };
    const flush = () => {
        gap.after.forEach((j, k) => (result[j] = gap.before[k]));
        gap.before = [];
        gap.after = [];
    };
    let i = 0;
    let j = 0;
    while (i < before.length && j < after.length) {
        if (before[i] === after[j]) {
            flush();
            result[j++] = i++;
            continue;
        }
        // SAFETY: The enclosing match or loop establishes this indexed value.
        if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number))
            gap.before.push(i++);
        else
            gap.after.push(j++);
    }
    while (i < before.length)
        gap.before.push(i++);
    while (j < after.length)
        gap.after.push(j++);
    flush();
    return result;
};
export const matchView = (source: string, oldString: string, newString: string) => {
    const view = source.replaceAll(crlf, "\n");
    const removed = [...source.matchAll(/\r\n/g)].map((match, index) => match.index - index);
    const fileEnding = lineEnding(source, "\n");
    const search = oldString.replaceAll(crlf, "\n");
    const replacement = newString.replaceAll(crlf, "\n");
    const exact = findOccurrences(view, search);
    const unicode = exact.length > 0 ? [] : findOccurrences(normalizeForMatch(view), normalizeForMatch(search));
    const trailing = exact.length > 0 || unicode.length > 0 ? [] : findLineOccurrences(view, search);
    return {
        matches: (exact.length > 0 ? exact : unicode.length > 0 ? unicode : trailing).map((match) => ({
            start: match.start + countBefore(removed, match.start),
            end: match.end + countBefore(removed, match.end),
        })),
        replace: (match: Match) => {
            const region = source.slice(match.start, match.end);
            return withRegionEndings(region, replacement, lineEnding(region, fileEnding));
        },
    };
};
const countBefore = (positions: number[], offset: number) => {
    let low = 0;
    let high = positions.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        // SAFETY: The enclosing match or loop establishes this indexed value.
        if ((positions[middle] as number) < offset)
            low = middle + 1;
        else
            high = middle;
    }
    return low;
};
