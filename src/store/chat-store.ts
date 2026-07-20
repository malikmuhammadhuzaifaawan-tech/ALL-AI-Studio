import { create } from "zustand";
import type { Attachment, Conversation, Message } from "@/types";

const ACTIVE_CHAT_KEY = "ai-studio.active-chat";
const NEW_CHAT_VALUE = "__new__";

export function getSavedActiveId(): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.localStorage.getItem(ACTIVE_CHAT_KEY);
  if (value === null) return undefined;
  return value === NEW_CHAT_VALUE ? null : value;
}

function saveActiveId(activeId: string | null) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_CHAT_KEY, activeId ?? NEW_CHAT_VALUE);
  }
}

interface ChatState {
  chats: Conversation[];
  messages: Message[];
  activeId: string | null;
  generating: boolean;
  sidebarOpen: boolean;
  attachments: Attachment[];
  setChats: (chats: Conversation[]) => void;
  setMessages: (messages: Message[]) => void;
  setActiveId: (id: string | null) => void;
  setGenerating: (value: boolean) => void;
  setSidebarOpen: (value: boolean) => void;
  setAttachments: (files: Attachment[]) => void;
  appendMessage: (message: Message) => void;
  updateLastAssistant: (content: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  messages: [],
  activeId: null,
  generating: false,
  sidebarOpen: false,
  attachments: [],
  setChats: (chats) => set({ chats }),
  setMessages: (messages) => set({ messages }),
  setActiveId: (activeId) => {
    saveActiveId(activeId);
    set({ activeId });
  },
  setGenerating: (generating) => set({ generating }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setAttachments: (attachments) => set({ attachments }),
  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateLastAssistant: (content) =>
    set((state) => ({
      messages: state.messages.map((message, index) =>
        index === state.messages.length - 1 && message.role === "assistant"
          ? { ...message, content }
          : message,
      ),
    })),
  reset: () => {
    saveActiveId(null);
    set({ activeId: null, messages: [], attachments: [], sidebarOpen: false });
  },
}));
