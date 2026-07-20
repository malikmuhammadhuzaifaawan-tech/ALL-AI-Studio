"use client";

import { ArrowUp, FileText, Mic, Paperclip, Square, X } from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { MAX_FILE_SIZE } from "@/config/constants";
import { useChatStore } from "@/store/chat-store";
import type { Attachment } from "@/types";

interface SpeechRecognitionResultEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

async function toAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_SIZE)
    throw new Error(`${file.name} is larger than 8 MB`);
  const attachment: Attachment = {
    name: file.name,
    type: file.type || "text/plain",
    size: file.size,
  };
  if (file.type.startsWith("image/"))
    attachment.dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  else
    attachment.dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  return attachment;
}

export function Composer({
  onSend,
  onStop,
  allowFileAttachments = true,
  allowMicrophone = false,
}: {
  onSend: (text: string) => Promise<void>;
  onStop: () => void;
  allowFileAttachments?: boolean;
  allowMicrophone?: boolean;
}) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const { generating, attachments, setAttachments } = useChatStore();
  useEffect(() => {
    if (!allowFileAttachments && attachments.length) setAttachments([]);
  }, [allowFileAttachments, attachments.length, setAttachments]);
  useEffect(
    () => () => {
      recognition.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!allowMicrophone && recognition.current) {
      recognition.current.abort();
      recognition.current = null;
      setListening(false);
    }
  }, [allowMicrophone]);
  async function addFiles(files: FileList | File[]) {
    if (!allowFileAttachments) {
      toast.error("File attachments are disabled in Settings");
      return;
    }
    try {
      const next = await Promise.all(
        Array.from(files)
          .slice(0, 8 - attachments.length)
          .map(toAttachment),
      );
      setAttachments([...attachments, ...next]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read file",
      );
    }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if ((!text && attachments.length === 0) || generating) return;
    setValue("");
    if (input.current) input.current.style.height = "auto";
    await onSend(text);
  }
  function resize() {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData.files;
    if (files.length) {
      event.preventDefault();
      void addFiles(files);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer.files.length)
      void addFiles(event.dataTransfer.files);
  }
  function toggleDictation() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!allowMicrophone) {
      toast.error("Voice dictation is disabled in Settings");
      return;
    }
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      toast.error(
        "Voice dictation is not supported by this browser. Use the latest Chrome or Edge.",
      );
      return;
    }
    const instance = new Recognition();
    const initialValue = value.trim();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";
    instance.onstart = () => setListening(true);
    instance.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.[0]) transcript += result[0].transcript;
      }
      setValue([initialValue, transcript.trim()].filter(Boolean).join(" "));
      requestAnimationFrame(resize);
    };
    instance.onerror = (event) => {
      if (!["aborted", "no-speech"].includes(event.error)) {
        const message =
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone permission was denied. Allow it in the browser site settings."
            : `Voice dictation failed: ${event.error}`;
        toast.error(message);
      }
    };
    instance.onend = () => {
      setListening(false);
      recognition.current = null;
      input.current?.focus();
    };
    recognition.current = instance;
    try {
      instance.start();
    } catch {
      recognition.current = null;
      toast.error("Voice dictation could not be started");
    }
  }
  return (
    <div className="px-3 pb-3 sm:px-6 sm:pb-5">
      <div
        className="mx-auto max-w-3xl"
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop}
      >
        {attachments.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {attachments.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="surface relative flex w-44 shrink-0 items-center gap-2 rounded-xl p-2"
              >
                {file.type.startsWith("image/") && file.dataUrl ? (
                  <Image
                    unoptimized
                    src={file.dataUrl}
                    alt="Attachment preview"
                    width={40}
                    height={40}
                    className="size-10 rounded-lg object-cover"
                  />
                ) : (
                  <span className="grid size-10 place-items-center rounded-lg bg-[var(--panel-soft)]">
                    <FileText className="size-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{file.name}</p>
                  <p className="muted text-[10px]">
                    {Math.ceil(file.size / 1024)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments(attachments.filter((_, i) => i !== index))
                  }
                  className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-[var(--text)] text-[var(--panel)]"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={submit}
          className="surface rounded-2xl p-2 shadow-[var(--shadow)]"
        >
          <textarea
            ref={input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              resize();
            }}
            onPaste={paste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            maxLength={100000}
            placeholder="Message AI Studio"
            className="max-h-[180px] min-h-12 w-full resize-none bg-transparent px-3 py-3 outline-none"
          />
          <div className="flex items-center gap-1 px-1">
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept="*/*"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              disabled={!allowFileAttachments}
              title={
                allowFileAttachments
                  ? "Attach files"
                  : "File attachments are disabled in Settings"
              }
              onClick={() => fileInput.current?.click()}
              className="muted rounded-lg p-2 hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              disabled={!allowMicrophone}
              title={
                listening
                  ? "Stop voice dictation"
                  : allowMicrophone
                    ? "Start voice dictation"
                    : "Microphone is disabled in Settings"
              }
              onClick={toggleDictation}
              className={`rounded-lg p-2 hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:opacity-35 ${listening ? "bg-red-500/10 text-red-600" : "muted"}`}
            >
              <Mic className={`size-4 ${listening ? "animate-pulse" : ""}`} />
            </button>
            <span className="muted ml-1 hidden text-[10px] sm:inline">
              {value.length.toLocaleString()} / 100,000
            </span>
            <span className="flex-1" />
            {generating ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop generation"
                className="grid size-9 place-items-center rounded-xl bg-[var(--text)] text-[var(--panel)]"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                disabled={!value.trim() && !attachments.length}
                type="submit"
                title="Send message"
                className="grid size-9 place-items-center rounded-xl bg-[var(--text)] text-[var(--panel)] disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </form>
        <p className="muted mt-2 text-center text-[10px]">
          AI can make mistakes. Review important information and generated code.
        </p>
      </div>
    </div>
  );
}
