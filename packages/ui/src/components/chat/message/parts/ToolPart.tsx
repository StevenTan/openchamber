import React from 'react';
import { codeModeCallParts } from '@/lib/opencode/code-mode-parts';
import { readBackgroundShellID } from '@/lib/opencode/background-shell';
import { areRenderRelevantPartsEqual } from '../renderCompare';
import { useI18n } from '@/lib/i18n';
import { isShellTool, isSubagentTool, normalizeToolName } from '@/lib/opencode/tools';
import type { ToolPartProps } from './toolRow/types';
import { toolDisplayName } from './toolRow/toolDescriptions';
import { ToolPartContent } from './toolRow/ToolPartContent';
import { ToolPartErrorBoundary } from './toolRow/ToolPartErrorBoundary';
import { BackgroundShellToolPartContent } from './toolRow/BackgroundShellToolPartContent';
import { ShellToolPartContent } from './toolRow/ShellToolPartContent';
import { SubagentToolPartContent } from './toolRow/SubagentToolPartContent';
import { useShownToolPart } from './toolRow/useShownToolPart';

const ToolPart: React.FC<ToolPartProps> = (incoming) => {
    const { t } = useI18n();
    const calls = React.useMemo(() => codeModeCallParts(incoming.part), [incoming.part]);
    const part = useShownToolPart(incoming.part, calls.length > 0);
    const props = part === incoming.part ? incoming : { ...incoming, part };
    const toolName = normalizeToolName(props.part.tool) || 'tool';
    const displayName = toolDisplayName(toolName, t);
    const backgroundShellID = isShellTool(toolName) ? readBackgroundShellID(props.part) : undefined;
    const [expandedCalls, setExpandedCalls] = React.useState<ReadonlySet<string>>(() => new Set());
    const toggleCall = React.useCallback((id: string) => setExpandedCalls(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    }), []);

    const content = backgroundShellID
        ? <BackgroundShellToolPartContent {...props} shellID={backgroundShellID} />
        : isSubagentTool(toolName) ? <SubagentToolPartContent {...props} />
            : isShellTool(toolName) ? <ShellToolPartContent {...props} />
                : <ToolPartContent {...props} />;
    return (
        <ToolPartErrorBoundary
            displayName={displayName}
            errorLabel={t('chat.toolPart.error')}
            resetKey={props.part}
            toolName={toolName}
        >
            {calls.length > 0 ? <div className="space-y-1">
                {content}
                {calls.map(call => (
                    <ToolPart key={call.id} {...incoming} part={call} isExpanded={expandedCalls.has(call.id)} onToggle={toggleCall} />
                ))}
            </div> : content}
        </ToolPartErrorBoundary>
    );
};

export default React.memo(ToolPart, (prev, next) => {
    return areRenderRelevantPartsEqual([prev.part], [next.part])
        && prev.isExpanded === next.isExpanded
        && prev.isMobile === next.isMobile
        && prev.alwaysShowActions === next.alwaysShowActions
        && prev.onShowPopup === next.onShowPopup
        && prev.animateTailText === next.animateTailText
        && prev.failureReason === next.failureReason;
});
