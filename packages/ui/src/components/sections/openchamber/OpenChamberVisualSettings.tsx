import React from 'react';
import { ThemeAppearancePicker } from './ThemeAppearancePicker';
import { TypographySettings } from './TypographySettings';

import { DEFAULT_SPACING_SCALE, useUIStore } from '@/stores/useUIStore';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Icon } from "@/components/icon/Icon";
import {
    isDesktopShell,
    isVSCodeRuntime,
    isWebRuntime,
    usesFramelessElectronChrome,
    type DesktopWindowControlsPosition,
    type DesktopWindowControlsStyle,
} from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';
import { usePwaDetection } from '@/hooks/usePwaDetection';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { useI18n } from '@/lib/i18n';
import { normalizeMobileKeyboardMode, supportsMobileKeyboardResizeContent, type MobileKeyboardMode } from '@/lib/mobileKeyboardMode';
import {
    SettingsSection,
    SettingsTwoColumn,
    SettingsStackedField,
    SettingsFieldRow,
    SettingsCheckboxRow,
    SettingsChipGroup,
    SETTINGS_SELECT_TRIGGER_CLASS,
    SETTINGS_ICON_BUTTON_CLASS,
    SETTINGS_CONTROL_CLUSTER_CLASS,
    SETTINGS_NUMBER_STEPPER_ROW_CLASS,
    SETTINGS_NUMBER_UNIT_CLASS,
    SETTINGS_NUMBER_INPUT_CLASS,
    SETTINGS_FIELDS_STACK_CLASS,
    SETTINGS_OPTION_STACK_CLASS,
} from '@/components/sections/shared/SettingsSection';

interface Option<T extends string> {
    id: T;
    labelKey: string;
    descriptionKey?: string;
}

const DEFAULT_PWA_INSTALL_NAME = 'OpenChamber - AI Coding Assistant';
const PWA_ORIENTATION_OPTIONS: Option<'system' | 'portrait' | 'landscape'>[] = [
    {
        id: 'system',
        labelKey: 'settings.openchamber.visual.option.pwaOrientation.system.label',
        descriptionKey: 'settings.openchamber.visual.option.pwaOrientation.system.description',
    },
    {
        id: 'portrait',
        labelKey: 'settings.openchamber.visual.option.pwaOrientation.portrait.label',
        descriptionKey: 'settings.openchamber.visual.option.pwaOrientation.portrait.description',
    },
    {
        id: 'landscape',
        labelKey: 'settings.openchamber.visual.option.pwaOrientation.landscape.label',
        descriptionKey: 'settings.openchamber.visual.option.pwaOrientation.landscape.description',
    },
];

const MOBILE_KEYBOARD_MODE_OPTIONS: Option<MobileKeyboardMode>[] = [
    {
        id: 'native',
        labelKey: 'settings.openchamber.visual.option.mobileKeyboardMode.native.label',
        descriptionKey: 'settings.openchamber.visual.option.mobileKeyboardMode.native.description',
    },
    {
        id: 'resize-content',
        labelKey: 'settings.openchamber.visual.option.mobileKeyboardMode.resizeContent.label',
        descriptionKey: 'settings.openchamber.visual.option.mobileKeyboardMode.resizeContent.description',
    },
];

type PwaInstallNameWindow = Window & {
    __OPENCHAMBER_SET_PWA_INSTALL_NAME__?: (value: string) => string;
    __OPENCHAMBER_SET_PWA_ORIENTATION__?: (value: 'system' | 'portrait' | 'landscape') => 'system' | 'portrait' | 'landscape';
    __OPENCHAMBER_UPDATE_PWA_MANIFEST__?: () => void;
};

const normalizePwaOrientation = (value: unknown): 'system' | 'portrait' | 'landscape' => {
    return value === 'portrait' || value === 'landscape' ? value : 'system';
};

