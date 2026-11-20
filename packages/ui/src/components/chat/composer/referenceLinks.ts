
import type { ReferenceLinkTarget } from '@/components/references/resolveComposerReferences';
import { referenceLinkChip as presentReferenceLinkChip } from '@/lib/messages/referenceLinkChip';
import type { RepositoryUrlMatcher } from '@/lib/source-control/repositoryUrlMatcher';
import type { TrackerUrlMatcher } from '@/lib/trackers/matchTrackerUrl';

import { composerReferenceKey, type ComposerReference } from './composerReferences';

const WEB_LINK = /https?:\/\/[^\s<>()"'`]+/gi;

type WebLinkRange = { start: number; end: number; link: string };

export const findWebLinks = (text: string): WebLinkRange[] => {
    if (!text.includes('http')) return [];
    const found: WebLinkRange[] = [];
    for (const match of text.matchAll(WEB_LINK)) {
        const link = match[0].replace(/[.,;:!?*_~]+$/, '');
        found.push({ start: match.index, end: match.index + link.length, link });
    }
    return found;
};

const referenceLinkTarget = (link: string, urls: RepositoryUrlMatcher, trackerUrls: TrackerUrlMatcher): ReferenceLinkTarget | null => {
    const tracked = trackerUrls(link);
    if (tracked) return { source: 'tracker', provider: tracked.provider, identifier: tracked.identifier };
    const item = urls.match(link);
    if (!item || item.kind === 'discussion') return null;
    return { source: 'repository', provider: item.provider, instance: item.instance, owner: item.owner, repo: item.repo, kind: item.kind, number: item.number };
};

export const findReferenceLinks = (
    text: string,
    urls: RepositoryUrlMatcher,
    trackerUrls: TrackerUrlMatcher,
): Array<{ link: string; target: ReferenceLinkTarget }> => {
    const seen = new Set<string>();
    return findWebLinks(text).flatMap(({ link }) => {
        if (seen.has(link)) return [];
        seen.add(link);
        const target = referenceLinkTarget(link, urls, trackerUrls);
        return target ? [{ link, target }] : [];
    });
};

export const referenceLinksInText = (text: string, read: ReadonlyMap<string, ComposerReference>): ComposerReference[] => {
    if (read.size === 0) return [];
    const references = new Map<string, ComposerReference>();
    for (const { link } of findWebLinks(text)) {
        const reference = read.get(link);
        if (reference && !references.has(composerReferenceKey(reference))) references.set(composerReferenceKey(reference), reference);
    }
    return [...references.values()];
};

export const withReferencesFromText = (
    chips: readonly ComposerReference[],
    fromText: readonly ComposerReference[],
): ComposerReference[] => {
    const chipKeys = new Set(chips.map(composerReferenceKey));
    return [...chips, ...fromText.filter((reference) => !chipKeys.has(composerReferenceKey(reference)))];
};

export const referenceLinkChip = (reference: ComposerReference, urls: RepositoryUrlMatcher) => {
    // A shared page's link leaves the text as it lands (its chip sits above it), so no link reads as one.
    if (reference.kind === 'shared-page') {
        const title = reference.title ?? reference.host;
        return { label: title, title, iconHref: '#oc-pages' };
    }
    const { label, title, icon } = presentReferenceLinkChip(reference, urls.descriptorOf);
    return { label, title, iconHref: `#oc-${icon}` };
};
