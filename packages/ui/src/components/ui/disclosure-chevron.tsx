import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';

/** One persistent glyph, so both directions interpolate instead of swapping paths. */
export function DisclosureChevron({ expanded, className, closedDirection = 'right' }: {
  expanded: boolean;
  className?: string;
  closedDirection?: 'right' | 'down' | 'up';
}) {
  return <Icon name={closedDirection === 'right' ? 'arrow-right-s' : closedDirection === 'up' ? 'arrow-up-s' : 'arrow-down-s'} className={cn(
    className,
    'transition-[transform,rotate,opacity,color] duration-200 ease-out motion-reduce:transition-none',
    expanded && (closedDirection === 'right' ? 'rotate-90 rtl:-rotate-90' : 'rotate-180'),
  )} />;
}
