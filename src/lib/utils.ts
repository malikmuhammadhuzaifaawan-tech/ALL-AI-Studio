type ClassValue = string | false | null | undefined | Record<string, boolean>;

export function cn(...inputs: ClassValue[]) {
  return inputs
    .flatMap((input) => {
      if (!input) return [];
      if (typeof input === "string") return [input];
      return Object.entries(input)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);
    })
    .join(" ");
}

export function titleFromPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 52
    ? `${normalized.slice(0, 51)}…`
    : normalized || "New conversation";
}
