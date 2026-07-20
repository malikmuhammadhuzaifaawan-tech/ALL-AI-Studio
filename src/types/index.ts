export type Role = "user" | "assistant";
export interface StoredAttachment {
  name: string;
  type: string;
  size: number;
  data_url?: string | null;
  url?: string | null;
  stored_name?: string | null;
  text?: string | null;
}
export interface StorageFile {
  category: "attachments" | "generated";
  name: string;
  size: number;
  url: string;
  updated_at: number;
}
export interface StorageSummary {
  database_size: number;
  attachments_size: number;
  generated_size: number;
  total_size: number;
  warning_threshold: number;
  warning: boolean;
  files: StorageFile[];
}
export interface Message {
  role: Role;
  content: string;
  created_at?: string;
  attachments?: StoredAttachment[];
}
export interface Conversation {
  id: string;
  title: string;
  pinned: number;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}
export interface ProviderConfig {
  configured: boolean;
  active: boolean;
  source: string;
  base_url: string;
  chat_model: string;
  image_model: string;
}
export interface AppConfig {
  providers: Record<string, ProviderConfig>;
  active_provider: string;
}
export interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  text?: string;
}
