import React, { useRef, memo } from 'react';
import { useDraftAttachedFiles, useInputStore } from '@/sync/input-store';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import type { AttachedFile } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/fileSize';
import { getLanguageFromExtension, isDrawioFile, isExcalidrawFile } from '@/lib/toolHelpers';
import { trackerPresentation } from '@/lib/trackers/presentation';
import { decodeDataUrlText, getIssueLinkKind, getRepositoryIssueLinkProvider, getTrackerItemLinkProvider, isTextLikeFile, resolveAttachmentOpenTarget, type IssueLinkKind } from '@/lib/messages/attachmentPreview';
import { ProviderIcon } from '@/components/sourceControl/ProviderIcon';
import { useSourceControlProvider } from '@/lib/source-control/providers/registry';
import { useOpenAttachment } from './message/useOpenAttachment';
import { INLINE_SERVER_ATTACHMENT_ID_PREFIX } from './composer/attachments/inlineMentionAttachments';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { StatusImage } from '@/components/ui/status-image';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';

import type { ToolPopupContent } from './message/types';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ComposerAttachmentCard } from './composer/attachments/ComposerAttachmentCard';

const FileAttachmentButton = memo(() => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachedFile = useInputStore((state) => state.addAttachedFile);
  const isMobile = useUIStore((state) => state.isMobile);
  const runtimeApis = useRuntimeAPIs();
  const isVSCodeRuntime = runtimeApis.runtime.isVSCode;
  const buttonSizeClass = isMobile ? 'h-9 w-9' : 'h-7 w-7';
  const iconSizeClass = isMobile ? 'h-5 w-5' : 'h-[18px] w-[18px]';

  const attachFiles = async (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await addAttachedFile(file);
      } catch (error) {
        console.error('File attach failed', error);
        toast.error(error instanceof Error ? error.message : t('chat.fileAttachment.toast.attachFailed'));
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await attachFiles(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVSCodePick = async () => {
    try {
      const data = (await runtimeApis.vscode?.pickFiles?.()) as {
        files?: Array<{ name: string; mimeType?: string; dataUrl?: string }>;
        skipped?: Array<{ name?: string; reason?: string }>;
      } | undefined;
      const picked = Array.isArray(data?.files) ? data.files : [];
      const skipped = Array.isArray(data?.skipped) ? data.skipped : [];

      if (skipped.length > 0) {
        const summary = skipped.map((s: { name?: string; reason?: string }) => `${s?.name || t('chat.fileAttachment.fileFallback')}: ${s?.reason || t('chat.fileAttachment.skippedFallback')}`).join('\n');
        toast.error(t('chat.fileAttachment.toast.someFilesSkipped', { summary }));
      }

      const asFiles = picked
        .map((file: { name: string; mimeType?: string; dataUrl?: string }) => {
          if (!file?.dataUrl) return null;
          try {
            const [meta, base64] = file.dataUrl.split(',');
            const mime = file.mimeType || (meta?.match(/data:(.*);base64/)?.[1] || 'application/octet-stream');
            if (!base64) return null;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mime });
            return new File([blob], file.name || t('chat.fileAttachment.fileFallback'), { type: mime });
          } catch (err) {
            console.error('Failed to decode VS Code picked file', err);
            return null;
          }
        })
        .filter(Boolean) as File[];

      if (asFiles.length > 0) {
        await attachFiles(asFiles);
      }
    } catch (error) {
      console.error('VS Code file pick failed', error);
      toast.error(error instanceof Error ? error.message : t('chat.fileAttachment.toast.vscodePickFailed'));
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={isVSCodeRuntime ? handleVSCodePick : () => fileInputRef.current?.click()}
            className={cn(
              'flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'hover:bg-interactive-hover text-muted-foreground',
              buttonSizeClass
            )}
            aria-label={t('chat.fileAttachment.actions.attachAria')}
          >
            <Icon name="attachment-2" className={iconSizeClass} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{t('chat.fileAttachment.actions.attach')}</p>
        </TooltipContent>
      </Tooltip>
    </>
  );
});

FileAttachmentButton.displayName = 'FileAttachmentButton';

interface AttachedFilesListProps {
  onShowPopup?: (content: ToolPopupContent) => void;
  className?: string;
  /** The composer draft whose files to show; its own even while another composer holds the slot. */
  draftIdentity?: ChatDraftIdentity | null;
}

