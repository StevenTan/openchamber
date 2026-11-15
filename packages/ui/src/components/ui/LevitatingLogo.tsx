import React from 'react';
import { motion } from 'motion/react';
import { OPEN_CHAMBER_LOGO_SRC } from './openChamberLogoArt';

interface LevitatingLogoProps {
  size: number;
  onDone: () => void;
}

/** A nine-second levitation that starts and ends in the static logo's pose. */
export const LevitatingLogo: React.FC<LevitatingLogoProps> = ({ size, onDone }) => (
  <motion.img
    src={OPEN_CHAMBER_LOGO_SRC}
    width={size}
    height={size}
    alt=""
    aria-hidden="true"
    className="pointer-events-none absolute inset-0"
    initial={{ y: 0, rotateY: 0 }}
    animate={{
      y: [0, -size * 0.4, -size * 0.4, 0],
      rotateY: [0, 0, 360, 360],
    }}
    transition={{ duration: 9, times: [0, 0.2, 0.74, 1], ease: 'easeInOut' }}
    style={{ transformPerspective: size * 8 }}
    onAnimationComplete={onDone}
  />
);
