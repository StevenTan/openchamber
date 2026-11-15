import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { dispatchRowExpand, onRowExpand } from './timelineScrollIntent';

const browser = new Window();
const previous = { document: globalThis.document, Element: globalThis.Element, CustomEvent: globalThis.CustomEvent, MouseEvent: globalThis.MouseEvent, DOMRect: globalThis.DOMRect };
Object.assign(globalThis, { document: browser.document, Element: browser.Element, CustomEvent: browser.CustomEvent, MouseEvent: browser.MouseEvent, DOMRect: browser.DOMRect });
afterAll(() => {
    Object.assign(globalThis, previous);
    browser.happyDOM.abort();
});

test('native and shared disclosure clicks release follow before the opening handler', () => {
    for (const markup of [
        '<details><summary><span>Details</span></summary><p>Body</p></details>',
        '<div data-slot="collapsible" data-closed><button aria-expanded="false"><span>Fields</span></button></div>',
    ]) {
        const container = document.createElement('div');
        container.innerHTML = markup;
        const order: string[] = [];
        const stop = onRowExpand(container, () => order.push('release'));
        container.querySelector('summary, button')!.addEventListener('click', (event) => {
            event.stopPropagation();
            order.push('open');
        });
        container.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(order).toEqual(['release', 'open']);
        stop();
    }
});

test('closing, disabled controls, menus and unrelated buttons retain follow', () => {
    for (const markup of [
        '<details open><summary>Details</summary></details>',
        '<details><summary><a href="#link">Link</a></summary></details>',
        '<div data-slot="collapsible" data-open><button aria-expanded="true">Close</button></div>',
        '<div data-slot="collapsible" data-closed data-disabled><button aria-expanded="false">Disabled root</button></div>',
        '<div data-slot="collapsible" data-closed><button disabled aria-expanded="false">Disabled</button></div>',
        '<div data-slot="collapsible" data-closed><button aria-disabled="true" aria-expanded="false">Disabled</button></div>',
        '<div data-slot="collapsible" data-closed><button aria-haspopup="menu" aria-expanded="false">Menu</button></div>',
        '<button aria-expanded="false">Other control</button>',
    ]) {
        const container = document.createElement('div');
        container.innerHTML = markup;
        let releases = 0;
        const stop = onRowExpand(container, () => releases++);
        const control = container.querySelector('a') ?? container.querySelector('button, summary')!;
        control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(releases).toBe(0);
        stop();
    }
});

test('explicit expansion and delegated clicks stop with the viewport subscription', () => {
    const container = document.createElement('div');
    container.innerHTML = '<details><summary>Details</summary></details>';
    let releases = 0;
    const stop = onRowExpand(container, () => releases++);
    dispatchRowExpand(container);
    expect(releases).toBe(1);
    stop();
    container.querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    dispatchRowExpand(container);
    expect(releases).toBe(1);
});

test('a disclosure retains follow only while its turn header is stuck at the viewport edge', () => {
    for (const markup of [
        '<details><summary>Context</summary></details>',
        '<div data-slot="collapsible" data-closed><button aria-expanded="false">Fields</button></div>',
    ]) {
        for (const stuck of [true, false]) {
            const container = document.createElement('div');
            container.dataset.scrollbar = 'chat';
            container.innerHTML = `<div data-turn-sticky-header>${markup}</div>`;
            const header = container.querySelector<HTMLElement>('[data-turn-sticky-header]')!;
            header.getBoundingClientRect = () => new DOMRect(0, stuck ? 0 : 120, 100, 40);
            let releases = 0;
            const stop = onRowExpand(container, () => releases++);
            header.querySelector('button, summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(releases).toBe(stuck ? 0 : 1);
            stop();
        }
    }
});
