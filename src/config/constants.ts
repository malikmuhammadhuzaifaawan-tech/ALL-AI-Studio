// Browser requests stay on the Next.js origin and are proxied to FastAPI.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const MAX_FILE_SIZE = 8 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const ACCEPTED_FILE_EXTENSIONS = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".py",
  ".log",
  ".pdf",
  ".docx",
];
