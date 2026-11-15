export const TAB_SPRING = { type: 'spring', visualDuration: 0.24, bounce: 0.22 } as const;

/** Layout coordinates inside the scroll track, independent of presence and drag transforms. */
export const tabLayoutRect = (container: HTMLElement, tab: HTMLElement) => {
  let left = 0;
  let top = 0;
  let element: HTMLElement | null = tab;
  while (element && element !== container) {
    left += element.offsetLeft;
    top += element.offsetTop;
    element = element.offsetParent as HTMLElement | null;
  }
  return { left, top, width: tab.offsetWidth, height: tab.offsetHeight };
};

/** Scrollable extent of present tabs; fading slots remain mounted outside layout. */
export const tabScrollRange = (container: HTMLElement, isRtl: boolean) => {
  const tabs = container.querySelectorAll<HTMLElement>(':scope > [data-tab-slot]:not([inert])');
  const last = tabs.item(tabs.length - 1);
  if (!last) return { min: 0, max: 0 };
  const end = tabLayoutRect(container, last);
  const style = getComputedStyle(container);
  return isRtl
    ? { min: Math.min(0, end.left - Number.parseFloat(style.paddingLeft)), max: 0 }
    : { min: 0, max: Math.max(0, end.left + end.width + Number.parseFloat(style.paddingRight) - container.clientWidth) };
};
