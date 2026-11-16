import React from 'react';

import { Icon } from "@/components/icon/Icon";
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { useBackgroundSessionWork } from '@/hooks/useBackgroundSessionWork';
import { useKeybind } from '@/hooks/useKeybind';
import { useConfigStore } from '@/stores/useConfigStore';
import { getProviderModelDisplayName } from '@/lib/modelDisplay';
import { BackgroundWorkButton } from './BackgroundWorkButton';
import { registerFloatingPanelClearanceReader } from '@/components/chat/composer/state/composerInsetReaders';
import { WorkingPlaceholder } from '../message/parts/WorkingPlaceholder';

/** The scroll action shows working dots, with the arrow on hover or focus. */
const ScrollAction: React.FC<{ onClick: () => void; working?: boolean; statusLabel?: React.ReactNode }> = ({ onClick, working = false, statusLabel }) => {
    const { t } = useI18n();
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {/* The inner button leaves room for the pill's border. */}
                <button
                    type="button"
                    onClick={onClick}
                    aria-label={t('chat.scrollToBottom.aria')}
                    className="group/scroll-action inline-flex h-[calc(1.75rem-2px)] min-w-0 max-w-full flex-1 items-center rounded-full [corner-shape:round] text-start"
                >
                    {/* Keep the icon and dots centred within the mobile
                        touch-target floor. */}
                    <span className={cn('flex h-full flex-1 shrink-0 items-center justify-center text-muted-foreground', working ? 'w-[38px] basis-[38px]' : 'w-7 basis-7')}>
                        {working ? (
                            <span className="oc-scroll-working-dots inline-flex items-center gap-[4px] group-hover/scroll-action:hidden group-focus-visible/scroll-action:hidden" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                            </span>
                        ) : null}
                        <Icon name="arrow-down" className={cn('h-4 w-4', working && 'hidden group-hover/scroll-action:block group-focus-visible/scroll-action:block')} />
                    </span>
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{statusLabel ?? t('chat.scrollToBottom.aria')}</TooltipContent>
        </Tooltip>
    );
};

/**
 * Working dots carry the status label in the tooltip. The background action
 * is a sibling of the scroll button, never inside it.
 */
const WorkingPillBody: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const { activeModel, working } = useAssistantStatus();
    const providers = useConfigStore((state) => state.providers);
    const backgroundWork = useBackgroundSessionWork();
    useKeybind('background_session_work', () => {
        if (!working.canBackground) return false;
        backgroundWork();
    });

    const modelName = React.useMemo(() => {
        if (!activeModel) return null;
        const provider = providers.find((candidate) => candidate.id === activeModel.providerId);
        return getProviderModelDisplayName(provider, activeModel.modelId) || null;
    }, [activeModel, providers]);

    const status = working.isWorking ? (
        <WorkingPlaceholder
            isWorking={working.isWorking}
            status={working.status}
            isGenericStatus={working.isGenericStatus}
            isWaitingForPermission={working.isWaitingForPermission}
            retryInfo={working.retryInfo}
            modelName={modelName}
            providerId={activeModel?.providerId}
        />
    ) : undefined;

    return (
        <>
            <div className="sr-only">{status}</div>
            <ScrollAction
                onClick={onClick}
                working
                statusLabel={status ? <div aria-hidden="true">{status}</div> : undefined}
            />
            {working.canBackground ? <BackgroundWorkButton onClick={backgroundWork} className="me-0.5 h-6 w-6" /> : null}
        </>
    );
};

interface ScrollToBottomButtonProps {
    visible: boolean;
    /** Shows the session's animated working state. */
    working?: boolean;
    onClick: () => void;
    /** Measures the working surface for the transcript's live-edge clearance. */
    surfaceRef?: React.Ref<HTMLDivElement>;
}

const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ visible, working = false, onClick, surfaceRef }) => {
    return (
        <div
            ref={registerFloatingPanelClearanceReader}
            className={cn(
                'pointer-events-none absolute bottom-full inset-x-0 mb-2 transition-opacity duration-100',
                visible ? 'opacity-100' : 'opacity-0',
            )}
            style={{ transform: 'translateY(calc(-1 * var(--chat-floating-panel-clearance, 0px)))' }}
        >
            {/* The pill is centred above the composer's column. */}
            <div className="chat-input-column flex justify-center">
                {/* The soft shadow lives on this wrapper, apart from the
                    pill itself. */}
                <div className="inline-flex max-w-full rounded-full shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.10)] dark:shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.35)]">
                <div
                    ref={surfaceRef}
                    className={cn(
                        // Opaque surface with a hairline border, much lighter
                        // than the oc-glass-floating shadow stack.
                        // min-h, not h: the mobile touch-target floor grows
                        // the buttons inside to 36px, and the pill with them.
                        'oc-surface-floating oc-chat-floating-pill inline-flex min-h-7 max-w-full items-center rounded-full [corner-shape:round]',
                        'border border-black/[0.06] dark:border-white/[0.08]',
                        visible ? 'pointer-events-auto' : 'pointer-events-none',
                    )}
                >
                    {working && visible ? <WorkingPillBody onClick={onClick} /> : <ScrollAction onClick={onClick} />}
                </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ScrollToBottomButton);
