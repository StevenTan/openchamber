import React, { type JSX, type ReactNode } from 'react';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { FilesAPI, RuntimeAPIs } from '@/lib/api/types';
import { createContentCachedFiles } from '@/contexts/content-cache-owner';
import { bindElasticScroll } from '@/lib/motion/elasticScroll';

type ContentCachedFiles = ReturnType<typeof createContentCachedFiles>;

export function RuntimeAPIProvider({ apis, children }: { apis: RuntimeAPIs; children: ReactNode }): JSX.Element {
  React.useEffect(() => {
    const native = apis.nativeScroll;
    if (!native) return bindElasticScroll(document);
    let closed = false;
    let dispose: (() => void) | undefined;
    void native.ready().then((ready) => {
      if (!closed) dispose = bindElasticScroll(document, ready ? native : undefined);
    }).catch(console.error.bind(console, 'Native scroll initialization failed'));
    return () => { closed = true; dispose?.(); };
  }, [apis.nativeScroll]);
  // Effect-owned lifecycle: React Strict Mode dispose+remount must create a fresh
  // owner. useMemo + dispose reused a dead owner and broke text-file opens
  // (binaries skipped the pre-read, so they still appeared to work).
  const [cachedOwner, setCachedOwner] = React.useState<ContentCachedFiles | null>(null);

  React.useEffect(() => {
    const owner = createContentCachedFiles(apis.files);
    setCachedOwner(owner);
    return () => {
      owner.dispose();
      setCachedOwner((current) => (current === owner ? null : current));
    };
  }, [apis.files]);

  const files: FilesAPI = cachedOwner?.files ?? apis.files;
  const cachedApis = React.useMemo<RuntimeAPIs>(
    () => ({
      ...apis,
      files,
    }),
    [apis, files],
  );
  return <RuntimeAPIContext.Provider value={cachedApis}>{children}</RuntimeAPIContext.Provider>;
}