const ComposerAttachments = ({ files, onShowPopup, className }: {
  files: AttachedFile[];
  onShowPopup?: (content: ToolPopupContent) => void;
  className?: string;
}) => {
  const removeAttachedFile = useInputStore((state) => state.removeAttachedFile);
  const documents = new Set<string>();
  const visible = files.filter((file) => {
    if (!file.sourceDocumentId) return true;
    if (documents.has(file.sourceDocumentId)) return false;
    documents.add(file.sourceDocumentId);
    return true;
  });
  const images = visible.filter((file) => file.mimeType.startsWith('image/'));
  const gallery = images.map((file) => ({ url: file.dataUrl || file.serverPath || '', mimeType: file.mimeType, filename: file.filename, size: file.size }));
  if (files.length === 0) return null;
  return (
    <div className={cn('flex w-full min-w-0 gap-2 overflow-x-auto pb-1', className)}>
      {visible.map((file) => <ComposerAttachmentCard key={file.id} file={file} onRemove={() => removeAttachedFile(file.id)} onShowPopup={onShowPopup} gallery={gallery} index={images.indexOf(file)} />)}
    </div>
  );
};

export const AttachedVSCodeFileChips = memo(({ onShowPopup, draftIdentity }: AttachedFilesListProps) => (
  <ComposerAttachments files={useDraftAttachedFiles(draftIdentity).filter((file) => file.source === 'vscode')} onShowPopup={onShowPopup} />
));
AttachedVSCodeFileChips.displayName = 'AttachedVSCodeFileChips';

export const AttachedFilesList = memo(({ onShowPopup, className, draftIdentity }: AttachedFilesListProps) => (
  <ComposerAttachments files={useDraftAttachedFiles(draftIdentity).filter((file) => file.source !== 'vscode' && !file.id.startsWith(INLINE_SERVER_ATTACHMENT_ID_PREFIX))} onShowPopup={onShowPopup} className={className} />
));
AttachedFilesList.displayName = 'AttachedFilesList';

export const ActiveEditorFileSuggestion = memo(() => {
  const { t } = useI18n();
  const activeEditorFile = useInputStore((s) => s.activeEditorFile);
  const attachedFiles = useInputStore((s) => s.attachedFiles)
  const addVSCodeFileAttachment = useInputStore((s) => s.addVSCodeFileAttachment)
  const addVSCodeSelectionAttachment = useInputStore((s) => s.addVSCodeSelectionAttachment)
  const isVSCodeRuntime = useRuntimeAPIs().runtime.isVSCode;

  if (!isVSCodeRuntime || !activeEditorFile) return null;

  const { filePath, fileName, relativePath, selection, fileSize } = activeEditorFile;

  // Normalize to forward slashes for comparison
  const isFileAttached = attachedFiles.some(
    (f) => f.source === 'vscode' && f.vscodeSource === 'file' && (f.vscodePath || '') === filePath
  )

  // Compute selection label using a compact range (single line shown as "N" not "N-N")
  let selectionRange = ''
  if (selection) {
    selectionRange = selection.startLine === selection.endLine
      ? `${selection.startLine}`
      : `${selection.startLine}-${selection.endLine}`
  }
  const selectionLabel = selection ? `${relativePath}:${selectionRange}` : ''
  const isSelectionAttached = !!selectionLabel && attachedFiles.some(
    (f) => f.source === 'vscode' && f.vscodeSource === 'selection' && f.filename === selectionLabel && f.vscodePath === filePath
  )

  // Nothing to show — file is already attached and there's no (or already-attached) selection
  if (isFileAttached && (!selection || isSelectionAttached)) return null;

  const ext = fileName.split('.').pop() || '';
  // Always show only the filename in the suggestion UI
  const displayName = fileName;

  const handleAddFile = () => {
    try {
      addVSCodeFileAttachment(filePath, fileName, fileSize);
    } catch (error) {
      // The store names the cause (a file too large to send).
      if (error instanceof Error) toast.error(error.message);
    }
  };

  const handlePinSelection = async () => {
    if (!selection) return;
    const blob = new Blob([selection.text], { type: 'text/plain' });
    const file = new File([blob], selectionLabel, { type: 'text/plain' });
    await addVSCodeSelectionAttachment(filePath, file);
  };

  // If there is a selection, prefer showing the pin-selection UI only.
  const showSelectionPin = !!selection && !isSelectionAttached;
  const showFileAdd = !showSelectionPin && !isFileAttached;

  if (!showSelectionPin && !showFileAdd) return null;

  return (
    <div className="inline-flex items-center">
      {showSelectionPin && (
        <div
          className="inline-flex items-center gap-1 text-xs pe-1 rounded-sm italic text-muted-foreground border border-dashed bg-transparent"
          style={{ borderColor: 'var(--interactive-border)' }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('chat.fileAttachment.activeEditor.pinSelection')}
                onClick={() => { void handlePinSelection(); }}
                className="flex items-center justify-center h-5 w-5 flex-shrink-0 hover:bg-[var(--interactive-hover)] rounded-full transition-colors cursor-pointer"
              >
                <Icon name="pushpin-2" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t('chat.fileAttachment.activeEditor.pinSelection')}</TooltipContent>
          </Tooltip>
          <FileTypeIcon filePath={fileName} extension={ext} className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs whitespace-nowrap" title={relativePath}>{`${displayName}:${selectionRange}`}</span>
        </div>
      )}
      {showFileAdd && (
        <div
          className="inline-flex items-center gap-1 text-xs pe-1 rounded-sm italic text-muted-foreground border border-dashed bg-transparent"
          style={{ borderColor: 'var(--interactive-border)' }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('chat.fileAttachment.activeEditor.addFile', { name: displayName })}
                onClick={handleAddFile}
                className="flex items-center justify-center h-5 w-5 flex-shrink-0 hover:bg-[var(--interactive-hover)] rounded-full transition-colors cursor-pointer"
              >
                <Icon name="add" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t('chat.fileAttachment.activeEditor.addFile', { name: displayName })}</TooltipContent>
          </Tooltip>
          <FileTypeIcon filePath={fileName} extension={ext} className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs truncate max-w-[220px]" title={relativePath}>{displayName}</span>
        </div>
      )}
    </div>
  );
});

