import React from 'react';

export function useComposerAttachmentWork() {
    const pendingPastedAttachmentFilenamesRef = React.useRef<Set<string>>(new Set());

    return {
        pendingPastedAttachmentFilenamesRef,
    };
}
