import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Bot, CalendarDays, Loader2, MessageCircle, Mic, MicOff, Phone,
  Send, Sparkles, Volume2, VolumeX, X,
} from "lucide-react";
import { BRAND, STORE } from "@contracts/constants";
import { trpc } from "@/providers/trpc";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type SpeechResult = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, ""));
  utterance.lang = "en-US";
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}

const GREETING =
  `Hi — I'm the ${STORE.name} assistant. I can help with repair prices, services, hours, ` +
  `or available appointment times. What can I help you with?`;

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", content: GREETING },
  ]);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageSeq = useRef(0);

  const speechSupported = useMemo(() => Boolean(getSpeechRecognition()), []);
  const status = trpc.shop.assistantStatus.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const assistant = trpc.shop.assistant.useMutation();
  const configured = status.data?.configured === true;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, open]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  const close = () => {
    stopListening();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setOpen(false);
  };

  const send = async (raw: string) => {
    const text = raw.trim().slice(0, 1200);
    if (!text || assistant.isPending) return;

    messageSeq.current += 1;
    const userMessage: ChatMessage = {
      id: `user-${messageSeq.current}`,
      role: "user",
      content: text,
    };
    const nextMessages = [...messages, userMessage].slice(-12);

    setMessages(nextMessages);
    setInput("");
    setError("");

    try {
      const response = await assistant.mutateAsync({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
      });
      messageSeq.current += 1;
      const reply: ChatMessage = {
        id: `assistant-${messageSeq.current}`,
        role: "assistant",
        content: response.reply,
      };
      setMessages((current) => [...current, reply]);
      if (mode === "voice" && speakReplies) speak(response.reply);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "I couldn't reach the assistant. Please call or WhatsApp us.";
      setError(message);
      messageSeq.current += 1;
      setMessages((current) => [
        ...current,
        {
          id: `error-${messageSeq.current}`,
          role: "assistant",
          content: `I'm sorry — ${message}`,
        },
      ]);
    }
  };

  const startListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    const Constructor = getSpeechRecognition();
    if (!Constructor) {
      setError("Voice input isn't available in this browser. You can type instead.");
      setMode("chat");
      return;
    }

    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) void send(transcript.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied. You can type or call us instead."
          : "Voice input failed. Please try again, or type instead.",
      );
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  };

  const selectMode = (nextMode: "chat" | "voice") => {
    if (nextMode === "chat") stopListening();
    setMode(nextMode);
  };

  const quickPrompts = ["Repair prices", "Book a repair", "Hours & location", "Talk to a person"];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        title="Ask the AI assistant"
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-ivory shadow-lg shadow-ink/25 transition-all duration-300 hover:-translate-y-1 hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy focus-visible:ring-offset-2"
      >
        <Sparkles size={22} />
        <span className="absolute -right-0.5 -top-0.5 rounded-full bg-burgundy px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ivory">AI</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close assistant"
            onClick={close}
            className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
            className="fixed bottom-24 right-4 z-[70] flex max-h-[min(680px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-ink/10 bg-ivory shadow-2xl shadow-ink/30 sm:right-6"
          >
            <header className="flex items-start justify-between gap-4 border-b border-blush bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blush text-burgundy">
                  <Bot size={20} />
                </span>
                <div>
                  <h2 id="assistant-title" className="font-serif text-xl leading-none text-ink">Philly Assistant</h2>
                  <p className="mt-1 text-[11px] text-ink/45">
                    {status.isLoading
                      ? "Checking availability…"
                      : configured
                        ? "AI assistant · prices and times checked live"
                        : "AI setup pending — call or WhatsApp us"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close assistant"
                className="rounded-full p-2 text-ink/40 transition-colors hover:bg-blush hover:text-burgundy"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex items-center gap-2 border-b border-blush/70 bg-blush-light/40 px-4 py-2">
              <div role="tablist" aria-label="Assistant mode" className="flex rounded-full bg-white p-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "chat"}
                  onClick={() => selectMode("chat")}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${mode === "chat" ? "bg-ink text-ivory" : "text-ink/50 hover:text-burgundy"}`}
                >
                  Chat
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "voice"}
                  onClick={() => selectMode("voice")}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${mode === "voice" ? "bg-ink text-ivory" : "text-ink/50 hover:text-burgundy"}`}
                >
                  Voice
                </button>
              </div>
              {mode === "voice" && (
                <button
                  type="button"
                  onClick={() => {
                    setSpeakReplies((current) => !current);
                    if (typeof window !== "undefined" && "speechSynthesis" in window) {
                      window.speechSynthesis.cancel();
                    }
                  }}
                  aria-label={speakReplies ? "Mute spoken replies" : "Unmute spoken replies"}
                  className="ml-auto rounded-full p-2 text-ink/45 hover:bg-white hover:text-burgundy"
                >
                  {speakReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              )}
            </div>

            <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "ml-auto bg-burgundy text-ivory"
                      : "border border-blush bg-white text-ink/75"
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {assistant.isPending && (
                <div className="flex items-center gap-2 text-[12px] text-ink/40">
                  <Loader2 size={14} className="animate-spin" /> Checking that for you…
                </div>
              )}

              {messages.length <= 1 && configured && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="rounded-full border border-burgundy/20 bg-white px-3 py-1.5 text-[11px] font-medium text-burgundy transition-colors hover:bg-blush"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                  {error}
                </p>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-blush bg-white px-4 py-3">
              {!configured && !status.isLoading ? (
                <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                  The AI assistant isn’t connected yet. Call, WhatsApp or book online and we’ll help right away.
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                {mode === "voice" && (
                  <button
                    type="button"
                    onClick={startListening}
                    disabled={!configured || assistant.isPending || !speechSupported}
                    aria-label={listening ? "Stop listening" : "Speak to the assistant"}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      listening ? "bg-burgundy text-ivory" : "bg-blush text-burgundy hover:bg-burgundy hover:text-ivory"
                    }`}
                  >
                    {listening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(input);
                    }
                  }}
                  maxLength={1200}
                  disabled={!configured || assistant.isPending}
                  aria-label="Message the assistant"
                  placeholder={mode === "voice" ? "Tap the mic, or type here…" : "Ask about a repair or price…"}
                  className="min-w-0 flex-1 rounded-full border border-ink/15 bg-ivory px-4 py-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-burgundy disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={!configured || assistant.isPending || !input.trim()}
                  aria-label="Send message"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-burgundy text-ivory transition-colors hover:bg-burgundy-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>

              {mode === "voice" && !speechSupported && (
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink/40">
                  Voice input isn’t supported in this browser. Typing still works.
                </p>
              )}
              {listening && (
                <p className="mt-2 text-[10.5px] font-medium text-burgundy">Listening… speak now.</p>
              )}

              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <a
                  href={STORE.phoneHref}
                  className="flex items-center justify-center gap-1 rounded-xl bg-blush-light px-2 py-2 text-[10.5px] font-semibold text-burgundy transition-colors hover:bg-blush"
                >
                  <Phone size={12} /> Call
                </a>
                <a
                  href={`https://wa.me/${BRAND.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1 rounded-xl bg-blush-light px-2 py-2 text-[10.5px] font-semibold text-burgundy transition-colors hover:bg-blush"
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
                <Link
                  to="/book"
                  onClick={close}
                  className="flex items-center justify-center gap-1 rounded-xl bg-burgundy px-2 py-2 text-[10.5px] font-semibold text-ivory transition-colors hover:bg-burgundy-dark"
                >
                  <CalendarDays size={12} /> Book
                </Link>
              </div>
              <p className="mt-2 text-center text-[9.5px] leading-relaxed text-ink/35">
                AI can make mistakes. Prices and appointment times are checked against the live site.
                Replies are generated by DeepSeek; never share card numbers.
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
