"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Edit3,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/services/api";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/settings/settings-dialog";

export function Sidebar() {
  const {
    chats,
    activeId,
    sidebarOpen,
    setSidebarOpen,
    reset,
    setChats,
    setActiveId,
  } = useChatStore();
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const filtered = useMemo(
    () =>
      chats.filter((chat) =>
        chat.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [chats, query],
  );
  function open(id: string) {
    setActiveId(id);
    setSidebarOpen(false);
  }
  async function remove(id: string) {
    if (!confirm("Delete this conversation permanently?")) return;
    await api.deleteChat(id);
    setChats(chats.filter((c) => c.id !== id));
    if (activeId === id) reset();
  }
  async function rename(id: string, title: string) {
    const next = prompt("Rename conversation", title)?.trim();
    if (!next) return;
    const updated = await api.updateChat(id, { title: next });
    setChats(chats.map((c) => (c.id === id ? updated : c)));
  }
  async function pin(id: string, value: boolean) {
    const updated = await api.updateChat(id, { pinned: !value });
    setChats(
      chats
        .map((c) => (c.id === id ? updated : c))
        .sort((a, b) => b.pinned - a.pinned),
    );
  }
  return (
    <>
      <button
        className="fixed top-3 left-3 z-30 grid size-10 place-items-center rounded-xl bg-[var(--panel)] shadow md:hidden"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open sidebar"
      >
        <Menu />
      </button>
      {!desktopOpen && (
        <button
          className="fixed top-3 left-3 z-30 hidden size-10 place-items-center rounded-xl bg-[var(--panel)] shadow md:grid"
          onClick={() => setDesktopOpen(true)}
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}
      <AnimatePresence>
        <motion.aside
          initial={false}
          animate={{ x: sidebarOpen ? 0 : undefined }}
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[286px] -translate-x-full flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)] shadow-2xl transition-[transform,width] md:static md:shadow-none",
            sidebarOpen && "translate-x-0",
            desktopOpen
              ? "md:translate-x-0"
              : "md:w-0 md:-translate-x-full md:overflow-hidden",
          )}
        >
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="font-display grid size-9 place-items-center rounded-xl bg-[var(--accent)] font-bold">
              A
            </span>
            <b className="font-display">AI Studio</b>
            <button
              className="ml-auto hidden rounded-lg p-2 text-white/60 hover:bg-white/10 md:block"
              onClick={() => setDesktopOpen(false)}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
            <button
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="px-3">
            <button
              onClick={reset}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              <MessageSquarePlus className="size-4" />
              New conversation
            </button>
            <label className="mt-3 flex items-center gap-2 rounded-xl bg-black/15 px-3 py-2 text-sm text-white/50">
              <Search className="size-4" />
              <input
                aria-label="Search conversations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/30"
                placeholder="Search chats"
              />
              <kbd className="text-[10px]">⌘K</kbd>
            </label>
          </div>
          <div className="scrollbar mt-5 flex-1 overflow-y-auto px-2">
            <p className="px-3 pb-2 text-[10px] font-bold tracking-[.16em] text-white/35 uppercase">
              {query ? "Results" : "Conversations"}
            </p>
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-white/35">
                No conversations yet
              </p>
            ) : (
              filtered.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group mb-1 flex items-center rounded-xl text-sm",
                    activeId === chat.id ? "bg-white/12" : "hover:bg-white/7",
                  )}
                >
                  <button
                    onClick={() => open(chat.id)}
                    className="min-w-0 flex-1 truncate px-3 py-2.5 text-left"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {Boolean(chat.pinned) && (
                        <Pin className="size-3 shrink-0 text-[#ff866d]" />
                      )}
                      {chat.title}
                    </span>
                  </button>
                  <div className="hidden items-center pr-1 group-hover:flex">
                    <button
                      onClick={() => pin(chat.id, Boolean(chat.pinned))}
                      className="p-1.5 text-white/45 hover:text-white"
                      title="Pin"
                    >
                      <Pin className="size-3.5" />
                    </button>
                    <button
                      onClick={() => rename(chat.id, chat.title)}
                      className="p-1.5 text-white/45 hover:text-white"
                      title="Rename"
                    >
                      <Edit3 className="size-3.5" />
                    </button>
                    <button
                      onClick={() => remove(chat.id)}
                      className="p-1.5 text-white/45 hover:text-red-300"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-white/10 p-3">
            <button
              onClick={() => setSettings(true)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/8"
            >
              <Settings className="size-4" />
              Settings
            </button>
            <div className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-[#39483c] text-xs font-bold">
                YOU
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-xs">Huzaifa&apos;s AI Studio</b>
                <span className="text-[10px] text-white/35">Local account</span>
              </div>
              <MoreHorizontal className="size-4 text-white/35" />
            </div>
          </div>
        </motion.aside>
      </AnimatePresence>
      {sidebarOpen && (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </>
  );
}
