import { useIsVSCodeRuntime } from '@/hooks/useRuntimeAPIs';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';

export function useModelControlsAppearance() {
    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const uiIsMobile = useUIStore(state => state.isMobile);
    const isMobile = deviceIsMobile || uiIsMobile;
    const isVSCode = useIsVSCodeRuntime();
    return {
        isMobile,
        sizeVariant: isMobile ? 'mobile' : isVSCode ? 'vscode' : 'default',
        buttonHeight: isMobile ? 'h-9' : isVSCode ? 'h-6' : 'h-8',
        controlIconSize: isMobile ? 'size-5' : 'size-4',
        providerLogoSize: isMobile ? 'size-[21px]' : 'size-[17px]',
        controlTextSize: isMobile ? 'typography-micro' : 'typography-meta',
    };
}

export function useModelPickerLabels() {
    const { t } = useI18n();
    return {
        searchPlaceholder: t('chat.modelControls.searchModels'), list: t('chat.modelControls.modelListAria'),
        noResults: t('chat.modelControls.noModelsFound'), favorites: t('chat.modelControls.favorites'), recent: t('chat.modelControls.recent'),
        keyboardHint: t('chat.modelControls.keyboardHintNavigate'), favorite: t('chat.modelControls.favoriteAria'), unfavorite: t('chat.modelControls.unfavoriteAria'),
        provider: t('chat.modelControls.provider'), capabilities: t('chat.modelControls.capabilities'),
        capabilityToolCalling: t('chat.modelControls.capability.toolCalling'), capabilityReasoning: t('chat.modelControls.capability.reasoning'),
        input: t('chat.modelControls.input'), output: t('chat.modelControls.output'), costPerMillion: t('chat.modelControls.costPerMillion'),
    };
}

