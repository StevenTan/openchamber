import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { MobileSheetRow, PICKER_SECTION_HEADER_CLASS } from '@/components/ui/MobileSheetList';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TooltipLabelWithShortcut } from '@/components/ui/action-toolbar';
import { useI18n } from '@/lib/i18n';
import { useWidthMorph } from '@/lib/motion/useSizeMorph';
import { cn } from '@/lib/utils';
import { MobileEffortControl } from './MobileEffortButton';
import { useModelControlsAppearance } from './useModelControlsAppearance';
import { formatEffortLabel, getEffortTone, getEffortToneClass } from './mobileControlsUtils';

export function ModelControlsLayout({ className, model, effort, agent, spread = false }: {
    className?: string;
    model: React.ReactNode;
    effort?: React.ReactNode;
    agent?: React.ReactNode;
    spread?: boolean;
}) {
    const { isMobile, sizeVariant } = useModelControlsAppearance();
    return <div className={cn('flex items-center min-w-0', !isMobile && '@container/model-controls', isMobile && 'w-full', className)}>
        <div className={cn('flex items-center min-w-0 flex-1', spread ? 'justify-between' : 'justify-end',
            isMobile ? 'gap-x-1' : sizeVariant === 'vscode' ? 'gap-x-2' : 'gap-x-4',
            sizeVariant === 'default' && 'model-controls__row pe-3')}>
            <div className={cn('flex items-center min-w-0', isMobile ? 'gap-x-0.5' : sizeVariant === 'vscode' ? 'gap-x-2' : 'gap-x-1.5')}>
                {model}{effort}
            </div>
            {agent}
        </div>
    </div>;
}

export function ModelPickerLabel({ labelRef, label, icon, pending, truncated }: {
    labelRef?: React.Ref<HTMLSpanElement>;
    label: string;
    icon: React.ReactNode;
    pending?: boolean;
    truncated?: boolean;
}) {
    const { controlTextSize } = useModelControlsAppearance();
    return <>
        {icon}
        <span ref={labelRef} className={cn('model-controls__model-label overflow-hidden text-ellipsis font-medium whitespace-nowrap min-w-0 max-w-[260px]', controlTextSize,
            pending ? 'text-muted-foreground' : 'text-foreground')}>
            <span className={cn('marquee-text', truncated && 'marquee-text--active')}>{label}</span>
        </span>
    </>;
}

export function ModelSelectorMenu({ open, onOpenChange, side, trigger, triggerRef, ariaLabel, children, onKeyDownCapture }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    side: 'top' | 'bottom';
    trigger: React.ReactElement;
    triggerRef: React.Ref<HTMLDivElement>;
    ariaLabel?: string;
    children: React.ReactNode;
    onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
}) {
    const { buttonHeight } = useModelControlsAppearance();
    return <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <TooltipTrigger asChild><DropdownMenuTrigger asChild nativeButton={false}>
            <div ref={triggerRef} aria-label={ariaLabel} className={cn('model-controls__model-trigger flex items-center gap-1.5 cursor-pointer select-none hover:bg-transparent hover:opacity-70 min-w-0 overflow-hidden', buttonHeight)}>{trigger}</div>
        </DropdownMenuTrigger></TooltipTrigger>
        <DropdownMenuContent side={side} className="w-[min(380px,calc(100vw-2rem))] p-0 flex flex-col overflow-hidden"
            align="end" alignOffset={-40} constrainToMain collisionAvoidance={{ side: 'none', align: 'shift' }} onKeyDownCapture={onKeyDownCapture}>
            {children}
        </DropdownMenuContent>
    </DropdownMenu>;
}

export function MobileModelTrigger({ onOpenModel, label, icon, className, unavailableText, disabled }: {
    onOpenModel: () => void;
    label: string;
    icon: React.ReactNode;
    className?: string;
    unavailableText?: string;
    disabled?: boolean;
}) {
    return <button type="button" onClick={onOpenModel} disabled={disabled} onMouseDown={event => event.preventDefault()}
        onPointerDownCapture={event => { if (event.pointerType === 'touch') event.preventDefault(); }}
        className={cn('inline-flex h-9 -my-[5px] min-h-0 min-w-0 items-stretch rounded-lg typography-micro font-medium text-foreground/80 focus:outline-none hover:bg-[var(--interactive-hover)]', className)}
        title={unavailableText ?? label} aria-label={unavailableText}>
        <span className="flex h-full w-full min-w-0 items-center gap-1">{icon}<span className="truncate">{label}</span></span>
    </button>;
}

