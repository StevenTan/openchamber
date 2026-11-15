import React from 'react';
import { useReducedMotion } from 'motion/react';
import { useI18n } from '@/lib/i18n';
import { useWaitingPhase } from '@/hooks/useDurationTicker';
import { OPEN_CHAMBER_LOGO_SRC, LOGO_PANEL_REST } from './openChamberLogoArt';

interface OpenChamberLogoProps {
  className?: string;
  width?: number;
  height?: number;
  isAnimated?: boolean;
}

export const OpenChamberLogo: React.FC<OpenChamberLogoProps> = ({
  className = '', width = 70, height = 70, isAnimated = false,
}) => {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const animated = isAnimated && !reducedMotion;
  const phase = useWaitingPhase(animated, 2);
  return (
    <img
      src={OPEN_CHAMBER_LOGO_SRC}
      width={width}
      height={height}
      className={className}
      alt={t('openChamberLogo.aria.logo')}
      style={animated ? { opacity: phase === 0 ? LOGO_PANEL_REST : 1 } : undefined}
    />
  );
};
