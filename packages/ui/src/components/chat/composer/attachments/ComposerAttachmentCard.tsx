import React from 'react';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Icon } from '@/components/icon/Icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { formatFileSize } from '@/lib/fileSize';
import { resolveAttachmentOpenTarget } from '@/lib/messages/attachmentPreview';
import { useOpenAttachment } from '../../message/useOpenAttachment';
import type { ToolPopupContent } from '../../message/types';

const DOCUMENT_PREVIEW = /\.(pdf|docx|xlsx|xlsm|pptx|heic|heif)$/i;

function useAttachmentThumbnail(file: AttachedFile): string | null {
  const { fileThumbnails } = useRuntimeAPIs();
  const runtimeKey = getRuntimeKey();
  const [preview, setPreview] = React.useState<{ file: AttachedFile; runtimeKey: string; src: string } | null>(null);
  const image = file.mimeType.startsWith('image/') ? file.dataUrl || file.serverPath || null : null;
  React.useEffect(() => {
    if (image || !DOCUMENT_PREVIEW.test(file.filename)) return;
    let active = true;
    let release: (() => Promise<void>) | undefined;
    const render = async () => {
      const path = file.agentPath ?? file.serverPath ?? file.vscodePath;
      const native = path && fileThumbnails ? await fileThumbnails.read(path).catch(() => null) : null;
      if (!active) return;
      if (native) {
        setPreview({ file, runtimeKey, src: native });
        return;
      }
      if (file.mimeType !== 'application/pdf' || !file.dataUrl.startsWith('data:application/pdf')) return;
      const { openPdf } = await import('@/components/views/files/previews/pdfjs');
      if (!active) return;
      const document = openPdf(file.dataUrl);
      release = document.destroy;
      const pdf = await document.promise;
      const page = await pdf.getPage(1);
      if (!active) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 256 / original.width });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      if (active) setPreview({ file, runtimeKey, src: canvas.toDataURL('image/png') });
    };
    void render().catch(() => {
      // A preview failure leaves the file card available to open and send.
    }).finally(() => { void release?.(); release = undefined; });
    return () => { active = false; void release?.(); release = undefined; };
  }, [file, fileThumbnails, image, runtimeKey]);
  return image || (preview?.file === file && preview.runtimeKey === runtimeKey ? preview.src : null);
}

export const ComposerAttachmentCard = React.memo(function ComposerAttachmentCard({ file, onRemove, onShowPopup, gallery, index = 0 }: {
  file: AttachedFile;
  onRemove: () => void;
  onShowPopup?: (content: ToolPopupContent) => void;
  gallery?: NonNullable<ToolPopupContent['image']>['gallery'];
  index?: number;
}) {
  const { t } = useI18n();
  const thumbnail = useAttachmentThumbnail(file);
  const openAttachment = useOpenAttachment(onShowPopup);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const isImage = file.mimeType.startsWith('image/');
  const path = file.agentPath ?? file.serverPath ?? file.vscodePath;
  const target = resolveAttachmentOpenTarget({ mime: file.mimeType, filename: file.filename, url: file.dataUrl }, []);
  const open = () => {
    if (isImage && thumbnail) {
      onShowPopup?.({ open: true, title: file.filename, content: '', image: {
        url: thumbnail, mimeType: file.mimeType, filename: file.filename, size: file.size,
        gallery, index, origin: imageRef.current ?? undefined,
      } });
    } else if (path) openAttachment({ kind: 'file', path });
    else if (target) openAttachment(target);
  };
  return (
    <div className="group relative w-36 shrink-0 overflow-hidden rounded-lg oc-tile" data-composer-attachment={file.filename}>
      <button type="button" onClick={open} aria-label={file.filename} className="flex w-full flex-col text-start">
        <div className="flex h-24 w-full items-center justify-center overflow-hidden">
          {thumbnail
            ? <img ref={imageRef} src={thumbnail} alt="" className="h-full w-full object-contain" />
            : <FileTypeIcon filePath={file.filename} className="h-12 w-12 text-muted-foreground" />}
        </div>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5">
          <FileTypeIcon filePath={file.filename} className="h-4 w-4 shrink-0" />
          <span dir="auto" className="truncate typography-micro text-foreground">{file.filename}</span>
        </div>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={onRemove} aria-label={t('chat.fileAttachment.actions.removeNamed', { name: file.filename })}
            className="absolute top-1 inset-e-1 flex h-5 w-5 items-center justify-center rounded-md bg-background text-muted-foreground opacity-0 transition-opacity hover:bg-interactive-hover group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
            style={{ width: 20, height: 20, minWidth: 0, minHeight: 0 }}>
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('chat.fileAttachment.actions.removeNamed', { name: file.filename })}</TooltipContent>
      </Tooltip>
      <span className="sr-only">{formatFileSize(file.size)}</span>
    </div>
  );
});