export function ThinkingSelector({ variant, options, onSelect, tooltip, shortcut, onOpenMobile }: {
    variant?: string;
    options: Array<string | undefined>;
    onSelect: (variant: string | undefined) => void;
    tooltip?: string;
    shortcut?: string;
    onOpenMobile?: () => void;
}) {
    const { t } = useI18n();
    const { isMobile, buttonHeight, controlIconSize, controlTextSize } = useModelControlsAppearance();
    const triggerRef = React.useRef<HTMLDivElement>(null);
    useWidthMorph(triggerRef);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const label = variant ? formatEffortLabel(variant) : t('chat.modelControls.default');
    const tooltipText = tooltip ?? `${t('chat.modelControls.thinking')}: ${label}`;
    const optionLabel = (value: string | undefined) => value ? formatEffortLabel(value) : t('chat.modelControls.default');
    const triggerLabel = <>
        <Icon name="brain-ai-3" className={cn('model-controls__variant-icon flex-shrink-0 text-muted-foreground group-hover:text-foreground', controlIconSize)} />
        <span aria-hidden="true" className={cn('model-controls__variant-slash text-muted-foreground/60', controlTextSize)}>/</span>
        <span className={cn('model-controls__variant-label font-medium min-w-0 truncate lowercase', controlTextSize, getEffortToneClass(variant),
            getEffortTone(variant) === 'default' ? 'group-hover:text-foreground' : 'group-hover:opacity-100', isMobile ? 'max-w-[60px]' : 'max-w-[180px]')}>{label}</span>
    </>;
    if (isMobile) return <>
        {onOpenMobile ? <button type="button" onClick={onOpenMobile} onMouseDown={event => event.preventDefault()}
            onPointerDownCapture={event => { if (event.pointerType === 'touch') event.preventDefault(); }} aria-label={tooltipText}
            className={cn('model-controls__variant-trigger group -my-[5px] flex flex-shrink-0 items-center gap-1 px-1.5 focus:outline-none cursor-pointer hover:bg-transparent', buttonHeight)}>{triggerLabel}</button>
            : <MobileEffortControl variant={variant}
                onCycleThinking={() => onSelect(options[(options.indexOf(variant) + 1) % options.length])}
                onOpenThinking={() => setMobileOpen(true)} />}

        <MobileOverlayPanel open={mobileOpen} onClose={() => setMobileOpen(false)} title={t('chat.modelControls.thinking')}>
            {options.map(value => <MobileSheetRow key={value ?? 'default'} selected={value === variant} onClick={() => { onSelect(value); setMobileOpen(false); }}>{optionLabel(value)}</MobileSheetRow>)}
        </MobileOverlayPanel>
    </>;
    return <Tooltip delayDuration={600}>
        <DropdownMenu>
            <TooltipTrigger asChild><DropdownMenuTrigger asChild nativeButton={false}>
                <div ref={triggerRef} aria-label={tooltipText} className={cn('model-controls__variant-trigger group flex flex-shrink-0 items-center gap-1 cursor-pointer select-none hover:bg-transparent overflow-hidden', buttonHeight)}>{triggerLabel}</div>
            </DropdownMenuTrigger></TooltipTrigger>
            <DropdownMenuContent side="top" align="end" alignOffset={-40} className="w-max max-w-[calc(100vw-2rem)]">
                <DropdownMenuLabel className={PICKER_SECTION_HEADER_CLASS}>{t('chat.modelControls.thinking')}</DropdownMenuLabel>
                {options.map(value => <DropdownMenuItem key={value ?? 'default'} className="typography-meta" onSelect={() => onSelect(value)}>
                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                        <span className="typography-meta font-medium text-foreground truncate min-w-0 lowercase">{optionLabel(value)}</span>
                        {value === variant && <Icon name="check" className="size-4 text-inherit flex-shrink-0" />}
                    </div>
                </DropdownMenuItem>)}
                <div className="-mx-1 -mb-1 mt-1 flex items-center gap-x-4 overflow-hidden whitespace-nowrap border-t border-edge-muted px-3 pt-1 pb-1.5 typography-micro text-muted-foreground">
                    <span>{t('chat.modelControls.keyboardHintNavigate')}</span>
                    {shortcut ? <span>{t('chat.modelControls.keyboardHintSwitchThinking', { shortcut })}</span> : null}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent side="top"><TooltipLabelWithShortcut label={tooltipText} shortcut={shortcut} /></TooltipContent>
    </Tooltip>;
}
