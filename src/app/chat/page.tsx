import type { Metadata } from "next";
import dynamic from "next/dynamic";

const Workspace = dynamic(
  () =>
    import("@/components/chat/workspace").then((module) => module.Workspace),
  {
    loading: () => <WorkspaceLoading />,
  },
);

export const metadata: Metadata = { title: "Workspace" };

function WorkspaceLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-[var(--bg)]">
      <div className="surface flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold shadow-lg">
        <span className="size-2.5 animate-pulse rounded-full bg-[var(--accent)]" />
        Loading workspace…
      </div>
    </div>
  );
}

export default function ChatPage() {
  return <Workspace />;
}
