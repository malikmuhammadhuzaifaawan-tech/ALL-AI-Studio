"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Select from "@radix-ui/react-select";
import {
  Bot,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Palette,
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
import { useChatStore } from "@/store/chat-store";
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

type AgentMode = "designer" | "coder";
type ToolActivity = {
  tool: string;
  detail: string;
  step: number;
  done: boolean;
};

const AGENT_OPTIONS = [
  { value: "designer", label: "Designer", icon: Palette },
  { value: "coder", label: "Coder", icon: Code2 },
] as const;

function ThemedSelect({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  className,
}: {
  label: string;
  value: string;
  options: readonly {
    value: string;
    label: string;
    icon?: typeof Bot;
  }[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className: string;
}) {
  const selected = options.find((option) => option.value === value);
  const SelectedIcon = selected?.icon ?? Bot;

  return (
    <Select.Root
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={label}
        className={`focus-ring flex h-9 min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 text-sm font-semibold text-[var(--text)] shadow-sm outline-none hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <SelectedIcon className="size-4 shrink-0 text-[var(--accent)]" />
        <Select.Value placeholder="Configure a model" className="truncate" />
        <Select.Icon className="ml-auto shrink-0 text-[var(--muted)]">
          <ChevronDown className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-[var(--shadow)]"
        >
          <Select.Viewport className="scrollbar max-h-72 p-1.5">
            {options.map((option) => {
              const OptionIcon = option.icon ?? Bot;
              return (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="focus-ring relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-xs font-semibold outline-none hover:bg-[var(--panel-soft)] focus:bg-[var(--panel-soft)] data-[state=checked]:bg-[var(--accent-soft)]"
                >
                  <OptionIcon className="size-4 shrink-0 text-[var(--accent)]" />
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-2.5 text-[var(--accent)]">
                    <Check className="size-3.5" />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

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
  const [controller, setController] = useState<AbortController | null>(null);
  const [model, setModel] = useState("");
  const [agent, setAgent] = useState<AgentMode>("designer");
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [heroImageReady, setHeroImageReady] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolPermissions, setToolPermissions] = useState<ToolPermissions>(
    DEFAULT_TOOL_PERMISSIONS,
  );
  const resetChat = useChatStore((state) => state.reset);
  const bottom = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
  });
  const normalizedConfig = useMemo(() => normalizeAppConfig(config), [config]);
  const activeProvider = normalizedConfig.active_provider;
  const activeConfig = normalizedConfig.providers[activeProvider];
  const { data: modelCatalog } = useQuery({
    queryKey: ["models", activeProvider],
    queryFn: () => api.models(activeProvider),
    enabled: Boolean(activeConfig?.configured),
  });
  const modelOptions = useMemo(() => {
    const available = modelCatalog?.models ?? [];
    const models = available.length
      ? available
      : activeConfig?.chat_model
        ? [activeConfig.chat_model]
        : [];
    return models.map((item) => ({ value: item, label: item, icon: Bot }));
  }, [activeConfig, modelCatalog]);
  const { data: chats } = useQuery({ queryKey: ["chats"], queryFn: api.chats });
  const { data: activeChat, error: activeChatError } = useQuery({
    queryKey: ["chat", activeId],
    queryFn: () => api.chat(activeId!),
    enabled: Boolean(activeId),
  });
  useEffect(() => {
    // Every visit to the workspace starts like ChatGPT/Gemini: a fresh chat.
    // A previous conversation is only opened after an explicit sidebar click.
    resetChat();
  }, [resetChat]);
  useEffect(() => {
    setToolPermissions(loadToolPermissions());
    const savedAgent = window.localStorage.getItem("ai-studio-agent");
    if (savedAgent === "designer" || savedAgent === "coder")
      setAgent(savedAgent);
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
    const models = modelCatalog?.models ?? [];
    if (models.length && (!model || !models.includes(model)))
      setModel(models[0] ?? "");
    else if (!models.length && activeConfig?.chat_model && !model)
      setModel(activeConfig.chat_model);
  }, [activeConfig, model, modelCatalog]);
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
      setToolActivity([]);
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
            agent,
            allow_browser_actions: toolPermissions.browserActions,
            allow_image_generation: toolPermissions.imageGeneration,
            allow_workspace_tools: toolPermissions.workspaceTools,
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
              tool?: string;
              step?: number;
              arguments?: Record<string, unknown>;
              result?: Record<string, unknown>;
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
            if (item.type === "tool_start" && item.tool) {
              const detail =
                typeof item.arguments?.path === "string"
                  ? item.arguments.path
                  : item.tool.replace("_", " ");
              setToolActivity((current) => [
                ...current,
                {
                  tool: item.tool!,
                  detail,
                  step: item.step ?? current.length + 1,
                  done: false,
                },
              ]);
            }
            if (item.type === "tool_result" && item.tool) {
              setToolActivity((current) =>
                current.map((activity) =>
                  activity.tool === item.tool && !activity.done
                    ? { ...activity, done: true }
                    : activity,
                ),
              );
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
    [activeProvider, agent, model, queryClient, store, toolPermissions],
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
          <div className="flex min-w-0 items-center gap-2">
            <ThemedSelect
              label="AI agent"
              value={agent}
              options={AGENT_OPTIONS}
              onValueChange={(next) => {
                const supported = AGENT_OPTIONS.find(
                  (option) => option.value === next,
                );
                if (!supported) return;
                setAgent(supported.value);
                window.localStorage.setItem("ai-studio-agent", supported.value);
              }}
              className="w-32 sm:w-40"
            />
            <ThemedSelect
              label="AI model"
              value={model}
              options={modelOptions}
              onValueChange={setModel}
              disabled={!modelOptions.length}
              className="w-36 sm:w-56"
            />
          </div>
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
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  toast.success("Workspace link copied");
                } catch {
                  toast.error("Could not copy the workspace link");
                }
              }}
              title="Share"
              className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
            >
              <Share2 className="size-4" />
            </button>
            <div className="relative">
              <button
                title="More options"
                aria-label="More options"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
                className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)]"
              >
                <MoreHorizontal className="size-4" />
              </button>
              {moreOpen && (
                <div className="surface absolute top-11 right-0 z-20 w-48 rounded-xl p-1.5 shadow-xl">
                  <button
                    onClick={() => {
                      exportChat();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--panel-soft)]"
                  >
                    Download conversation
                  </button>
                  <button
                    onClick={() => {
                      store.reset();
                      setMoreOpen(false);
                      toast.success("Started a fresh conversation");
                    }}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--panel-soft)]"
                  >
                    Start fresh conversation
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <section className="scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6">
            {store.messages.length === 0 ? (
              <div className="flex min-h-[70vh] flex-col justify-center py-8">
                <div className="surface relative mb-8 overflow-hidden rounded-[2rem] p-2 shadow-xl sm:p-3">
                  <div className="relative h-56 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#17251e] via-[#2d5141] to-[var(--accent)] sm:h-72">
                    {heroImageReady && (
                      <Image
                        src="/fiverr.jpeg"
                        alt="Your AI Studio workspace"
                        fill
                        priority
                        unoptimized
                        className="object-cover object-[center_28%] transition duration-700 hover:scale-105"
                        onError={() => setHeroImageReady(false)}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <div className="absolute right-5 bottom-5 left-5 flex items-end justify-between gap-3 text-white sm:right-7 sm:bottom-7 sm:left-7">
                      <div>
                        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[.2em] text-white/70 uppercase">
                          <Sparkles className="size-3" /> AI Studio
                        </p>
                        <h2 className="font-display text-2xl font-bold sm:text-3xl">
                          Build something brilliant.
                        </h2>
                      </div>
                      <span className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold backdrop-blur sm:block">
                        Your creative workspace
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-[var(--accent)]/25 shadow-lg">
                  <Sparkles className="size-5" />
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  What are we working on?
                </h1>
                <p className="muted mt-3 max-w-xl leading-7">
                  {agent === "coder"
                    ? "Inspect, debug, and implement within this project using your preferred model. Workspace access requires explicit permission."
                    : "Ask a question, attach a file, review an idea, or design something ambitious with your preferred model."}
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
        {store.generating && toolActivity.length > 0 && (
          <div
            className="mx-auto mb-2 w-full max-w-3xl px-4 sm:px-6"
            aria-live="polite"
          >
            <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-2">
              {toolActivity.map((activity) => (
                <span
                  key={`${activity.step}-${activity.tool}`}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--panel)] px-2 py-1 text-[10px] font-semibold"
                >
                  {activity.done ? (
                    <Check className="size-3 text-emerald-600" />
                  ) : (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  {activity.tool.replace("_", " ")} · {activity.detail}
                </span>
              ))}
            </div>
          </div>
        )}
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
