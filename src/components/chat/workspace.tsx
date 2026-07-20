"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { API_URL } from "@/config/constants";
import { api } from "@/services/api";
import { normalizeAppConfig } from "@/lib/provider-config";
import { getSavedActiveId, useChatStore } from "@/store/chat-store";
import {
  DEFAULT_TOOL_PERMISSIONS,
  loadToolPermissions,
  TOOL_PERMISSIONS_EVENT,
  type ToolPermissions,
} from "@/lib/tool-permissions";
import { Markdown } from "@/components/chat/markdown";
import { Composer } from "@/components/chat/composer";
import { Sidebar } from "@/components/chat/sidebar";
import type { StoredAttachment } from "@/types";

const suggestions = [
  {
    title: "Design a product",
    text: "Create a production-ready product dashboard with information architecture and responsive states.",
  },
  {
    title: "Analyze a document",
    text: "Review my attached document, summarize the key decisions, risks, and next actions.",
  },
  {
    title: "Write better code",
    text: "Help me design a maintainable architecture and implement it with tests.",
  },
  {
    title: "Create an image prompt",
    text: "Write a detailed art direction prompt for a premium editorial campaign.",
  },
];
const browserActionPattern =
  /\b(open|launch|visit|khol|kholo|kholen|kro|karo)\b/i;

function MessageAttachments({ files }: { files: StoredAttachment[] }) {
  if (!files.length) return null;
  return (
    <div className="mb-3 flex max-w-full flex-wrap gap-2">
      {files.map((file, index) => {
        const source = file.url ?? file.data_url;
        const card = (
          <div className="flex w-52 max-w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 text-left shadow-sm">
            {file.type.startsWith("image/") && source ? (
              <Image
                unoptimized
                src={source}
                alt={file.name}
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--panel-soft)]">
                <FileText className="size-4" />
              </span>
            )}
            <span className="min-w-0">
              <b className="block truncate text-xs">{file.name}</b>
              <span className="muted text-[10px]">
                {Math.max(1, Math.ceil(file.size / 1024)).toLocaleString()} KB
              </span>
            </span>
          </div>
        );
        return source ? (
          <a
            key={`${file.name}-${index}`}
            href={source}
            download={file.name}
            title={`Download ${file.name}`}
          >
            {card}
          </a>
        ) : (
          <div key={`${file.name}-${index}`}>{card}</div>
        );
      })}
    </div>
  );
}

