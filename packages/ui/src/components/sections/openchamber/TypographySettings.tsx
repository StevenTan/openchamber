import React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isDesktopShell } from '@/lib/desktop';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { useI18n } from '@/lib/i18n';
import {
    CODE_FONT_OPTIONS,
    CUSTOM_FONT_ID,
    DEFAULT_MONO_FONT,
    DEFAULT_UI_FONT,
    UI_FONT_OPTIONS,
    UI_FONT_WEIGHT_OPTIONS,
    type UiFontWeight,
} from '@/lib/fontOptions';
import { DEFAULT_APP_ZOOM, DEFAULT_CHAT_FONT_SIZE, DEFAULT_INTERFACE_FONT_SIZE } from '@/lib/typography';
import { DEFAULT_EDITOR_FONT_SIZE, useUIStore } from '@/stores/useUIStore';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import {
    SettingsChipGroup,
    SettingsFieldRow,
    SETTINGS_ICON_BUTTON_CLASS,
    SETTINGS_NUMBER_STEPPER_ROW_CLASS,
    SETTINGS_NUMBER_UNIT_CLASS,
    SETTINGS_SELECT_TRIGGER_CLASS,
} from '../shared/SettingsSection';

const WEIGHT_LABELS = {
    regular: 'settings.openchamber.visual.option.uiFontWeight.regular',
    balanced: 'settings.openchamber.visual.option.uiFontWeight.balanced',
    strong: 'settings.openchamber.visual.option.uiFontWeight.strong',
} as const satisfies Record<UiFontWeight, string>;

const SIZE_INPUT_CLASS = 'typography-ui-label w-[5ch]';

type FontChoice<T extends string> = { id: T; label: string; stack: string; source?: unknown };

function FontField<T extends string>({
    label,
    sizeLabel,
    anchor,
    value,
    options,
    onFont,
    size,
    onSize,
    min,
    max,
    custom,
    onCustom,
    reset,
    resetLabel,
    resetDisabled,
    blocked,
    step = 0.5,
}: {
    label: string;
    sizeLabel: string;
    anchor: string;
    value: T;
    options: readonly FontChoice<T>[];
    onFont(value: T): void;
    size: number;
    onSize(value: number): void;
    min: number;
    max: number;
    custom: string;
    onCustom(value: string): void;
    reset(): void;
    resetLabel: string;
    resetDisabled: boolean;
    blocked: boolean;
    step?: number;
}) {
    const { t } = useI18n();
    return (
        <SettingsFieldRow label={label} settingsItem={anchor}>
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={value}
                    onValueChange={(next) => {
                        const option = options.find((item) => item.id === next);
                        if (option) onFont(option.id);
                    }}
                >
                    <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS} aria-label={label}>
                        <SelectValue>{options.find((option) => option.id === value)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem
                                key={option.id}
                                value={option.id}
                                disabled={blocked && Boolean(option.source)}
                            >
                                <span style={{ fontFamily: option.stack }}>{option.label}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <NumberInput
                    value={size}
                    onValueChange={onSize}
                    min={min}
                    max={max}
                    step={step}
                    className={SIZE_INPUT_CLASS}
                    aria-label={sizeLabel}
                />
                <span className={SETTINGS_NUMBER_UNIT_CLASS}>px</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={SETTINGS_ICON_BUTTON_CLASS}
                    onClick={reset}
                    disabled={resetDisabled}
                    aria-label={resetLabel}
                    title={t('settings.common.actions.reset')}
                >
                    <Icon name="restart" className="h-3.5 w-3.5" />
                </Button>
                {value === CUSTOM_FONT_ID ? (
                    <Input
                        value={custom}
                        onChange={(event) => onCustom(event.target.value)}
                        placeholder={t('settings.openchamber.visual.field.customFontPlaceholder')}
                        aria-label={t('settings.openchamber.visual.field.customFontAria')}
                        spellCheck={false}
                        autoComplete="off"
                        className="h-auto min-h-8 basis-full rounded-md px-3 py-[calc(0.25em*var(--padding-scale,1))] leading-[1.45]"
                    />
                ) : null}
            </div>
        </SettingsFieldRow>
    );
}

