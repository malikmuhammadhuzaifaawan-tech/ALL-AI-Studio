import Link from "next/link";
import { ArrowRight, Braces, LockKeyhole, Sparkles, Zap } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Provider neutral",
    text: "Connect OpenAI, OpenRouter, Groq, Ollama, LM Studio, or any compatible endpoint.",
  },
  {
    icon: LockKeyhole,
    title: "Secrets stay server-side",
    text: "API keys are encrypted by the backend and never persisted in browser code.",
  },
  {
    icon: Braces,
    title: "Built for real work",
    text: "Streaming markdown, code, tables, math, images, files, history, and export.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <section className="mesh relative min-h-[78vh] overflow-hidden text-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <Link
            href="/"
            className="font-display flex items-center gap-3 text-lg font-bold"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#e75c3e]">
              A
            </span>
            AI Studio
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="#features"
              className="hidden px-3 py-2 text-sm text-white/70 sm:block"
            >
              Features
            </a>
            <Link
              href="/chat"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#182019]"
            >
              Open workspace
            </Link>
          </div>
        </nav>
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pt-20 pb-20 lg:grid-cols-[1.05fr_.95fr] lg:pt-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/75">
              <Sparkles className="size-3.5 text-[#ff876e]" />
              One workspace. Any model.
            </div>
            <h1 className="font-display max-w-3xl text-5xl leading-[1.04] font-bold tracking-[-.045em] sm:text-7xl">
              Think clearly.
              <br />
              <span className="text-[#ff8064]">Create brilliantly.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/65">
              A fast, private AI workspace that gives you complete control over
              your provider, models, conversations, and creative process.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/chat"
                className="group flex items-center gap-2 rounded-xl bg-[#e75c3e] px-5 py-3.5 font-semibold"
              >
                Get started{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#features"
                className="rounded-xl border border-white/15 px-5 py-3.5 font-semibold text-white/80"
              >
                Explore features
              </a>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="absolute -inset-6 rounded-[36px] border border-white/10" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-[#121612] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
                <i className="size-2.5 rounded-full bg-[#e75c3e]" />
                <i className="size-2.5 rounded-full bg-[#e7b73e]" />
                <i className="size-2.5 rounded-full bg-[#56b987]" />
                <span className="ml-auto text-xs text-white/35">
                  AI Studio - private session
                </span>
              </div>
              <div className="grid min-h-[380px] grid-cols-[150px_1fr]">
                <div className="border-r border-white/10 p-4">
                  <div className="mb-5 h-9 rounded-lg bg-white/8" />
                  {[68, 82, 55, 74].map((w) => (
                    <div
                      key={w}
                      className="mb-3 h-2 rounded bg-white/8"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
                <div className="flex flex-col justify-between p-7">
                  <div>
                    <p className="text-xs text-white/35">ASSISTANT</p>
                    <h3 className="font-display mt-3 text-2xl font-bold">
                      How can I help you create today?
                    </h3>
                    <p className="mt-4 max-w-sm text-sm leading-6 text-white/50">
                      Connect your preferred model and turn ideas into polished,
                      production-ready work.
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/35">
                    Ask anything...{" "}
                    <span className="float-right grid size-7 place-items-center rounded-lg bg-[#e75c3e] text-white">
                      Go
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <span className="text-xs font-bold tracking-[.18em] text-[var(--accent)] uppercase">
            Designed for control
          </span>
          <h2 className="font-display mt-3 text-4xl font-bold tracking-tight">
            Your AI stack, without the lock-in.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="surface rounded-2xl p-7">
              <div className="mb-10 grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="size-5" />
              </div>
              <h3 className="font-display text-xl font-bold">{title}</h3>
              <p className="muted mt-3 leading-7">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <footer className="border-t border-[var(--border)] px-6 py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-sm">
          <b className="font-display">AI Studio</b>
          <span className="muted">Private by design. Provider neutral.</span>
        </div>
      </footer>
    </main>
  );
}