const TIME_FORMAT_OPTIONS: Option<'auto' | '12h' | '24h'>[] = [
    {
        id: 'auto',
        labelKey: 'settings.openchamber.visual.option.timeFormat.auto.label',
        descriptionKey: 'settings.openchamber.visual.option.timeFormat.auto.description',
    },
    {
        id: '24h',
        labelKey: 'settings.openchamber.visual.option.timeFormat.24h.label',
        descriptionKey: 'settings.openchamber.visual.option.timeFormat.24h.description',
    },
    {
        id: '12h',
        labelKey: 'settings.openchamber.visual.option.timeFormat.12h.label',
        descriptionKey: 'settings.openchamber.visual.option.timeFormat.12h.description',
    },
];

const WEEK_START_OPTIONS: Option<'auto' | 'monday' | 'sunday'>[] = [
    {
        id: 'auto',
        labelKey: 'settings.openchamber.visual.option.weekStart.auto.label',
        descriptionKey: 'settings.openchamber.visual.option.weekStart.auto.description',
    },
    {
        id: 'monday',
        labelKey: 'settings.openchamber.visual.option.weekStart.monday.label',
    },
    {
        id: 'sunday',
        labelKey: 'settings.openchamber.visual.option.weekStart.sunday.label',
    },
];

type VisibleSetting = 'theme' | 'windowControlsPosition' | 'pwaInstallName' | 'pwaOrientation' | 'mobileKeyboardMode' | 'timeFormat' | 'weekStart' | 'fontSize' | 'editorFontSize' | 'spacing' | 'inputBarOffset' | 'animatedActivityIndicators';

const WINDOW_CONTROLS_POSITION_OPTIONS: Array<{ id: DesktopWindowControlsPosition; labelKey: string }> = [
    { id: 'left', labelKey: 'settings.openchamber.desktopNetwork.option.windowControlsLeft' },
    { id: 'right', labelKey: 'settings.openchamber.desktopNetwork.option.windowControlsRight' },
];

const WINDOW_CONTROLS_STYLE_OPTIONS: Array<{ id: DesktopWindowControlsStyle; labelKey: string }> = [
    { id: 'classic', labelKey: 'settings.openchamber.desktopNetwork.option.windowControlsClassic' },
    { id: 'traffic-lights', labelKey: 'settings.openchamber.desktopNetwork.option.windowControlsTrafficLights' },
];

interface OpenChamberVisualSettingsProps {
    /** Which settings to show. If undefined, shows all. */
    visibleSettings?: VisibleSetting[];
}