ActiveEditorFileSuggestion.displayName = 'ActiveEditorFileSuggestion';

interface FilePart {
  type: string;
  mime?: string;
  url?: string;
  filename?: string;
  size?: number;
  source?: Record<string, unknown>;
}

const issueLinkIcon = (kind: Exclude<IssueLinkKind, 'repository-issue' | 'tracker-item'>): 'git-pull-request' | 'attachment-2' => (
  kind === 'guest-issue' ? 'attachment-2' : 'git-pull-request'
);

/** An issue or PR link chip's mark: a repository issue wears its provider's, a tracker item its tracker's. */
const IssueLinkIcon: React.FC<{ file: { mime?: string }; kind: IssueLinkKind; className?: string }> = ({ file, kind, className }) => {
  const provider = useSourceControlProvider(getRepositoryIssueLinkProvider(file));
  if (kind === 'repository-issue') return <ProviderIcon descriptor={provider} className={className} />;
  if (kind === 'tracker-item') return <Icon name={trackerPresentation(getTrackerItemLinkProvider(file)).icon} className={className} />;
  return <Icon name={issueLinkIcon(kind)} className={className} />;
};

interface MessageFilesDisplayProps {
  files: FilePart[];
  onShowPopup?: (content: ToolPopupContent) => void;
  compact?: boolean;
  /** Compact only: replaces the default top margin, for placement above content. */
  className?: string;
}