export function Workspace() {
  const store = useChatStore();
  const setChats = useChatStore((state) => state.setChats);
  const setMessages = useChatStore((state) => state.setMessages);
  const activeId = useChatStore((state) => state.activeId);
  const restoredChat = useRef(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const [model, setModel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [toolPermissions, setToolPermissions] = useState<ToolPermissions>(
    DEFAULT_TOOL_PERMISSIONS,
  );
  const bottom = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
  });
  const normalizedConfig = useMemo(() => normalizeAppConfig(config), [config]);
  const activeProvider = normalizedConfig.active_provider;
  const activeConfig = normalizedConfig.providers[activeProvider];
  const { data: chats } = useQuery({ queryKey: ["chats"], queryFn: api.chats });
  const { data: activeChat, error: activeChatError } = useQuery({
    queryKey: ["chat", activeId],
    queryFn: () => api.chat(activeId!),
    enabled: Boolean(activeId),
  });
  useEffect(() => {
    setToolPermissions(loadToolPermissions());
    const update = (event: Event) =>
      setToolPermissions(
        (event as CustomEvent<ToolPermissions>).detail ?? loadToolPermissions(),
      );
    window.addEventListener(TOOL_PERMISSIONS_EVENT, update);
    return () => window.removeEventListener(TOOL_PERMISSIONS_EVENT, update);
  }, []);
  useEffect(() => {
    if (chats) setChats(chats);
  }, [chats, setChats]);
  useEffect(() => {
    if (activeChat?.id === activeId) {
      setMessages(activeChat.messages ?? []);
    }
  }, [activeChat, activeId, setMessages]);
  useEffect(() => {
    if (activeChatError) {
      toast.error(
        activeChatError instanceof Error
          ? activeChatError.message
          : "Could not load chat history",
      );
    }
  }, [activeChatError]);
  useEffect(() => {
    if (!chats || restoredChat.current) return;
    restoredChat.current = true;
    const savedId = getSavedActiveId();
    if (savedId === null) return;
    const target =
      savedId && chats.some((chat) => chat.id === savedId)
        ? savedId
        : savedId === undefined
          ? chats[0]?.id
          : undefined;
    if (!target) {
      if (savedId) store.reset();
      return;
    }
    store.setActiveId(target);
  }, [chats, store]);
  useEffect(() => {
    if (activeConfig?.chat_model && !model) setModel(activeConfig.chat_model);
  }, [activeConfig, model]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [store.messages]);
  const send = useCallback(
    async (content: string) => {
      const abort = new AbortController();
      setController(abort);
      store.setGenerating(true);
      const selectedAttachments = store.attachments;
      const attachments = selectedAttachments.map(
        ({ name, type, size, dataUrl, text }) => ({
          name,
          type,
          size,
          data_url: dataUrl ?? null,
          text: text ?? null,
        }),
      );
      const pendingTab =
        toolPermissions.browserActions && browserActionPattern.test(content)
          ? window.open("about:blank", "_blank")
          : null;
      if (pendingTab) {
        pendingTab.document.title = "Opening…";
        pendingTab.document.body.textContent = "Opening requested page…";
      }
      store.appendMessage({ role: "user", content, attachments });
      store.appendMessage({ role: "assistant", content: "" });
      store.setAttachments([]);
      let full = "";
      let conversationId = store.activeId;
      try {
        const response = await fetch(`${API_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            conversation_id: store.activeId,
            message: content,
            provider: activeProvider,
            model: model || null,
            allow_browser_actions: toolPermissions.browserActions,
            allow_image_generation: toolPermissions.imageGeneration,
            attachments,
          }),
        });
        if (!response.ok) {
          const body = (await response.json()) as { detail?: string };
          throw new Error(body.detail ?? "Request failed");
        }
        if (!response.body) throw new Error("Streaming is unavailable");
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "",
          actionReceived = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            if (!event.startsWith("data: ")) continue;
            const payload = event.slice(6).trim();
            if (!payload) continue;
            let item: {
              type: string;
              conversation_id?: string;
              content?: string;
              message?: string;
              url?: string;
              label?: string;
            };
            try {
              item = JSON.parse(payload) as typeof item;
            } catch {
              throw new Error("The server returned an invalid streaming event");
            }
            if (item.type === "meta" && item.conversation_id) {
              conversationId = item.conversation_id;
              store.setActiveId(item.conversation_id);
            }
            if (item.type === "browser_action" && item.url) {
              actionReceived = true;
              if (pendingTab) pendingTab.location.replace(item.url);
              else {
                const opened = window.open(
                  item.url,
                  "_blank",
                  "noopener,noreferrer",
                );
                if (!opened)
                  toast.error(
                    `Popup blocked. Allow popups to open ${item.label ?? "the page"}.`,
                  );
              }
            }
            if (item.type === "delta") {
              full += item.content ?? "";
              store.updateLastAssistant(full);
            }
            if (item.type === "error") throw new Error(item.message);
          }
        }
        if (pendingTab && !actionReceived) pendingTab.close();
        await queryClient.invalidateQueries({ queryKey: ["chats"] });
        if (conversationId) {
          await queryClient.invalidateQueries({
            queryKey: ["chat", conversationId],
          });
        }
      } catch (error) {
        pendingTab?.close();
        store.setAttachments(selectedAttachments);
        if ((error as Error).name !== "AbortError") {
          const message = (error as Error).message;
          store.updateLastAssistant(
            full
              ? `${full}\n\n> **Stream interrupted:** ${message}`
              : `**Request failed:** ${message}`,
          );
          toast.error(message);
        }
      } finally {
        store.setGenerating(false);
        setController(null);
      }
    },
    [activeProvider, model, queryClient, store, toolPermissions],
  );
  async function generateImage() {
    if (!toolPermissions.imageGeneration) {
      toast.error("Image generation is disabled in Settings");
      return;
    }
    if (!imagePrompt.trim()) return;
    setImageLoading(true);
    setImageUrl(null);
    try {
      const result = await api.generateImage({
        prompt: imagePrompt.trim(),
        provider: activeProvider,
        model: activeConfig?.image_model || undefined,
      });
      setImageUrl(result.url);
      if (result.revised_prompt) setImagePrompt(result.revised_prompt);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Image generation failed",
      );
    } finally {
      setImageLoading(false);
    }
  }
  function exportChat() {
    const text = store.messages
      .map(
        (m) => `## ${m.role === "user" ? "You" : "AI Studio"}\n\n${m.content}`,
      )
      .join("\n\n---\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-studio-chat.md";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-[var(--border)] px-4 pl-16 md:pl-5">
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-56 rounded-lg bg-transparent px-2 py-1.5 text-sm font-semibold outline-none"
          >
            <option value={activeConfig?.chat_model ?? ""}>
              {activeConfig?.chat_model || "Configure a model"}
            </option>
          </select>
          {activeConfig?.configured ? (
            <span className="ml-2 hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 sm:flex">
              <i className="size-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          ) : (
            <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700">
              Setup required
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              disabled={!toolPermissions.imageGeneration}
              onClick={() => setImageOpen(true)}
              title={
                toolPermissions.imageGeneration
                  ? "Generate image"
                  : "Image generation is disabled in Settings"
              }
              className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ImageIcon className="size-4" />
            </button>
            <button
              onClick={exportChat}
              title="Export chat"
              className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
            >
              <Download className="size-4" />
            </button>
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(location.href)
                  .then(() => toast.success("Link copied"))
              }
              title="Share"
              className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
            >
              <Share2 className="size-4" />
            </button>
            <button
              title="More options"
              className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </header>
        <section className="scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6">
            {store.messages.length === 0 ? (
              <div className="flex min-h-[70vh] flex-col justify-center">
                <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-lg">
                  <Sparkles className="size-5" />
                </div>
                <h1 className="font-display text-3xl font-bold sm:text-4xl">
                  What are we working on?
                </h1>
                <p className="muted mt-3 max-w-xl leading-7">
                  Ask a question, attach a file, review an idea, or build
                  something ambitious with your preferred model.
                </p>
                <div className="mt-9 grid gap-3 sm:grid-cols-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.title}
                      onClick={() => send(item.text)}
                      className="surface rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <b className="text-sm">{item.title}</b>
                      <p className="muted mt-2 text-xs leading-5">
                        {item.text}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {store.messages.map((message, index) => (
                  <article
                    key={index}
                    className={`group mb-9 flex gap-4 ${message.role === "user" ? "justify-end" : ""}`}
                  >
                    {message.role === "assistant" && (
                      <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-xs font-bold text-white">
                        A
                      </span>
                    )}
                    <div
                      className={
                        message.role === "user"
                          ? "max-w-[82%] rounded-2xl bg-[var(--panel-soft)] px-4 py-3"
                          : "min-w-0 flex-1"
                      }
                    >
                      {message.role === "user" && (
                        <MessageAttachments files={message.attachments ?? []} />
                      )}
                      {message.role === "assistant" ? (
                        <Markdown
                          content={message.content}
                          streaming={
                            store.generating &&
                            index === store.messages.length - 1
                          }
                        />
                      ) : message.content ? (
                        <p className="leading-7 whitespace-pre-wrap">
                          {message.content}
                        </p>
                      ) : null}
                      {message.role === "assistant" && message.content && (
                        <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            title="Copy response"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                message.content,
                              );
                              setCopied(String(index));
                              setTimeout(() => setCopied(null), 1200);
                            }}
                            className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
                          >
                            {copied === String(index) ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                          <button
                            title="Regenerate response"
                            onClick={() => {
                              const previous = store.messages[index - 1];
                              if (previous?.role === "user")
                                void send(previous.content);
                            }}
                            className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
                          >
                            <RefreshCw className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={bottom} />
              </div>
            )}
          </div>
        </section>
        <Composer
          onSend={send}
          onStop={() => controller?.abort()}
          allowFileAttachments={toolPermissions.fileAttachments}
          allowMicrophone={toolPermissions.microphone}
        />
        {imageOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
            <div className="surface w-full max-w-xl rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center">
                <div>
                  <h2 className="font-display text-xl font-bold">
                    Generate image
                  </h2>
                  <p className="muted text-xs">
                    Uses the image model configured for this provider.
                  </p>
                </div>
                <button
                  onClick={() => setImageOpen(false)}
                  className="ml-auto rounded-lg p-2 hover:bg-[var(--panel-soft)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image you want to create…"
                className="mt-4 min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm outline-none"
              />
              <button
                disabled={imageLoading || !imagePrompt.trim()}
                onClick={generateImage}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] px-4 py-3 text-sm font-bold text-[var(--panel)] disabled:opacity-40"
              >
                {imageLoading && <Loader2 className="size-4 animate-spin" />}
                Generate image
              </button>
              {imageUrl && (
                <Image
                  unoptimized
                  src={imageUrl}
                  alt={imagePrompt}
                  width={1024}
                  height={1024}
                  className="mt-4 max-h-96 w-full rounded-xl object-contain"
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
