"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  FolderOpen,
  Globe2,
  HardDrive,
  ImageIcon,
  KeyRound,
  Loader2,
  Moon,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { normalizeAppConfig } from "@/lib/provider-config";
import {
  PROVIDERS,
  providerDetails,
  type ProviderId,
} from "@/config/providers";
import {
  DEFAULT_TOOL_PERMISSIONS,
  loadToolPermissions,
  saveToolPermissions,
  type ToolPermissions,
} from "@/lib/tool-permissions";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { data: config, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
    enabled: open,
  });
  const { data: storage, refetch: refetchStorage } = useQuery({
    queryKey: ["storage"],
    queryFn: api.storage,
    enabled: open,
  });
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [key, setKey] = useState("");
  const [base, setBase] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [toolPermissions, setToolPermissions] = useState<ToolPermissions>(
    DEFAULT_TOOL_PERMISSIONS,
  );
  const normalizedConfig = useMemo(() => normalizeAppConfig(config), [config]);

  useEffect(() => {
    const current = normalizedConfig.providers[provider];
    if (!current) return;
    setBase(current.base_url);
    setModel(current.chat_model);
    setImageModel(current.image_model);
  }, [provider, normalizedConfig]);
  useEffect(() => {
    if (open) setToolPermissions(loadToolPermissions());
  }, [open]);

  function setToolPermission(
    permission: keyof ToolPermissions,
    enabled: boolean,
  ) {
    const next = { ...toolPermissions, [permission]: enabled };
    setToolPermissions(next);
    saveToolPermissions(next);
  }

  async function activate() {
    if (!key || !base || !model)
      return toast.error("API key, base URL and chat model are required");
    setSaving(true);
    try {
      const result = await api.activate({
        provider,
        api_key: key,
        base_url: base,
        chat_model: model,
        image_model: imageModel || undefined,
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      setKey("");
      toast.success(`Provider activated - ${result.models_found} models found`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Activation failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(category: string, name: string) {
    if (!confirm("Delete this stored file permanently?")) return;
    setStorageBusy(true);
    try {
      await api.deleteStoredFile(category, name);
      await refetchStorage();
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
      toast.success("File deleted permanently");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setStorageBusy(false);
    }
  }

  async function cleanup() {
    setStorageBusy(true);
    try {
      const result = await api.cleanupStorage();
      await refetchStorage();
      toast.success(
        `Storage optimized - ${result.removed} orphan files removed`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cleanup failed");
    } finally {
      setStorageBusy(false);
    }
  }

  async function removeAllFiles() {
    if (
      !confirm(
        "Permanently delete every attachment and generated image? Chat text will remain. This cannot be undone.",
      )
    )
      return;
    setStorageBusy(true);
    try {
      const result = await api.deleteAllStoredFiles();
      await refetchStorage();
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
      toast.success(`${result.removed} stored files deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cleanup failed");
    } finally {
      setStorageBusy(false);
    }
  }

  const active = normalizedConfig.providers[provider];
  const selectedProvider = providerDetails(provider);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="surface fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(620px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 shadow-2xl">
          <div className="flex items-start">
            <div>
              <p className="text-xs font-bold tracking-[.16em] text-[var(--accent)] uppercase">
                Workspace
              </p>
              <Dialog.Title className="font-display mt-1 text-2xl font-bold">
                Settings
              </Dialog.Title>
              <Dialog.Description className="muted mt-1 text-sm">
                Provider, appearance, and local storage.
              </Dialog.Description>
            </div>
            <Dialog.Close className="ml-auto rounded-lg p-2 hover:bg-[var(--panel-soft)]">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="mt-6 rounded-xl bg-[var(--panel-soft)] p-3">
            <label className="text-xs font-bold">
              AI provider
              <select
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as ProviderId)
                }
                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-sm outline-none"
              >
                {PROVIDERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted mt-2 text-[11px]">
              Native Claude support plus provider APIs that implement the OpenAI
              chat protocol. OpenAI and your existing compatible setup remain
              unchanged.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-xs font-bold">
              API key
              <div className="mt-1.5 flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3">
                <KeyRound className="muted size-4" />
                <input
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  type="password"
                  autoComplete="off"
                  placeholder={
                    active?.configured
                      ? "Enter only to replace saved key"
                      : "sk-..."
                  }
                  className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                />
              </div>
            </label>
            <label className="block text-xs font-bold">
              Base URL
              <div className="mt-1.5 flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3">
                <Server className="muted size-4" />
                <input
                  value={base}
                  onChange={(event) => setBase(event.target.value)}
                  className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                />
              </div>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">
                Chat model
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm outline-none"
                />
              </label>
              {selectedProvider.supportsImages ? (
                <label className="text-xs font-bold">
                  Image model
                  <input
                    value={imageModel}
                    onChange={(event) => setImageModel(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm outline-none"
                  />
                </label>
              ) : (
                <div className="muted rounded-xl border border-[var(--border)] px-3 py-3 text-xs">
                  Chat and file analysis enabled. This provider has no
                  image-generation endpoint in this integration.
                </div>
              )}
            </div>
            {active?.configured && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" /> Configured
                {active.active && " and active"} - key hidden
              </div>
            )}
            <button
              disabled={saving}
              onClick={activate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text)] px-4 py-3 text-sm font-bold text-[var(--panel)] disabled:opacity-50"
            >
              {saving && <Loader2 className="size-4 animate-spin" />} Test &
              activate provider
            </button>
          </div>

          <section className="mt-7 border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <h3 className="text-sm font-bold">Tool permissions</h3>
            </div>
            <p className="muted mt-2 text-[11px]">
              AI Studio cannot silently browse your computer. It can only open a
              requested public link, read files you explicitly select, or ask
              the browser for microphone permission.
            </p>
            <div className="mt-3 space-y-2">
              {[
                {
                  key: "browserActions" as const,
                  label: "Open requested web pages",
                  detail:
                    "Allows explicit commands such as ‘open WhatsApp’. Page content is not read.",
                  icon: Globe2,
                },
                {
                  key: "imageGeneration" as const,
                  label: "Generate and save images",
                  detail:
                    "Routes explicit image requests to your configured image provider and saves results in AI Studio storage.",
                  icon: ImageIcon,
                },
                {
                  key: "fileAttachments" as const,
                  label: "Attach local files",
                  detail:
                    "Only files you choose or drop are uploaded to this local app.",
                  icon: FolderOpen,
                },
                {
                  key: "microphone" as const,
                  label: "Voice dictation (microphone)",
                  detail:
                    "Converts your speech into composer text in supported browsers. The browser asks for permission; HTTPS or localhost is required.",
                  icon: Server,
                },
              ].map(({ key: permission, label, detail, icon: Icon }) => (
                <label
                  key={permission}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3"
                >
                  <Icon className="muted mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs">{label}</b>
                    <span className="muted mt-0.5 block text-[10px]">
                      {detail}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={toolPermissions[permission]}
                    onChange={(event) =>
                      setToolPermission(permission, event.target.checked)
                    }
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="mt-7 border-t border-[var(--border)] pt-5">
            <p className="mb-3 text-xs font-bold">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "light", icon: Sun },
                { id: "dark", icon: Moon },
                { id: "system", icon: Server },
              ].map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold capitalize ${theme === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"}`}
                >
                  <Icon className="size-4" /> {id}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7 border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4" />
              <h3 className="text-sm font-bold">Storage Manager</h3>
              <button
                onClick={() => refetchStorage()}
                title="Refresh storage"
                className="muted ml-auto rounded-lg p-2 hover:bg-[var(--panel-soft)]"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Total",
                  value: storage?.total_size ?? 0,
                  icon: HardDrive,
                },
                {
                  label: "Database",
                  value: storage?.database_size ?? 0,
                  icon: Database,
                },
                {
                  label: "Attachments",
                  value: storage?.attachments_size ?? 0,
                  icon: HardDrive,
                },
                {
                  label: "Images",
                  value: storage?.generated_size ?? 0,
                  icon: HardDrive,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="rounded-lg bg-[var(--panel-soft)] p-3"
                >
                  <Icon className="muted size-4" />
                  <p className="mt-2 text-[10px] font-bold uppercase">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatBytes(value)}
                  </p>
                </div>
              ))}
            </div>
            {storage?.warning ? (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                Storage usage has crossed the{" "}
                {formatBytes(storage.warning_threshold)} warning threshold.
                Files will continue to save, but cleanup or backup is
                recommended.
              </div>
            ) : (
              <p className="muted mt-3 text-[11px]">
                Warning appears at{" "}
                {formatBytes(storage?.warning_threshold ?? 5 * 1024 ** 3)}.
                There is no application hard limit.
              </p>
            )}
            <div className="scrollbar mt-4 max-h-52 overflow-y-auto border-y border-[var(--border)]">
              {!storage?.files.length ? (
                <p className="muted py-6 text-center text-xs">
                  No stored files
                </p>
              ) : (
                storage.files.map((file) => (
                  <div
                    key={`${file.category}-${file.name}`}
                    className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={file.url}
                        download
                        className="block truncate text-xs font-semibold hover:underline"
                      >
                        {file.name}
                      </a>
                      <span className="muted text-[10px] capitalize">
                        {file.category} - {formatBytes(file.size)}
                      </span>
                    </div>
                    <button
                      disabled={storageBusy}
                      onClick={() => removeFile(file.category, file.name)}
                      title="Delete permanently"
                      className="rounded-lg p-2 text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={storageBusy}
                onClick={cleanup}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-40"
              >
                {storageBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Clean & optimize
              </button>
              <button
                disabled={storageBusy || !storage?.files.length}
                onClick={removeAllFiles}
                className="ml-auto flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-40"
              >
                <Trash2 className="size-3.5" /> Delete all files
              </button>
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
