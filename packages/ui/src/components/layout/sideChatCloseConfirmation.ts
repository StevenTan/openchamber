import type { Session } from '@/lib/opencode/model';

type CloseRequest = {
  sessions: Pick<Session, 'id' | 'title'>[];
  resolve: (confirmed: boolean) => void;
};

let pending: CloseRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const getSideChatCloseConfirmation = () => pending;
export const subscribeSideChatCloseConfirmation = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function settleSideChatCloseConfirmation(confirmed: boolean): void {
  const request = pending;
  pending = null;
  emit();
  request?.resolve(confirmed);
}

export function confirmSideChatClose(sessions: CloseRequest['sessions']): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { sessions, resolve };
    emit();
  });
}
