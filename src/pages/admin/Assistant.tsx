import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Bot, Loader2, Package, Send, Sparkles, TrendingUp,
} from "lucide-react";
import Seo from "@/components/Seo";
import { trpc } from "@/providers/trpc";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const GREETING =
  "Ask me about stock, low-stock parts, inventory value, online sales or recent orders. " +
  "I read the live Firestore data and I’m read-only — I can’t change anything.";

const SUGGESTIONS = [
  { icon: AlertTriangle, label: "What parts are low in stock?" },
  { icon: Package, label: "What is my total inventory value?" },
  { icon: TrendingUp, label: "How much did I sell in the last 30 days?" },
  { icon: Sparkles, label: "Which products sold best this month?" },
  { icon: Package, label: "Which products are out of stock?" },
  { icon: TrendingUp, label: "Show me my 10 most recent orders." },
];

export default function AdminAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "greeting", role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const status = trpc.admin.assistantStatus.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });
  const assistant = trpc.admin.assistant.useMutation();
  const configured = status.data?.configured === true;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, assistant.isPending]);

  const send = async (raw: string) => {
    const text = raw.trim().slice(0, 1200);
    if (!text || assistant.isPending) return;

    seq.current += 1;
    const userMessage: Message = { id: `user-${seq.current}`, role: "user", content: text };
    const next = [...messages, userMessage].slice(-12);

    setMessages(next);
    setInput("");
    setError("");

    try {
      const result = await assistant.mutateAsync({
        messages: next.map(({ role, content }) => ({ role, content })),
      });
      seq.current += 1;
      setMessages((current) => [
        ...current,
        { id: `assistant-${seq.current}`, role: "assistant", content: result.reply },
      ]);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "The AI analyst couldn’t answer just now.";
      setError(message);
      seq.current += 1;
      setMessages((current) => [
        ...current,
        { id: `error-${seq.current}`, role: "assistant", content: `I’m sorry — ${message}` },
      ]);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Seo title="AI Analyst" noindex />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-burgundy">
            <Sparkles size={13} /> Operations analyst
          </p>
          <h1 className="font-serif text-3xl text-ink">Ask the shop</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/50">
            Live answers about inventory, stock, online sales and recent orders. Read-only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessages([{ id: "greeting", role: "assistant", content: GREETING }]);
            setError("");
          }}
          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-medium text-ink/55 transition-colors hover:border-burgundy/30 hover:text-burgundy"
        >
          New conversation
        </button>
      </div>

      {!status.isLoading && !configured && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
          The AI analyst isn’t connected. Add <code className="font-mono">DEEPSEEK_API_KEY</code> in
          the Vercel project and redeploy. Inventory, orders and reports pages still work normally.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="hidden space-y-2 lg:block">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-ink/35">Try asking</p>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              disabled={!configured || assistant.isPending}
              onClick={() => void send(suggestion.label)}
              className="flex w-full items-start gap-2.5 rounded-xl border border-blush bg-white px-3.5 py-3 text-left text-[12px] leading-snug text-ink/65 transition-colors hover:border-burgundy/30 hover:text-burgundy disabled:cursor-not-allowed disabled:opacity-50"
            >
              <suggestion.icon size={15} className="mt-0.5 shrink-0 text-burgundy/70" />
              {suggestion.label}
            </button>
          ))}
          <p className="pt-2 text-[10.5px] leading-relaxed text-ink/35">
            Sales combine paid online orders with repair receipts recorded in the admin system.
            Unpaid and refunded orders are reported separately.
          </p>
        </aside>

        <section className="flex min-h-[540px] flex-col overflow-hidden rounded-2xl border border-blush bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-blush px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-blush text-burgundy">
              <Bot size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Shop analyst</p>
              <p className="text-[10.5px] text-ink/40">
                {status.isLoading
                  ? "Connecting…"
                  : configured
                    ? "DeepSeek · live Firestore data"
                    : "Not configured"}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto bg-ink text-ivory"
                    : "border border-blush bg-blush-light/40 text-ink/75"
                }`}
              >
                {message.content}
              </div>
            ))}
            {assistant.isPending && (
              <div className="flex items-center gap-2 text-[12px] text-ink/40">
                <Loader2 size={14} className="animate-spin" /> Reading the latest numbers…
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-blush px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={1200}
                disabled={!configured || assistant.isPending}
                aria-label="Ask the shop analyst"
                placeholder="Ask about stock, sales, inventory…"
                className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-ink/15 bg-ivory px-3 py-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-burgundy disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!configured || assistant.isPending || !input.trim()}
                aria-label="Send question"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-burgundy text-ivory transition-colors hover:bg-burgundy-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="mt-2 text-center text-[9.5px] text-ink/35">
              Read-only analyst. Every figure comes from a live query; no stock or orders are changed.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
