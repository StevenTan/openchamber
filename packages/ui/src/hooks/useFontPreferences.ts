import {
    CODE_FONT_OPTION_MAP,
    DEFAULT_MONO_FONT,
    DEFAULT_UI_FONT,
    UI_FONT_OPTION_MAP,
    type MonoFontOption,
    type UiFontOption,
} from '@/lib/fontOptions';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { useUIStore } from '@/stores/useUIStore';

interface FontPreferences {
    uiFont: UiFontOption;
    monoFont: MonoFontOption;
    customUiFont: string;
    customMonoFont: string;
    chatFont: UiFontOption | 'interface';
    customChatFont: string;
}

export const useFontPreferences = (): FontPreferences => {
    const uiFont = useUIStore(state => state.uiFont);
    const monoFont = useUIStore(state => state.monoFont);
    const customUiFont = useUIStore(state => state.customUiFont);
    const customMonoFont = useUIStore(state => state.customMonoFont);
    const chatFont = useUIStore(state => state.chatFont);
    const customChatFont = useUIStore(state => state.customChatFont);
    const enterpriseMode = useEnterpriseMode();

    return {
        uiFont: enterpriseMode && UI_FONT_OPTION_MAP[uiFont]?.source ? DEFAULT_UI_FONT : uiFont,
        monoFont: enterpriseMode && CODE_FONT_OPTION_MAP[monoFont]?.source ? DEFAULT_MONO_FONT : monoFont,
        customUiFont,
        customMonoFont,
        chatFont: chatFont !== 'interface' && enterpriseMode && UI_FONT_OPTION_MAP[chatFont]?.source ? DEFAULT_UI_FONT : chatFont,
        customChatFont,
    };
};
