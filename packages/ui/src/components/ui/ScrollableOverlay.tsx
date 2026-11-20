import React from "react";
import { cn } from "@/lib/utils";
import { ScrollShadow, ScrollShadowBands } from "./ScrollShadow";

type ScrollableOverlayProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  outerClassName?: string;
  /** Style of the outer frame, for a size given as a value (a max height from a prop). */
  outerStyle?: React.CSSProperties;
  disableHorizontal?: boolean;
  observeMutations?: boolean;
  fillContainer?: boolean;
  /** Prevent scroll from propagating to parent when at boundaries */
  preventOverscroll?: boolean;
  useScrollShadow?: boolean;
  scrollShadowSize?: number;
  /** The opaque colour behind the scroller: the fades become bands in it, not a mask. */
  scrollShadowSurface?: string;
  /** Suppress the top fade (e.g. when sticky headers sit at the top edge). */
  hideTopScrollShadow?: boolean;
  /** Suppress the bottom fade while retaining scroll-state tracking. */
  hideBottomScrollShadow?: boolean;
  /** Forwarded to the inner element (e.g. textarea). */
  disabled?: boolean;
};

export const ScrollableOverlay = React.forwardRef<HTMLElement, ScrollableOverlayProps>(
  ({
    className,
    outerClassName,
    outerStyle,
    children,
    style,
    as: Component = "div",
    disableHorizontal = false,
    observeMutations = true,
    fillContainer = true,
    preventOverscroll = false,
    useScrollShadow = false,
    scrollShadowSize,
    scrollShadowSurface,
    hideTopScrollShadow = false,
    hideBottomScrollShadow = false,
    ...rest
  }, ref) => {
    const containerRef = React.useRef<HTMLElement | null>(null);

    React.useImperativeHandle(ref, () => containerRef.current as HTMLElement, []);

    return (
      <div
        className={cn(
          "overlay-scrollbar-wrapper relative flex flex-col min-h-0 w-full overflow-hidden",
          preventOverscroll && "overscroll-none",
          outerClassName
        )}
        style={outerStyle}
      >
        {useScrollShadow ? (
          <ScrollShadow
            as={Component}
            ref={containerRef as React.Ref<HTMLElement>}
            size={scrollShadowSize}
            surface={scrollShadowSurface}
            hideTopShadow={hideTopScrollShadow}
            hideBottomShadow={hideBottomScrollShadow}
            className={cn(
              "overlay-scrollbar-target overlay-scrollbar-container",
              preventOverscroll && "overscroll-none",
              fillContainer ? "flex-1 min-h-0 w-full" : "flex-none w-full h-auto",
              disableHorizontal ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
              className
            )}
            style={style as React.CSSProperties}
            observeMutations={observeMutations}
            {...rest}
          >
            {children}
          </ScrollShadow>
        ) : (
          <Component
            ref={containerRef as React.Ref<HTMLElement>}
            className={cn(
              "overlay-scrollbar-target overlay-scrollbar-container",
              preventOverscroll && "overscroll-none",
              fillContainer ? "flex-1 min-h-0 w-full" : "flex-none w-full h-auto",
              disableHorizontal ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
              className
            )}
            style={style}
            {...rest}
          >
            {children}
          </Component>
        )}
        {useScrollShadow && scrollShadowSurface ? (
          <ScrollShadowBands surface={scrollShadowSurface} size={scrollShadowSize} />
        ) : null}
      </div>
    );
  }
);

ScrollableOverlay.displayName = "ScrollableOverlay";
