import { API_URL } from "@/config/constants";
import { normalizeAppConfig } from "@/lib/provider-config";
import type { Conversation, StorageSummary } from "@/types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new Error(
      "Cannot reach the application backend. Restart the app with `npm run dev`.",
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    if (!body.detail && response.status >= 500) {
      throw new Error(
        "The application backend is unavailable. Restart the app with `npm run dev`.",
      );
    }
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export const api = {
  config: async () => normalizeAppConfig(await request<unknown>("/api/config")),
  chats: () => request<Conversation[]>("/api/conversations"),
  chat: (id: string) => request<Conversation>(`/api/conversations/${id}`),
  deleteChat: (id: string) =>
    request<void>(`/api/conversations/${id}`, { method: "DELETE" }),
  updateChat: (id: string, body: { title?: string; pinned?: boolean }) =>
    request<Conversation>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  activate: (body: {
    provider: string;
    api_key: string;
    base_url: string;
    chat_model: string;
    image_model?: string;
  }) =>
    request<{ ok: boolean; models_found: number }>("/api/providers/activate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  models: (provider: string) =>
    request<{ models: string[] }>(
      `/api/models?provider=${encodeURIComponent(provider)}`,
    ),
  generateImage: (body: {
    prompt: string;
    provider: string;
    model?: string;
    size?: string;
    quality?: string;
  }) =>
    request<{ url: string; revised_prompt?: string | null }>("/api/images", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  storage: () => request<StorageSummary>("/api/storage"),
  deleteStoredFile: (category: string, name: string) =>
    request<{ deleted: boolean }>(
      `/api/storage/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  cleanupStorage: () =>
    request<{ removed: number }>("/api/storage/cleanup", { method: "POST" }),
  deleteAllStoredFiles: () =>
    request<{ removed: number }>("/api/storage", { method: "DELETE" }),
};
