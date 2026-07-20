"use client";

import { Check, Copy } from "lucide-react";
import { useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function Code({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const block = Boolean(className?.includes("language-"));
  if (!block) return <code className={className}>{children}</code>;
  return (
    <div className="group relative">
      <button
        aria-label="Copy code"
        className="absolute top-2 right-2 z-10 rounded-md bg-white/10 p-2 text-white/60 opacity-0 transition group-hover:opacity-100"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <code className={className}>{children}</code>
    </div>
  );
}

function Link({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const generatedImage = href?.startsWith("/generated/");
  return (
    <a href={href} download={generatedImage || undefined} {...props}>
      {children}
    </a>
  );
}

export function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className={`prose-ai ${streaming ? "streaming-caret" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeSanitize, rehypeKatex, rehypeHighlight]}
        components={{ code: Code, a: Link }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
