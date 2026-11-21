import { conversationClient } from "@/lib/agent/active"
import { type SessionPageLister } from "@/stores/globalSessions"

export const listSessionPage: SessionPageLister = (options) => conversationClient.listSessionsPage(options)
