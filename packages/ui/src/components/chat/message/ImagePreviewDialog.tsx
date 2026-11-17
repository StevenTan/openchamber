import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import PhotoSwipe, { type SlideData } from 'photoswipe';
import { useReducedMotion } from 'motion/react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { ContentLoadingState, ContentState } from '@/components/ui/content-state';
import { toast } from '@/components/ui';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';
import { saveFile } from './parts/saveFile';
import type { ToolPopupContent } from './types';
import 'photoswipe/style.css';
import './image-preview.css';

type GalleryItem = NonNullable<NonNullable<ToolPopupContent['image']>['gallery']>[number];
const EXTENSION_BY_IMAGE_MIME = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/gif', 'gif'], ['image/webp', 'webp'], ['image/svg+xml', 'svg']]);

// Downloads use the owner's loader. Only inline and object URLs can be read directly.
const imageLoader = (image: GalleryItem | undefined): (() => Promise<Blob>) | null => {
    if (!image || isVSCodeRuntime()) return null;
    if (image.load) return image.load;
    if (/^(?:data|blob):/i.test(image.url)) return () => fetch(image.url).then((response) => response.blob());
    return null;
};

const savedImageName = (filename: string | undefined, blob: Blob): string => {
    const name = filename?.split(/[\\/]/).pop()?.trim() || 'image';
    return /\.[A-Za-z0-9]{2,5}$/.test(name) ? name : `${name}.${EXTENSION_BY_IMAGE_MIME.get(blob.type) ?? 'png'}`;
};

const thumbnailOf = (element?: HTMLElement): HTMLImageElement | undefined => {
    const image = element instanceof HTMLImageElement ? element : element?.querySelector('img');
    return image?.naturalWidth ? image : undefined;
};

const IMAGE_MOTION_DURATION = 200;