export const OpenChamberVisualSettings: React.FC<OpenChamberVisualSettingsProps> = ({ visibleSettings }) => {
    const { locale, locales, setLocale, label, t } = useI18n();
    const tUnsafe = React.useCallback((key: string) => t(key as Parameters<typeof t>[0]), [t]);
    const { isMobile } = useDeviceInfo();
    const { browserTab } = usePwaDetection();
    const animatedActivityIndicators = useSessionDisplayStore((s) => s.animatedActivityIndicators);
    const setAnimatedActivityIndicators = useSessionDisplayStore((s) => s.setAnimatedActivityIndicators);

    const padding = useUIStore(state => state.padding);
    const setPadding = useUIStore(state => state.setPadding);
    const inputBarOffset = useUIStore(state => state.inputBarOffset);
    const setInputBarOffset = useUIStore(state => state.setInputBarOffset);
    const mobileKeyboardMode = useUIStore(state => state.mobileKeyboardMode);
    const setMobileKeyboardMode = useUIStore(state => state.setMobileKeyboardMode);
    const timeFormatPreference = useUIStore(state => state.timeFormatPreference);
    const setTimeFormatPreference = useUIStore(state => state.setTimeFormatPreference);
    const weekStartPreference = useUIStore(state => state.weekStartPreference);
    const setWeekStartPreference = useUIStore(state => state.setWeekStartPreference);
    const customCssEnabled = useUIStore(state => state.customCssEnabled);
    const setCustomCssEnabled = useUIStore(state => state.setCustomCssEnabled);
    const showWindowControlsPosition = usesFramelessElectronChrome();
    const desktopWindowControlsPosition = useUIStore((state) => state.desktopWindowControlsPosition);
    const setDesktopWindowControlsPosition = useUIStore((state) => state.setDesktopWindowControlsPosition);
    const desktopWindowControlsStyle = useUIStore((state) => state.desktopWindowControlsStyle);
    const setDesktopWindowControlsStyle = useUIStore((state) => state.setDesktopWindowControlsStyle);

    // The server copy lets the language survive lost browser storage and reach
    // the other clients of this instance.
    const handleLocaleChange = React.useCallback((value: string) => {
        const next = locales.find((candidate) => candidate === value);
        if (!next) return;
        setLocale(next);
        void updateDesktopSettings({ locale: next });
    }, [locales, setLocale]);

    const handleWindowControlsPositionChange = React.useCallback((value: DesktopWindowControlsPosition) => {
        setDesktopWindowControlsPosition(value);
        void updateDesktopSettings({ desktopWindowControlsPosition: value });
    }, [setDesktopWindowControlsPosition]);

    const handleWindowControlsStyleChange = React.useCallback((value: DesktopWindowControlsStyle) => {
        setDesktopWindowControlsStyle(value);
        void updateDesktopSettings({ desktopWindowControlsStyle: value });
    }, [setDesktopWindowControlsStyle]);


    const handleTimeFormatPreferenceChange = React.useCallback((value: 'auto' | '12h' | '24h') => {
        setTimeFormatPreference(value);
        void updateDesktopSettings({ timeFormatPreference: value });
    }, [setTimeFormatPreference]);

    const handleWeekStartPreferenceChange = React.useCallback((value: 'auto' | 'monday' | 'sunday') => {
        setWeekStartPreference(value);
        void updateDesktopSettings({ weekStartPreference: value });
    }, [setWeekStartPreference]);

    const shouldShow = (setting: VisibleSetting): boolean => {
        if (!visibleSettings) return true;
        return visibleSettings.includes(setting);
    };

    const isVSCode = isVSCodeRuntime();
    const hasThemeSettings = shouldShow('theme') && !isVSCode;
    const showWindowControlsPositionSetting = shouldShow('windowControlsPosition') && showWindowControlsPosition;
    const hasLocalizationSettings = shouldShow('theme') || shouldShow('timeFormat') || shouldShow('weekStart');
    const hasLayoutSettings = shouldShow('fontSize') || shouldShow('editorFontSize') || shouldShow('spacing') || (shouldShow('inputBarOffset') && isMobile);
    const showPwaInstallNameSetting = shouldShow('pwaInstallName') && isWebRuntime() && browserTab && !isDesktopShell() && !isVSCode;
    const showPwaOrientationSetting = shouldShow('pwaOrientation') && isWebRuntime() && !isDesktopShell() && !isVSCode;
    const showMobileKeyboardModeSetting = shouldShow('mobileKeyboardMode') && isWebRuntime() && !isDesktopShell() && !isVSCode && supportsMobileKeyboardResizeContent();
    const [pwaInstallName, setPwaInstallName] = React.useState('');
    const [pwaOrientation, setPwaOrientation] = React.useState<'system' | 'portrait' | 'landscape'>('system');
    const selectedTimeFormatLabel = React.useMemo(() => {
        const option = TIME_FORMAT_OPTIONS.find((item) => item.id === timeFormatPreference);
        return tUnsafe(option?.labelKey ?? 'settings.openchamber.visual.option.timeFormat.auto.label');
    }, [timeFormatPreference, tUnsafe]);
    const selectedWeekStartLabel = React.useMemo(() => {
        const option = WEEK_START_OPTIONS.find((item) => item.id === weekStartPreference);
        return tUnsafe(option?.labelKey ?? 'settings.openchamber.visual.option.weekStart.auto.label');
    }, [weekStartPreference, tUnsafe]);
    const selectedPwaOrientationLabel = React.useMemo(() => {
        const option = PWA_ORIENTATION_OPTIONS.find((item) => item.id === pwaOrientation);
        return option ? tUnsafe(option.labelKey) : undefined;
    }, [pwaOrientation, tUnsafe]);
    const selectedMobileKeyboardModeLabel = React.useMemo(() => {
        const option = MOBILE_KEYBOARD_MODE_OPTIONS.find((item) => item.id === mobileKeyboardMode);
        return option ? tUnsafe(option.labelKey) : undefined;
    }, [mobileKeyboardMode, tUnsafe]);

    const applyPwaInstallName = React.useCallback(async (value: string) => {
        if (typeof window === 'undefined') {
            return;
        }

        const win = window as PwaInstallNameWindow;
        const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 64);
        const persistedValue = normalized;

        await updateDesktopSettings({ pwaAppName: persistedValue });

        if (typeof win.__OPENCHAMBER_SET_PWA_INSTALL_NAME__ === 'function') {
            const resolved = win.__OPENCHAMBER_SET_PWA_INSTALL_NAME__(persistedValue);
            setPwaInstallName(resolved);
            return;
        }

        setPwaInstallName(persistedValue || DEFAULT_PWA_INSTALL_NAME);
        win.__OPENCHAMBER_UPDATE_PWA_MANIFEST__?.();
    }, []);

    const applyPwaOrientation = React.useCallback(async (value: 'system' | 'portrait' | 'landscape') => {
        if (typeof window === 'undefined') {
            return;
        }

        const win = window as PwaInstallNameWindow;
        const normalized = normalizePwaOrientation(value);

        await updateDesktopSettings({ pwaOrientation: normalized });

        if (typeof win.__OPENCHAMBER_SET_PWA_ORIENTATION__ === 'function') {
            const resolved = win.__OPENCHAMBER_SET_PWA_ORIENTATION__(normalized);
            setPwaOrientation(resolved);
            return;
        }

        setPwaOrientation(normalized);
        win.__OPENCHAMBER_UPDATE_PWA_MANIFEST__?.();
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined' || (!showPwaInstallNameSetting && !showPwaOrientationSetting && !showMobileKeyboardModeSetting)) {
            return;
        }

        let cancelled = false;

        const loadPwaInstallName = async () => {
            try {
                const settings = await loadDesktopSettings();

                if (!settings) {
                    if (!cancelled) {
                        setPwaInstallName(DEFAULT_PWA_INSTALL_NAME);
                    }
                    return;
                }

                const raw = settings.pwaAppName ?? '';
                const normalized = raw.trim().replace(/\s+/g, ' ').slice(0, 64);
                const orientation = normalizePwaOrientation(settings.pwaOrientation);
                const nextMobileKeyboardMode = normalizeMobileKeyboardMode(settings.mobileKeyboardMode);

                if (!cancelled) {
                    if (showPwaInstallNameSetting) {
                        setPwaInstallName(normalized || DEFAULT_PWA_INSTALL_NAME);
                    }
                    if (showPwaOrientationSetting) {
                        setPwaOrientation(orientation);
                    }
                    if (showMobileKeyboardModeSetting) {
                        setMobileKeyboardMode(nextMobileKeyboardMode);
                    }
                }
            } catch {
                if (!cancelled) {
                    if (showPwaInstallNameSetting) {
                        setPwaInstallName(DEFAULT_PWA_INSTALL_NAME);
                    }
                    if (showPwaOrientationSetting) {
                        setPwaOrientation('system');
                    }
                    if (showMobileKeyboardModeSetting) {
                        setMobileKeyboardMode('native');
                    }
                }
            }
        };

        void loadPwaInstallName();

        return () => {
            cancelled = true;
        };
    }, [setMobileKeyboardMode, showMobileKeyboardModeSetting, showPwaInstallNameSetting, showPwaOrientationSetting]);

    return (
        <>
                {/* By what people come for: the theme, type and density, language,
                    then what is set once per device. Sections stay direct children of
                    the page, so the layout drops the divider above whichever renders first. */}
                {hasThemeSettings && (
                    <>
                        <ThemeAppearancePicker />
                        <SettingsSection>
                            <SettingsCheckboxRow
                                checked={customCssEnabled}
                                onChange={setCustomCssEnabled}
                                label={t('settings.customCss.label')}
                                ariaLabel={t('settings.customCss.label')}
                                info={t('settings.customCss.info')}
                                settingsItem="appearance.custom-css"
                            />
                        </SettingsSection>
                    </>
                )}

                {/* --- Density & type --- */}
                {hasLayoutSettings && (
                    <SettingsSection title={t('settings.openchamber.visual.section.densityAndType')} contentClassName={SETTINGS_FIELDS_STACK_CLASS}>
                        <TypographySettings showInterface={shouldShow('fontSize') && !isMobile} showCode={shouldShow('editorFontSize')} />

                        {shouldShow('spacing') || (shouldShow('inputBarOffset') && isMobile) ? (
                            <SettingsTwoColumn>
                                {shouldShow('spacing') && (
                                    <SettingsStackedField
                                        label={t('settings.openchamber.visual.field.spacingDensity')}
                                        settingsItem="appearance.spacing-density"
                                        controlClassName="w-full"
                                    >
                                        <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                                            <NumberInput
                                                value={padding}
                                                onValueChange={setPadding}
                                                min={50}
                                                max={200}
                                                step={5}
                                                className={SETTINGS_NUMBER_INPUT_CLASS}
                                            />
                                            <span className={SETTINGS_NUMBER_UNIT_CLASS}>%</span>
                                            <Button size="sm"
                                                type="button"
                                                variant="ghost"
                                                onClick={() => setPadding(DEFAULT_SPACING_SCALE)}
                                                disabled={padding === DEFAULT_SPACING_SCALE}
                                                className={SETTINGS_ICON_BUTTON_CLASS}
                                                aria-label={t('settings.openchamber.visual.actions.resetSpacingAria')}
                                                title={t('settings.common.actions.reset')}
                                            >
                                                <Icon name="restart" className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </SettingsStackedField>
                                )}
                                {shouldShow('inputBarOffset') && isMobile && (
                                    <SettingsStackedField
                                        label={t('settings.openchamber.visual.field.inputBarOffset')}
                                        info={t('settings.openchamber.visual.field.inputBarOffsetTooltip')}
                                        settingsItem="appearance.input-bar-offset"
                                        controlClassName="w-full"
                                    >
                                        <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                                            <NumberInput
                                                value={inputBarOffset}
                                                onValueChange={setInputBarOffset}
                                                min={0}
                                                max={100}
                                                step={5}
                                                className={SETTINGS_NUMBER_INPUT_CLASS}
                                            />
                                            <span className={SETTINGS_NUMBER_UNIT_CLASS}>px</span>
                                            <Button size="sm"
                                                type="button"
                                                variant="ghost"
                                                onClick={() => setInputBarOffset(0)}
                                                disabled={inputBarOffset === 0}
                                                className={SETTINGS_ICON_BUTTON_CLASS}
                                                aria-label={t('settings.openchamber.visual.actions.resetInputBarOffsetAria')}
                                                title={t('settings.common.actions.reset')}
                                            >
                                                <Icon name="restart" className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </SettingsStackedField>
                                )}
                            </SettingsTwoColumn>
                        ) : null}
                    </SettingsSection>
                )}

                {hasLocalizationSettings && (
                    <SettingsSection title={t('settings.openchamber.visual.section.localization')}>
                        <SettingsTwoColumn>
                            <SettingsStackedField
                                label={t('settings.appearance.language.label')}
                                info={t('settings.appearance.language.description')}
                                settingsItem="appearance.language"
                            >
                                <Select value={locale} onValueChange={handleLocaleChange}>
                                    <SelectTrigger aria-label={t('settings.appearance.language.select')} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                                        <SelectValue>{label(locale)}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {locales.map((availableLocale) => (
                                            <SelectItem key={availableLocale} value={availableLocale}>
                                                {label(availableLocale)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </SettingsStackedField>

                            {(shouldShow('timeFormat') || shouldShow('weekStart')) && (
                                <div className={SETTINGS_FIELDS_STACK_CLASS}>
                                    {shouldShow('timeFormat') && (
                                        <SettingsStackedField
                                            label={t('settings.openchamber.visual.field.timeFormat')}
                                            settingsItem="appearance.time-format"
                                        >
                                            <Select value={timeFormatPreference} onValueChange={(value: 'auto' | '12h' | '24h') => handleTimeFormatPreferenceChange(value)}>
                                                <SelectTrigger aria-label={t('settings.openchamber.visual.field.selectTimeFormatAria')} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                                                    <SelectValue>{selectedTimeFormatLabel}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {TIME_FORMAT_OPTIONS.map((option) => (
                                                        <SelectItem key={option.id} value={option.id}>{tUnsafe(option.labelKey)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingsStackedField>
                                    )}

                                    {shouldShow('weekStart') && (
                                        <SettingsStackedField
                                            label={t('settings.openchamber.visual.field.weekStartsOn')}
                                            settingsItem="appearance.week-start"
                                        >
                                            <Select value={weekStartPreference} onValueChange={(value: 'auto' | 'monday' | 'sunday') => handleWeekStartPreferenceChange(value)}>
                                                <SelectTrigger aria-label={t('settings.openchamber.visual.field.selectWeekStartAria')} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                                                    <SelectValue>{selectedWeekStartLabel}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {WEEK_START_OPTIONS.map((option) => (
                                                        <SelectItem key={option.id} value={option.id}>{tUnsafe(option.labelKey)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingsStackedField>
                                    )}
                                </div>
                            )}
                        </SettingsTwoColumn>
                    </SettingsSection>
                )}

                {shouldShow('animatedActivityIndicators') && (
                    <SettingsSection
                        title={t('settings.openchamber.visual.section.sessionActivity')}
                        settingsItem="appearance.session-activity"
                        contentClassName={SETTINGS_OPTION_STACK_CLASS}
                    >
                        <SettingsCheckboxRow
                            checked={animatedActivityIndicators}
                            onChange={setAnimatedActivityIndicators}
                            label={t('settings.openchamber.visual.field.animatedActivityIndicators')}
                            ariaLabel={t('settings.openchamber.visual.field.animatedActivityIndicatorsAria')}
                            info={t('settings.openchamber.visual.field.animatedActivityIndicatorsInfo')}
                            settingsItem="appearance.animated-activity-indicators"
                        />
                    </SettingsSection>
                )}

                {showWindowControlsPositionSetting && (
                    <SettingsSection
                        title={t('settings.openchamber.desktopNetwork.field.windowControls')}
                        info={t('settings.openchamber.desktopNetwork.field.windowControlsPositionDescription')}
                    >
                        <SettingsTwoColumn>
                            <SettingsStackedField
                                label={t('settings.openchamber.desktopNetwork.field.windowControlsPosition')}
                                settingsItem="sessions.desktop-window-controls-position"
                            >
                                <SettingsChipGroup
                                    value={desktopWindowControlsPosition}
                                    options={WINDOW_CONTROLS_POSITION_OPTIONS.map((option) => ({
                                        value: option.id,
                                        label: tUnsafe(option.labelKey),
                                    }))}
                                    onChange={handleWindowControlsPositionChange}
                                    aria-label={t('settings.openchamber.desktopNetwork.field.windowControlsPositionAria')}
                                />
                            </SettingsStackedField>
                            <SettingsStackedField
                                label={t('settings.openchamber.desktopNetwork.field.windowControlsStyle')}
                                settingsItem="sessions.desktop-window-controls-style"
                            >
                                <SettingsChipGroup
                                    value={desktopWindowControlsStyle}
                                    options={WINDOW_CONTROLS_STYLE_OPTIONS.map((option) => ({
                                        value: option.id,
                                        label: tUnsafe(option.labelKey),
                                    }))}
                                    onChange={handleWindowControlsStyleChange}
                                    aria-label={t('settings.openchamber.desktopNetwork.field.windowControlsStyleAria')}
                                />
                            </SettingsStackedField>
                        </SettingsTwoColumn>
                    </SettingsSection>
                )}

                {(showPwaInstallNameSetting || showPwaOrientationSetting || showMobileKeyboardModeSetting) && (
                    <SettingsSection title={t('settings.openchamber.visual.section.appInstall')} contentClassName={SETTINGS_FIELDS_STACK_CLASS}>

                    {showPwaInstallNameSetting && (
                        <SettingsFieldRow
                            label={t('settings.openchamber.visual.field.installAppName')}
                            info={t('settings.openchamber.visual.field.installAppNameHint')}
                            settingsItem="appearance.pwa-install-name"
                            alignEnd={false}
                            controlClassName={SETTINGS_CONTROL_CLUSTER_CLASS}
                        >
                            <Input
                                value={pwaInstallName}
                                onChange={(event) => {
                                    setPwaInstallName(event.target.value);
                                }}
                                onBlur={() => {
                                    void applyPwaInstallName(pwaInstallName);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void applyPwaInstallName(pwaInstallName);
                                    }
                                }}
                                className="min-w-0 flex-1"
                                maxLength={64}
                                aria-label={t('settings.openchamber.visual.field.pwaInstallAppNameAria')}
                            />
                            <Button size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setPwaInstallName(DEFAULT_PWA_INSTALL_NAME);
                                    void applyPwaInstallName('');
                                }}
                                className={SETTINGS_ICON_BUTTON_CLASS}
                                aria-label={t('settings.openchamber.visual.actions.resetInstallAppNameAria')}
                                title={t('settings.common.actions.reset')}
                            >
                                <Icon name="restart" className="h-3.5 w-3.5" />
                            </Button>
                        </SettingsFieldRow>
                    )}

                    {showPwaOrientationSetting && (
                        <SettingsFieldRow
                            label={t('settings.openchamber.visual.field.installOrientation')}
                            description={t('settings.openchamber.visual.field.installOrientationHint')}
                            settingsItem="appearance.pwa-orientation"
                            alignEnd={false}
                            controlClassName={SETTINGS_CONTROL_CLUSTER_CLASS}
                        >
                            <Select
                                value={pwaOrientation}
                                onValueChange={(value) => {
                                    const orientation = normalizePwaOrientation(value);
                                    setPwaOrientation(orientation);
                                    void applyPwaOrientation(orientation);
                                }}
                            >
                                <SelectTrigger aria-label={t('settings.openchamber.visual.field.pwaInstallOrientationAria')} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder={t('settings.openchamber.visual.field.selectOrientationPlaceholder')}>
                                        {selectedPwaOrientationLabel}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {PWA_ORIENTATION_OPTIONS.map((option) => (
                                        <SelectItem key={option.id} value={option.id}>
                                            {tUnsafe(option.labelKey)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setPwaOrientation('system');
                                    void applyPwaOrientation('system');
                                }}
                                disabled={pwaOrientation === 'system'}
                                className={SETTINGS_ICON_BUTTON_CLASS}
                                aria-label={t('settings.openchamber.visual.actions.resetInstallOrientationAria')}
                                title={t('settings.common.actions.reset')}
                            >
                                <Icon name="restart" className="h-3.5 w-3.5" />
                            </Button>
                        </SettingsFieldRow>
                    )}

                    {showMobileKeyboardModeSetting && (
                        <SettingsFieldRow
                            label={t('settings.openchamber.visual.field.mobileKeyboardMode')}
                            info={t('settings.openchamber.visual.field.mobileKeyboardModeHint')}
                            settingsItem="appearance.mobile-keyboard-mode"
                            alignEnd={false}
                            controlClassName={SETTINGS_CONTROL_CLUSTER_CLASS}
                        >
                            <Select
                                value={mobileKeyboardMode}
                                onValueChange={(value) => {
                                    const mode = normalizeMobileKeyboardMode(value);
                                    setMobileKeyboardMode(mode);
                                    void updateDesktopSettings({ mobileKeyboardMode: mode });
                                }}
                            >
                                <SelectTrigger aria-label={t('settings.openchamber.visual.field.mobileKeyboardModeAria')} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder={t('settings.openchamber.visual.field.selectMobileKeyboardModePlaceholder')}>
                                        {selectedMobileKeyboardModeLabel}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {MOBILE_KEYBOARD_MODE_OPTIONS.map((option) => (
                                        <SelectItem key={option.id} value={option.id}>
                                            {tUnsafe(option.labelKey)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setMobileKeyboardMode('native');
                                    void updateDesktopSettings({ mobileKeyboardMode: 'native' });
                                }}
                                disabled={mobileKeyboardMode === 'native'}
                                className={SETTINGS_ICON_BUTTON_CLASS}
                                aria-label={t('settings.openchamber.visual.actions.resetMobileKeyboardModeAria')}
                                title={t('settings.common.actions.reset')}
                            >
                                <Icon name="restart" className="h-3.5 w-3.5" />
                            </Button>
                        </SettingsFieldRow>
                    )}
                    </SettingsSection>
                )}
        </>
    );
};
