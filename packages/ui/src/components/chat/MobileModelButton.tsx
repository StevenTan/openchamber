import React from 'react';
import { MobileModelTrigger } from './ModelControlsView';
import { useConfigStore } from '@/stores/useConfigStore';
import { getModelDisplayName } from './mobileControlsUtils';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useI18n } from '@/lib/i18n';
import { isAutoModel } from '@/lib/routing/autoModel';
import { Icon } from '@/components/icon/Icon';
import { useModelMissingFromCatalog } from './agentAvailability';
import { useChatSessionSelection } from './chatColumnSession';

interface MobileModelButtonProps {
    onOpenModel: () => void;
    className?: string;
    model?: { providerId: string; modelId: string } | null;
}

export const MobileModelButton: React.FC<MobileModelButtonProps> = ({ onOpenModel, className, model }) => {
    const { t } = useI18n();
    const currentModelId = useConfigStore((state) => model === undefined ? state.currentModelId : model?.modelId);
    const currentProviderId = useConfigStore((state) => model === undefined ? state.currentProviderId : model?.providerId);
    const providers = useConfigStore((state) => state.providers);
    const currentProvider = providers.find((provider) => provider.id === currentProviderId);
    const isAuto = isAutoModel(currentProviderId, currentModelId);
    const modelLabel = isAuto
        ? t('chat.modelControls.autoModel')
        : getModelDisplayName(currentProvider, currentModelId, t('chat.modelControls.selectModel'));
    const columnDirectory = useChatSessionSelection().directory ?? undefined;
    const modelUnavailable = useModelMissingFromCatalog(model === undefined ? undefined : columnDirectory, currentProviderId, currentModelId);
    const unavailableText = modelUnavailable
        ? t('chat.modelControls.modelUnavailable', { model: modelLabel })
        : undefined;

    return (
        <MobileModelTrigger
            onOpenModel={onOpenModel}
            className={className}
            label={modelLabel}
            unavailableText={unavailableText}
            icon={unavailableText ? (
                <Icon name="error-warning" className="size-4 flex-shrink-0 text-[var(--status-warning)]" />
            ) : currentProviderId && !isAuto ? (
                <ProviderLogo providerId={currentProviderId} className="size-4 flex-shrink-0" />
            ) : null}
        />
    );
};