export const ImagePreviewDialog: React.FC<{
    popup: ToolPopupContent;
    onOpenChange: (open: boolean) => void;
}> = ({ popup, onOpenChange }) => {
    const { t, direction } = useI18n();
    const reducedMotion = useReducedMotion();
    const [present, setPresent] = React.useState(popup.open);
    const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
    const viewer = React.useRef<PhotoSwipe | null>(null);
    const open = React.useRef(popup.open);
    const notifyClose = React.useRef(onOpenChange);
    const restoreKeyboardFocus = React.useRef(false);
    const baseImage = popup.image;
    const gallery = React.useMemo(() => {
        const items = baseImage?.gallery?.filter((image) => image.url);
        return items?.length ? items : baseImage ? [baseImage] : [];
    }, [baseImage]);
    const requested = baseImage?.index;
    const requestedIndex = requested !== undefined && requested >= 0 && requested < gallery.length
        ? requested : Math.max(0, gallery.findIndex((image) => image.url === baseImage?.url));
    const [index, setIndex] = React.useState(requestedIndex);
    if (popup.open && !present) setPresent(true);
    const [loading, setLoading] = React.useState(true);
    const [failed, setFailed] = React.useState(false);
    const [canZoomOut, setCanZoomOut] = React.useState(false);
    React.useLayoutEffect(() => {
        open.current = popup.open;
        notifyClose.current = onOpenChange;
        if (!popup.open) viewer.current?.close();
    }, [onOpenChange, popup.open]);

    const current = gallery[index] ?? gallery[0];
    const title = current?.filename || popup.title || t('filesView.editor.imageAltFallback');
    const loadCurrentImage = imageLoader(current);
    const handleDownload = async () => {
        if (!loadCurrentImage) return;
        try {
            const blob = await loadCurrentImage();
            await saveFile(new File([blob], savedImageName(current?.filename, blob), { type: blob.type }));
        } catch {
            toast.error(t('chat.image.downloadFailed'));
        }
    };
    const rtl = direction === 'rtl';
    React.useEffect(() => {
        if (!container || !baseImage) return;
        const items: SlideData[] = gallery.map((image, position) => {
            const thumbnail = thumbnailOf(image.origin ?? (position === requestedIndex ? baseImage.origin : undefined));
            return {
                src: image.url,
                alt: image.filename ?? '',
                width: thumbnail?.naturalWidth,
                height: thumbnail?.naturalHeight,
                element: thumbnail?.isConnected ? thumbnail : undefined,
                msrc: thumbnail?.currentSrc || thumbnail?.src,
                thumbCropped: thumbnail ? getComputedStyle(thumbnail).objectFit === 'cover' : false,
            };
        });
        if (rtl) items.reverse();
        // PhotoSwipe's continuous swipe requires more than two slides.
        const slides = items.length === 2 ? items.concat(items) : items;
        const pswp = new PhotoSwipe({
            dataSource: slides,
            index: rtl ? gallery.length - 1 - requestedIndex : requestedIndex,
            appendToEl: container,
            mainClass: 'oc-image-viewer',
            showAnimationDuration: reducedMotion ? 0 : IMAGE_MOTION_DURATION,
            hideAnimationDuration: reducedMotion ? 0 : IMAGE_MOTION_DURATION,
            zoomAnimationDuration: reducedMotion ? 0 : IMAGE_MOTION_DURATION,
            easing: 'ease-in-out',
            bgOpacity: 1,
            trapFocus: false,
            returnFocus: false,
            escKey: false,
            arrowKeys: false,
            wheelToZoom: true,
            initialZoomLevel: (level) => {
                const size = level.elementSize;
                return size && size.x >= window.innerWidth && size.y / size.x >= 3 ? level.fill : level.fit;
            },
            padding: { top: 88, bottom: 24, left: 24, right: 24 },
        });
        viewer.current = pswp;
        pswp.on('uiRegister', () => pswp.ui?.uiElementsData.splice(0));
        pswp.on('keydown', (event) => {
            if (event.originalEvent.key === 'Tab') event.preventDefault();
        });
        const syncContent = () => {
            const position = pswp.currIndex % gallery.length;
            setIndex(rtl ? gallery.length - 1 - position : position);
            setLoading(pswp.currSlide?.content.isLoading() ?? false);
            setFailed(pswp.currSlide?.content.isError() ?? false);
        };
        pswp.on('change', syncContent);
        pswp.on('calcBounds', ({ slide }) => {
            if (slide.width >= pswp.viewportSize.x && slide.height / slide.width >= 3) {
                slide.bounds.center.y = slide.bounds.min.y;
            }
        });
        pswp.on('loadComplete', ({ content, slide, isError }) => {
            // Entrypoints without a loaded thumbnail learn their dimensions from the image.
            if (!isError && !content.width && content.element instanceof HTMLImageElement) {
                const data = slides[content.index];
                data.width = content.width = slide.width = content.element.naturalWidth;
                data.height = content.height = slide.height = content.element.naturalHeight;
                slide.resize();
            }
            syncContent();
        });
        pswp.on('zoomPanUpdate', () => {
            const slide = pswp.currSlide;
            setCanZoomOut(Boolean(slide && slide.currZoomLevel > slide.zoomLevels.initial));
        });
        pswp.on('openingAnimationEnd', () => {
            if (!open.current) pswp.close();
        });
        pswp.addFilter('contentErrorElement', () => document.createElement('div'));
        const close = () => {
            const slide = pswp.currSlide;
            if (slide?.data.element && !slide.data.element.isConnected) slide.data.element = undefined;
            notifyClose.current(false);
        };
        const finish = () => setPresent(false);
        pswp.on('close', close);
        pswp.on('destroy', finish);
        pswp.init();
        // Base UI owns the labelled modal and focus scope around the gallery.
        pswp.element?.setAttribute('role', 'presentation');
        pswp.scrollWrap?.removeAttribute('aria-roledescription');
        return () => {
            pswp.off('close', close);
            pswp.off('destroy', finish);
            // React can unmount the viewer before PhotoSwipe finishes opening.
            pswp.isDestroying = true;
            pswp.destroy();
            viewer.current = null;
        };
    }, [baseImage, container, gallery, reducedMotion, requestedIndex, rtl]);

    const zoom = (factor: number) => {
        const pswp = viewer.current;
        const slide = pswp?.currSlide;
        if (pswp && slide) pswp.zoomTo(
            Math.max(slide.zoomLevels.initial, slide.currZoomLevel * factor),
            undefined,
            reducedMotion ? 0 : IMAGE_MOTION_DURATION,
        );
    };

    return (
        <Dialog.Root open={present} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Popup
                    ref={setContainer}
                    className="app-region-no-drag fixed inset-0 z-[60] outline-none"
                    aria-label={title}
                    data-image-preview=""
                    initialFocus={() => {
                        const trigger = baseImage?.origin?.closest<HTMLElement>('button, [role="button"], a, [tabindex]');
                        restoreKeyboardFocus.current = trigger?.matches(':focus-visible') ?? false;
                        return true;
                    }}
                    finalFocus={() => restoreKeyboardFocus.current
                        ? baseImage?.origin?.closest<HTMLElement>('button, [role="button"], a, [tabindex]') ?? true
                        : false}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenChange(false);
                        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault();
                            event.stopPropagation();
                            if (gallery.length > 1) {
                                if (event.key === 'ArrowLeft') viewer.current?.prev();
                                else viewer.current?.next();
                            }
                        }
                    }}
                >
                    <div dir={direction} className="oc-image-viewer-controls">
                        <div className="oc-image-viewer-toolbar oc-glass-popover oc-glass-floating">
                            <span className="min-w-0 flex-1 truncate px-2 typography-ui" dir="auto" title={title}>{title}</span>
                            {gallery.length > 1 ? <span className="shrink-0 px-2 typography-meta text-muted-foreground" dir="ltr">{index + 1} / {gallery.length}</span> : null}
                            <Button variant="ghost" size="icon" title={t('chat.toolOutputDialog.image.zoomOutAria')} aria-label={t('chat.toolOutputDialog.image.zoomOutAria')} onClick={() => zoom(1 / 1.5)} disabled={!canZoomOut || loading || failed}><Icon name="zoom-out" className="size-4" /></Button>
                            <Button variant="ghost" size="icon" title={t('chat.toolOutputDialog.image.zoomInAria')} aria-label={t('chat.toolOutputDialog.image.zoomInAria')} onClick={() => zoom(1.5)} disabled={loading || failed}><Icon name="zoom-in" className="size-4" /></Button>
                            {loadCurrentImage ? <Button variant="ghost" size="icon" title={t('chat.image.download')} aria-label={t('chat.image.download')} onClick={() => { void handleDownload(); }}><Icon name="download" className="size-4" /></Button> : null}
                            <Dialog.Close render={<Button variant="ghost" size="icon" title={t('chat.toolOutputDialog.image.closeAria')} aria-label={t('chat.toolOutputDialog.image.closeAria')} />}><Icon name="close" className="size-4" /></Dialog.Close>
                        </div>
                        {gallery.length > 1 ? <>
                            <Button variant="outline" size="icon" className="oc-image-viewer-previous" title={t('chat.toolOutputDialog.image.previousAria')} aria-label={t('chat.toolOutputDialog.image.previousAria')} onClick={() => rtl ? viewer.current?.next() : viewer.current?.prev()}><Icon name="arrow-left-s" className="size-5" /></Button>
                            <Button variant="outline" size="icon" className="oc-image-viewer-next" title={t('chat.toolOutputDialog.image.nextAria')} aria-label={t('chat.toolOutputDialog.image.nextAria')} onClick={() => rtl ? viewer.current?.prev() : viewer.current?.next()}><Icon name="arrow-right-s" className="size-5" /></Button>
                        </> : null}
                        {loading || failed ? <div className="oc-image-viewer-state">
                            {failed ? <ContentState
                                icon={<Icon name="image" className="size-8" />}
                                title={t('common.image.loadFailed')}
                                className="h-auto min-w-48 rounded-xl bg-background"
                                actions={<Button variant="outline" size="sm" onClick={() => {
                                    const pswp = viewer.current;
                                    if (pswp) { setFailed(false); setLoading(true); pswp.refreshSlideContent(pswp.currIndex); }
                                }}>{t('common.image.retry')}</Button>}
                            /> : <ContentLoadingState label={t('common.image.loading')} className="h-auto min-w-48" />}
                        </div> : null}
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