export const MessageFilesDisplay = memo(({ files, onShowPopup, compact = false, className }: MessageFilesDisplayProps) => {
  const { t } = useI18n();
  const openAttachment = useOpenAttachment(onShowPopup);

  const fileItems = files.filter(f => f.type === 'file' && (f.mime || f.url));

  const extractFilename = (path?: string): string => {
    if (!path) return 'Unnamed file';

    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const filename = parts[parts.length - 1];

    return filename || path;
  };

  const resolveDisplayName = React.useCallback((file: FilePart): string => {
    const isIssueLink = getIssueLinkKind(file) !== null;
    if (isIssueLink && typeof file.filename === 'string' && file.filename.trim().length > 0) {
      return file.filename.trim();
    }
    return extractFilename(file.filename || file.url);
  }, []);

  const imageFiles = fileItems.filter(f => f.mime?.startsWith('image/') && f.url);
  const otherFiles = fileItems.filter(f => !f.mime?.startsWith('image/'));

  // What a compact chip or thumbnail opens; a preview needs the message's popup.
  const resolveOpenTarget = (file: FilePart) => {
    const target = resolveAttachmentOpenTarget(file, fileItems);
    return target?.kind === 'popup' && !onShowPopup ? null : target;
  };

  const showFilePopup = React.useCallback((file: FilePart, fileName: string) => {
    if (!onShowPopup || !file.url) {
      return;
    }

    if (isTextLikeFile(file)) {
      const text = decodeDataUrlText(file.url);
      if (text !== null) {
        onShowPopup({
          open: true,
          title: fileName,
          content: text,
          language: getLanguageFromExtension(fileName) || undefined,
        });
        return;
      }
    }

    onShowPopup({
      open: true,
      title: fileName,
      content: '',
      image: {
        url: file.url,
        mimeType: file.mime,
        filename: fileName,
      },
    });
  }, [onShowPopup]);

  if (fileItems.length === 0) return null;

  if (compact) {
    return (
      <div className={cn('space-y-1.5', className ?? 'mt-1.5')}>
        {otherFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {otherFiles.map((file, index) => {
              const fileName = resolveDisplayName(file);
              const ext = fileName.split('.').pop() || '';
              const sizeText = formatFileSize(file.size);
              const issueLinkKind = getIssueLinkKind(file);
              const openTarget = resolveOpenTarget(file);
              return (
                <Tooltip key={`file-${file.url || file.filename || index}`}>
                  <TooltipTrigger asChild>
                    {issueLinkKind && openTarget ? (
                      <button
                        type="button"
                        onClick={(event) => openAttachment(openTarget, event)}
                        className="inline-flex items-center bg-muted/30 border border-edge-muted typography-meta gap-1 px-2 py-0.5 rounded-lg text-foreground hover:text-primary transition-colors"
                      >
                        <IssueLinkIcon file={file} kind={issueLinkKind} className="text-muted-foreground h-3.5 w-3.5" />
                        <div className="overflow-hidden max-w-[220px]">
                          <span className="truncate block">{fileName}</span>
                        </div>
                      </button>
                    ) : openTarget ? (
                      <button
                        type="button"
                        onClick={() => openAttachment(openTarget)}
                        className="inline-flex items-center bg-muted/30 border border-edge-muted typography-meta gap-1 px-2 py-0.5 rounded-lg text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
                      >
                        <FileTypeIcon filePath={fileName} extension={ext} className="text-muted-foreground h-3.5 w-3.5" />
                        <div className="overflow-hidden max-w-[140px]">
                          <span className="truncate block">{fileName}</span>
                        </div>
                      </button>
                    ) : (
                      <div className="inline-flex items-center bg-muted/30 border border-edge-muted typography-meta gap-1 px-2 py-0.5 rounded-lg">
                        {file.mime?.includes('pdf') ? (
                          <Icon name="file-pdf" className="text-muted-foreground h-3.5 w-3.5" />
                        ) : (
                          <FileTypeIcon filePath={fileName} extension={ext} className="text-muted-foreground h-3.5 w-3.5" />
                        )}
                        <div className="overflow-hidden max-w-[140px]">
                          <span className="truncate block">{fileName}</span>
                        </div>
                      </div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {imageFiles.length > 0 && (
          <ScrollableOverlay outerClassName="overlay-scrollbar-wrapper--no-gutter -mx-1 w-auto" className="px-1 py-0.5" fillContainer={false}>
            <div className="flex snap-x snap-mandatory gap-2">
              {imageFiles.map((file, index) => {
                const filename = resolveDisplayName(file) || 'Image';
                const openTarget = resolveOpenTarget(file);

                return (
                  <Tooltip key={`img-${file.url || file.filename || index}`}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(event) => {
                          if (openTarget) openAttachment(openTarget, event);
                        }}
                        className="relative flex-none border border-edge-muted bg-muted/10 overflow-hidden snap-start h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring"
                        aria-label={filename}
                      >
                        {file.url ? (
                          <StatusImage
                            src={file.url}
                            alt={filename}
                            variant="thumbnail"
                            className="h-full w-full"
                            imgClassName="h-full w-full object-cover"
                            lazy
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-muted/30 text-muted-foreground">
                            <Icon name="file-image" className="h-6 w-6" />
                          </div>
                        )}
                        <span className="sr-only">{filename}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="typography-meta px-2 py-1">
                      {filename}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </ScrollableOverlay>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-2",
      compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
    )}>
      {fileItems.map((file, index) => {
        const fileName = resolveDisplayName(file);
        const isImage = file.mime?.startsWith('image/');
        const sizeText = formatFileSize(file.size);
        const issueLinkKind = getIssueLinkKind(file);

        if (isImage && file.url) {
          return (
            <div
              key={file.url || `${fileName}-${index}`}
              className="relative aspect-video rounded-lg border border-edge-muted bg-muted/10 overflow-hidden group"
            >
              <StatusImage
                src={file.url}
                alt={fileName}
                variant="thumbnail"
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                lazy
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 inset-s-0 inset-e-0 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs font-medium truncate">{fileName}</p>
                {sizeText && <p className="text-xs opacity-80">{sizeText}</p>}
              </div>
            </div>
          );
        }

        if (issueLinkKind && file.url) {
          const issueUrl = file.url;
          return (
            <Tooltip key={file.url || `${fileName}-${index}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => openAttachment({ kind: 'external', url: issueUrl }, event)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  <div className="flex-shrink-0">
                    <IssueLinkIcon file={file} kind={issueLinkKind} className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileName}</p>
                    {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        const source = file.source;
        const sourceType = typeof source?.type === 'string' ? source.type : undefined;
        const sourcePath = source && typeof (source as Record<string, unknown>).path === 'string' ? (source as Record<string, unknown>).path as string : undefined;
        const filePath = sourceType === 'file' && sourcePath ? sourcePath : (file.url || '');
        const opensInDiagramEditor = filePath && (isDrawioFile(filePath) || isExcalidrawFile(filePath));

        if (opensInDiagramEditor) {
          return (
            <Tooltip key={file.url || `${fileName}-${index}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    const directory = useDirectoryStore.getState().currentDirectory;
                    if (directory) {
                      useUIStore.getState().openContextFile(directory, filePath);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start cursor-pointer",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  <Icon name="file" className={cn("text-muted-foreground shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{fileName}</p>
                    <p className="text-xs text-status-info">{t('chat.fileAttachment.openInDiagram')}</p>
                  </div>
                  <Icon name="external-link" className={cn("text-muted-foreground shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('chat.fileAttachment.openInDiagram')}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Tooltip key={file.url || `${fileName}-${index}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  showFilePopup(file, fileName);
                }}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg oc-tile oc-tile-hover text-start",
                  compact ? "text-xs" : "text-sm"
                )}
              >
                <div className="flex-shrink-0">
                  {file.mime?.startsWith('image/') ? (
                    <Icon name="file-image" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  ) : file.mime?.includes('pdf') ? (
                    <Icon name="file-pdf" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  ) : (
                    <Icon name="file" className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{fileName}</p>
                  {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fileName}{sizeText ? ` (${sizeText})` : ''}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
});

MessageFilesDisplay.displayName = 'MessageFilesDisplay';

interface ImageGalleryProps {
  urls: string[];
  caption?: string;
  onShowPopup?: (content: ToolPopupContent) => void;
}

const ImageGallery = memo(({ urls, caption, onShowPopup }: ImageGalleryProps) => {
  if (urls.length === 0) return null;

  const getGridCols = () => {
    if (urls.length === 1) return 'grid-cols-1';
    if (urls.length === 2) return 'grid-cols-2';
    if (urls.length <= 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", getGridCols())}>
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => onShowPopup?.({
              open: true,
              title: caption || `Image ${index + 1} of ${urls.length}`,
              content: '',
              image: {
                url,
                gallery: urls.map(u => ({ url: u })),
                index,
              },
            })}
            className="relative aspect-square rounded-lg border border-edge-muted bg-muted/10 overflow-hidden group"
          >
            <img
              src={url}
              alt={caption || `Image ${index + 1}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        ))}
      </div>
      {caption && (
        <p className="text-sm text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
});

ImageGallery.displayName = 'ImageGallery';
