import React from 'react';
import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { TAB_SPRING } from '@/lib/motion/tabTransition';

type TabMotionProps = React.PropsWithChildren<{
  className?: string;
  layoutKey: string;
  enabled?: boolean;
  'data-active'?: string;
}>;

/** Presence and layout own this wrapper; drag transforms belong to its child. */
export const TabMotion = React.forwardRef<HTMLDivElement, TabMotionProps>(function TabMotion(
  { children, layoutKey, enabled = true, ...props }, ref,
) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const animate = enabled && !reducedMotion;

  return (
    <motion.div
      {...props}
      ref={ref}
      data-tab-slot
      inert={!isPresent}
      layout={animate ? 'position' : false}
      layoutDependency={layoutKey}
      initial={animate ? { opacity: 0, scale: 0.92 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={animate ? { opacity: 0, scale: 0.92 } : { opacity: 1, scale: 1 }}
      transition={animate ? { ...TAB_SPRING, opacity: { duration: 0.12 } } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
});
