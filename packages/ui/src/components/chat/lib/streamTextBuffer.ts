const ARRIVAL_WINDOW_MS = 100;
const CATCH_UP_WINDOW_MS = 120;

/** A visible source prefix, paced by arrivals and the remaining backlog. */
export class StreamTextBuffer {
    private source: string;
    private position: number;
    private arrivalRate = 0;
    private arrivedAt: number;
    private advancedAt: number;

    constructor(text: string, now: number) {
        this.source = text;
        this.position = text.length;
        this.arrivedAt = now;
        this.advancedAt = now;
    }

    update(text: string, now: number): void {
        if (text === this.source) return;
        if (!text.startsWith(this.source)) {
            this.source = text;
            this.arrivalRate = 0;
            this.flush(now);
            this.arrivedAt = now;
            return;
        }
        const sample = (text.length - this.source.length) / Math.max(ARRIVAL_WINDOW_MS, now - this.arrivedAt);
        this.arrivalRate = this.arrivalRate === 0 ? sample : this.arrivalRate * 0.5 + sample * 0.5;
        if (!this.pending) this.advancedAt = now;
        this.source = text;
        this.arrivedAt = now;
    }

    advance(now: number): string {
        const remaining = this.source.length - this.position;
        const rate = Math.max(this.arrivalRate, Math.max(1, remaining) / CATCH_UP_WINDOW_MS);
        this.position = Math.min(this.source.length, this.position + rate * (now - this.advancedAt));
        this.advancedAt = now;
        return this.text;
    }

    flush(now: number): string {
        this.position = this.source.length;
        this.advancedAt = now;
        return this.source;
    }

    get text(): string {
        let end = Math.floor(this.position);
        // Keep a UTF-16 surrogate pair together at the visible boundary.
        const last = this.source.charCodeAt(end - 1);
        if (end < this.source.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
        return this.source.slice(0, end);
    }

    get pending(): boolean {
        return this.position < this.source.length;
    }
}
