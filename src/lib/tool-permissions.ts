export interface ToolPermissions {
  browserActions: boolean;
  fileAttachments: boolean;
  imageGeneration: boolean;
  microphone: boolean;
  workspaceTools: boolean;
}

export const DEFAULT_TOOL_PERMISSIONS: ToolPermissions = {
  browserActions: true,
  fileAttachments: true,
  imageGeneration: true,
  microphone: true,
  workspaceTools: false,
};

const STORAGE_KEY = "ai-studio-tool-permissions";
export const TOOL_PERMISSIONS_EVENT = "ai-studio-tool-permissions-changed";

export function loadToolPermissions(): ToolPermissions {
  if (typeof window === "undefined") return DEFAULT_TOOL_PERMISSIONS;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<ToolPermissions>;
    return { ...DEFAULT_TOOL_PERMISSIONS, ...stored };
  } catch {
    return DEFAULT_TOOL_PERMISSIONS;
  }
}

export function saveToolPermissions(permissions: ToolPermissions) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(permissions));
  window.dispatchEvent(
    new CustomEvent<ToolPermissions>(TOOL_PERMISSIONS_EVENT, {
      detail: permissions,
    }),
  );
}