export function TypographySettings({ showInterface, showCode }: { showInterface: boolean; showCode: boolean }) {
    const { t } = useI18n();
    const fonts = useFontPreferences();
    const interfaceSize = useUIStore((s) => s.interfaceFontSizePx);
    const chatSize = useUIStore((s) => s.chatFontSizePx);
    const codeSize = useUIStore((s) => s.editorFontSize);
    const zoom = useUIStore((s) => s.appZoom);
    const weight = useUIStore((s) => s.uiFontWeight);
    const blocked = useEnterpriseMode();
    const state = useUIStore.getState();
    const customOption = {
        id: CUSTOM_FONT_ID,
        label: t('settings.openchamber.visual.field.customFont'),
        stack: 'inherit',
    } as const;
    const uiOptions = [...UI_FONT_OPTIONS, customOption];
    const codeOptions = [...CODE_FONT_OPTIONS, customOption];
    const chatOptions = [
        { id: 'interface' as const, label: t('settings.typography.followInterface'), stack: 'inherit' },
        ...uiOptions,
    ];
    return (
        <>
            {isDesktopShell() && (
                <SettingsFieldRow
                    label={t('settings.typography.zoom')}
                    settingsItem="appearance.interface-zoom"
                >
                    <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                        <NumberInput
                            value={zoom}
                            onValueChange={state.setAppZoom}
                            min={50}
                            max={200}
                            step={10}
                            className={SIZE_INPUT_CLASS}
                            aria-label={t('settings.typography.zoom')}
                        />
                        <span className={SETTINGS_NUMBER_UNIT_CLASS}>%</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={SETTINGS_ICON_BUTTON_CLASS}
                            disabled={zoom === DEFAULT_APP_ZOOM}
                            onClick={() => state.setAppZoom(DEFAULT_APP_ZOOM)}
                            aria-label={t('settings.typography.resetZoom')}
                            title={t('settings.common.actions.reset')}
                        >
                            <Icon name="restart" className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </SettingsFieldRow>
            )}
            {showInterface && (
                <>
                    <FontField
                        label={t('settings.openchamber.visual.field.interfaceFont')}
                        sizeLabel={t('settings.openchamber.visual.field.interfaceFontSize')}
                        anchor="appearance.interface-font-size"
                        value={fonts.uiFont}
                        options={uiOptions}
                        onFont={state.setUiFont}
                        size={interfaceSize}
                        onSize={state.setInterfaceFontSizePx}
                        min={6}
                        max={32}
                        custom={fonts.customUiFont}
                        onCustom={state.setCustomUiFont}
                        blocked={blocked}
                        resetLabel={t('settings.openchamber.visual.actions.resetInterfaceFontAria')}
                        resetDisabled={
                            fonts.uiFont === DEFAULT_UI_FONT && interfaceSize === DEFAULT_INTERFACE_FONT_SIZE
                        }
                        reset={() => {
                            state.setUiFont(DEFAULT_UI_FONT);
                            state.setInterfaceFontSizePx(DEFAULT_INTERFACE_FONT_SIZE);
                        }}
                    />
                    <FontField
                        label={t('settings.typography.chatFont')}
                        sizeLabel={t('settings.openchamber.visual.field.chatFontSize')}
                        anchor="appearance.chat-font-size"
                        value={fonts.chatFont}
                        options={chatOptions}
                        onFont={state.setChatFont}
                        size={chatSize}
                        onSize={state.setChatFontSizePx}
                        min={3}
                        max={64}
                        custom={fonts.customChatFont}
                        onCustom={state.setCustomChatFont}
                        blocked={blocked}
                        resetLabel={t('settings.typography.resetChatFont')}
                        resetDisabled={fonts.chatFont === 'interface' && chatSize === DEFAULT_CHAT_FONT_SIZE}
                        reset={() => {
                            state.setChatFont('interface');
                            state.setChatFontSizePx(DEFAULT_CHAT_FONT_SIZE);
                        }}
                    />
                </>
            )}
            {showCode && (
                <FontField
                    label={t('settings.openchamber.visual.field.codeFont')}
                    sizeLabel={t('settings.typography.codeFontSize')}
                    anchor="appearance.editor-font-size"
                    value={fonts.monoFont}
                    options={codeOptions}
                    onFont={state.setMonoFont}
                    size={codeSize}
                    onSize={state.setEditorFontSize}
                    step={1}
                    min={9}
                    max={32}
                    custom={fonts.customMonoFont}
                    onCustom={state.setCustomMonoFont}
                    blocked={blocked}
                    resetLabel={t('settings.openchamber.visual.actions.resetCodeFontAria')}
                    resetDisabled={
                        fonts.monoFont === DEFAULT_MONO_FONT && codeSize === DEFAULT_EDITOR_FONT_SIZE
                    }
                    reset={() => {
                        state.setMonoFont(DEFAULT_MONO_FONT);
                        state.setEditorFontSize(DEFAULT_EDITOR_FONT_SIZE);
                    }}
                />
            )}
            {showInterface && (
                <SettingsFieldRow
                    label={t('settings.openchamber.visual.field.interfaceFontWeight')}
                    info={t('settings.openchamber.visual.field.interfaceFontWeightInfo')}
                    settingsItem="appearance.interface-font-weight"
                >
                    <SettingsChipGroup
                        value={weight}
                        onChange={state.setUiFontWeight}
                        aria-label={t('settings.openchamber.visual.field.interfaceFontWeight')}
                        options={UI_FONT_WEIGHT_OPTIONS.map((item) => ({
                            value: item,
                            label: t(WEIGHT_LABELS[item]),
                        }))}
                    />
                </SettingsFieldRow>
            )}
        </>
    );
}
