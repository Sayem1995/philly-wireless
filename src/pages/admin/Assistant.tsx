import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, Bot, Check, Loader2, Package, Send, Sparkles, TrendingUp, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import { trpc } from "@/providers/trpc";

type Proposal = {
  token: string;
  kind: string;
  summary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
};

const GREETING =
  "Ask me about bookings, customers, stock, inventory value, online sales, receipts, messages or content. " +
  "I can prepare a change for your approval, but I won’t apply anything until you click Approve.";

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<"pending" | "applied" | "dismissed">("pending");
  const apply = trpc.admin.applyAssistantAction.useMutation();
  const utils = trpc.useUtils();

  const approve = async () => {
    try {
      await apply.mutateAsync({ token: proposal.token });
      setState("applied");
      void utils.invalidate();
      toast.success("Approved and applied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply the change.");
    }
  };

  if (state === "dismissed") return null;

  return (
    <div className="rounded-xl border border-burgundy/25 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-burgundy">
            Approval needed
          </p>
          <p className="mt-1 text-[12.5px] font-semibold text-ink">{proposal.summary}</p>
        </div>
        <span className="rounded-full bg-blush px-2 py-0.5 text-[9px] uppercase tracking-wide text-burgundy">
          {proposal.kind.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-blush-light/60 px-2.5 py-2">
          <p className="mb-1 text-[9px] uppercase tracking-wide text-ink/35">Current</p>
          {Object.entries(proposal.before).map(([key, value]) => (
            <p key={key} className="text-ink/60">
              {key}: <span className="font-medium text-ink/80">{String(value) || "—"}</span>
            </p>
          ))}
        </div>
        <div className="rounded-lg bg-emerald-50 px-2.5 py-2">
          <p className="mb-1 text-[9px] uppercase tracking-wide text-emerald-700/60">Proposed</p>
          {Object.entries(proposal.after).map(([key, value]) => (
            <p key={key} className="text-emerald-800/70">
              {key}: <span className="font-semibold text-emerald-900">{String(value) || "—"}</span>
            </p>
          ))}
        </div>
      </div>

      {state === "applied" ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
          <Check size={13} /> Applied
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void approve()}
            disabled={apply.isPending}
            className="inline-flex items-center gap-1 rounded-full bg-burgundy px-3 py-1.5 text-[11px] font-semibold text-ivory transition-colors hover:bg-burgundy-dark disabled:opacity-50"
          >
            {apply.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Approve
          </button>
          <button
            type="button"
            onClick={() => setState("dismissed")}
            disabled={apply.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-3 py-1.5 text-[11px] font-medium text-ink/50 transition-colors hover:border-ink/25 hover:text-ink disabled:opacity-50"
          >
            <X size={12} /> Dismiss
          </button>
          <span className="ml-auto text-[9px] text-ink/30">Expires in 15 min</span>
        </div>
      )}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-ink/[0.06] px-1 py-0.5 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

type MessageBlock =
  | { type: "text"; lines: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.split("|").length >= 3;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = splitRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMessage(text: string): MessageBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MessageBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isTableLine(lines[index]) && isTableSeparator(lines[index + 1] ?? "")) {
      const headers = splitRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableLine(lines[index]) && !isTableSeparator(lines[index])) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      if (rows.length) blocks.push({ type: "table", headers, rows });
      continue;
    }

    const textLines: string[] = [];
    while (index < lines.length) {
      if (isTableLine(lines[index]) && isTableSeparator(lines[index + 1] ?? "")) break;
      textLines.push(lines[index]);
      index += 1;
    }
    if (textLines.some((line) => line.trim())) {
      blocks.push({ type: "text", lines: textLines });
    }
  }

  return blocks;
}

function FormattedMessage({ text }: { text: string }) {
  const blocks = parseMessage(text);

  return (
    <>
      {blocks.map((block, blockIndex) =>
        block.type === "table" ? (
          <div key={blockIndex} className="my-2 overflow-x-auto rounded-xl border border-blush/80">
            <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
              <thead className="bg-blush-light/70">
                <tr>
                  {block.headers.map((header, index) => (
                    <th
                      key={index}
                      className="border-b border-blush px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink/45"
                    >
                      {inline(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-blush/50">
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="align-top">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`px-3 py-2 leading-snug ${
                          cellIndex === 0 ? "font-medium text-ink/70" : "text-ink/60"
                        }`}
                      >
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div key={blockIndex} className="whitespace-pre-wrap">
            {inline(block.lines.join("\n"))}
          </div>
        ),
      )}
    </>
  );
}

const SUGGESTIONS = [
  { icon: AlertTriangle, label: "What parts are low in stock?" },
  { icon: Package, label: "What is my total inventory value?" },
  { icon: Wrench, label: "How many repairs have I completed?" },
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
        {
          id: `assistant-${seq.current}`,
          role: "assistant",
          content: result.reply,
          proposals: result.proposals,
        },
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
            Live answers across inventory, bookings, customers, sales and messages. Changes need your approval.
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
          The AI analyst isn’t connected. Add an AI provider key in the Vercel project and
          redeploy, or point <code className="font-mono">AI_BASE_URL</code> at your local model.
          Inventory, orders and reports pages still work normally.
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
            Unpaid and refunded orders are reported separately. Repair counts include only
            bookings saved in this admin system — not paper or other-system history.
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
                className={`max-w-[92%] space-y-2 ${message.role === "user" ? "ml-auto" : ""}`}
              >
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "bg-ink text-ivory"
                      : "border border-blush bg-blush-light/40 text-ink/75"
                  }`}
                >
                  <FormattedMessage text={message.content} />
                </div>
                {message.proposals?.map((proposal) => (
                  <ProposalCard key={proposal.token} proposal={proposal} />
                ))}
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
              Read-only unless you approve a proposal. Every figure comes from a live query.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
