import { STORE } from "../contracts/constants.js";
import { orderNumber } from "../contracts/orders.js";
import { store } from "./queries/store.js";
import { env } from "./lib/env.js";

/**
 * Admin-only operations analyst.
 *
 * Every number is read from Firestore through a tool. The model never writes
 * stock, prices, orders or bookings. Sales means paid online-shop orders;
 * repair bookings are separate.
 */

export type AdminAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolResult = Record<string, unknown>;

type DeepSeekToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type DeepSeekMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_inventory_overview",
      description:
        "Get current parts and retail-product inventory: units, cost/retail value, low-stock parts, and out-of-stock products.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_inventory",
      description: "Find parts or retail products by name, SKU, category, model or kind.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search words such as 'iPhone 13 screen' or 'USB-C'." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description:
        "Summarise sales for a period: collected revenue (paid online orders + repair receipts), orders placed, unpaid/refunded amounts, average paid order, and best-selling items.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Look-back period in days, from 1 to 365. Use 30 when the user does not specify.",
          },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_orders",
      description: "List recent online-shop orders with totals, payment status and fulfilment status.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "How many orders to return, 1 to 20." },
        },
        required: ["limit"],
      },
    },
  },
] as const;

function cents(value: number): number {
  return Math.round(value);
}

async function executeTool(name: string, rawArguments: string): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawArguments || "{}");
    if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
  } catch {
    return { error: "Tool arguments were not valid JSON." };
  }

  if (name === "get_inventory_overview") {
    const [parts, products] = await Promise.all([store.parts(), store.adminProducts()]);
    const lowParts = parts
      .filter((part) => part.stock <= part.lowStockAt)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 10)
      .map((part) => ({
        name: part.name,
        sku: part.sku,
        category: part.category,
        stock: part.stock,
        lowStockAt: part.lowStockAt,
        costEachCents: part.costCents,
      }));
    const outOfStock = products
      .filter((product) => product.stock === 0)
      .slice(0, 10)
      .map((product) => ({
        name: product.name,
        kind: product.kind,
        subcategory: product.subcategory,
        priceCents: product.price,
      }));

    return {
      parts: {
        skuCount: parts.length,
        totalUnits: parts.reduce((sum, part) => sum + part.stock, 0),
        costValueCents: parts.reduce((sum, part) => sum + part.stock * part.costCents, 0),
        lowStockCount: parts.filter((part) => part.stock <= part.lowStockAt).length,
        lowStock: lowParts,
      },
      products: {
        skuCount: products.length,
        totalUnits: products.reduce((sum, product) => sum + product.stock, 0),
        retailValueCents: products.reduce((sum, product) => sum + product.stock * product.price, 0),
        outOfStockCount: products.filter((product) => product.stock === 0).length,
        outOfStock,
      },
      note: "Parts are repair components valued at cost. Products are retail devices/accessories valued at selling price.",
    };
  }

  if (name === "search_inventory") {
    const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    const tokens = query.split(/\s+/).filter((token) => token.length > 1);
    const score = (haystack: string) =>
      tokens.reduce((total, token) => total + (haystack.toLowerCase().includes(token) ? 1 : 0), 0);

    const [parts, products] = await Promise.all([store.parts(), store.adminProducts()]);
    const partMatches = parts
      .map((part) => ({
        part,
        score: score(`${part.name} ${part.sku} ${part.category}`),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name))
      .slice(0, 10)
      .map(({ part }) => ({
        name: part.name,
        sku: part.sku,
        category: part.category,
        stock: part.stock,
        lowStockAt: part.lowStockAt,
        costEachCents: part.costCents,
      }));
    const productMatches = products
      .map((product) => ({
        product,
        score: score(`${product.name} ${product.kind} ${product.subcategory}`),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, 10)
      .map(({ product }) => ({
        name: product.name,
        kind: product.kind,
        subcategory: product.subcategory,
        stock: product.stock,
        priceCents: product.price,
      }));

    return {
      query,
      parts: partMatches,
      products: productMatches,
      note: "No match means no matching inventory record; do not guess.",
    };
  }

  if (name === "get_sales_summary") {
    const requested = typeof args.days === "number" ? args.days : 30;
    const days = Math.min(365, Math.max(1, Math.round(requested)));
    const since = new Date(Date.now() - days * 864e5);
    const allOrders = await store.orders();
    const orders = allOrders.filter(
      (order) => order.createdAt >= since && order.status !== "cancelled",
    );
    const paid = orders.filter((order) => order.paymentStatus === "paid");
    const unpaid = orders.filter((order) => order.paymentStatus === "unpaid");
    const refunded = orders.filter((order) => order.paymentStatus === "refunded");
    const receipts = (await store.receipts()).filter((receipt) => receipt.createdAt >= since);

    const itemTotals = new Map<string, { name: string; qty: number; revenueCents: number }>();
    for (const order of paid) {
      for (const item of order.items) {
        const current = itemTotals.get(item.name) ?? {
          name: item.name,
          qty: 0,
          revenueCents: 0,
        };
        current.qty += item.qty;
        current.revenueCents += item.lineCents;
        itemTotals.set(item.name, current);
      }
    }

    const onlineRevenueCents = paid.reduce((sum, order) => sum + order.totalCents, 0);
    const repairRevenueCents = receipts.reduce((sum, receipt) => sum + receipt.totalCents, 0);
    const placedValueCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
    return {
      periodDays: days,
      since: since.toISOString().slice(0, 10),
      online: {
        ordersPlacedCount: orders.length,
        ordersPlacedValueCents: cents(placedValueCents),
        paidOrderCount: paid.length,
        collectedRevenueCents: cents(onlineRevenueCents),
        averagePaidOrderCents: paid.length ? cents(onlineRevenueCents / paid.length) : 0,
        unpaidOrderCount: unpaid.length,
        unpaidValueCents: cents(unpaid.reduce((sum, order) => sum + order.totalCents, 0)),
        refundedOrderCount: refunded.length,
        refundedValueCents: cents(refunded.reduce((sum, order) => sum + order.totalCents, 0)),
      },
      repairs: {
        receiptCount: receipts.length,
        collectedRevenueCents: cents(repairRevenueCents),
        averageTicketCents: receipts.length ? cents(repairRevenueCents / receipts.length) : 0,
      },
      combinedCollectedCents: cents(onlineRevenueCents + repairRevenueCents),
      topItems: Array.from(itemTotals.values())
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 8),
      note:
        "Use collected revenue for money received: paid online orders + recorded repair receipts. Orders placed is a separate count/value and includes unpaid orders; cancelled orders are excluded. Unpaid and refunded amounts are not revenue.",
    };
  }

  if (name === "get_recent_orders") {
    const requested = typeof args.limit === "number" ? args.limit : 8;
    const limit = Math.min(20, Math.max(1, Math.round(requested)));
    const orders = (await store.orders()).slice(0, limit).map((order) => ({
      number: `#${orderNumber(order.id)}`,
      createdAt: order.createdAt.toISOString(),
      itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
      totalCents: order.totalCents,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      fulfillment: order.fulfillment,
    }));
    return {
      orders,
      note: "Customer contact details are deliberately omitted; use the Orders page when you need them.",
    };
  }

  return { error: "Unknown tool." };
}

function systemPrompt(): string {
  return `You are the internal operations analyst for ${STORE.name}. You answer the owner/staff about inventory, stock levels, online-shop sales and recent orders.

Rules:
- Always use a tool for figures. Never estimate, invent or use stale numbers.
- Currency is USD. Tool values are in cents; divide by 100 and format as dollars.
- "Sales" has two streams: paid online-shop orders and recorded repair receipts. Report them separately, plus the combined total. Unpaid and refunded orders are not revenue. Repair receipts only include payments staff actually recorded in the admin system.
- Use "collected" for paid money. Use "orders placed" for all non-cancelled orders, even when unpaid. If orders were placed but none are paid, say that clearly instead of implying there were no orders.
- "Inventory" has two parts: repair parts valued at cost, and retail products valued at selling price. Do not combine their values without labelling them.
- For low stock, use the part's lowStockAt threshold. For products, flag stock === 0 as out of stock.
- Do not expose customer phone numbers or emails; recent-order results intentionally omit them.
- You are read-only. Never claim to change stock, prices, orders, bookings or settings.
- If a tool fails or no records match, say so plainly. Do not fill gaps with guesses.

Answer format:
- Write plain English for a busy shop owner. No Markdown, no asterisks, no pipe tables, no headings.
- Start with one direct sentence that answers the question.
- Then up to four short lines beginning with "• ".
- Put the most important number first. Keep dollar signs in front, e.g. $1,240.00.
- Mention the period once, e.g. "In the last 30 days".
- When useful, end with one concrete next step on its own line, e.g. "Open Orders to review the unpaid orders."
- Do not repeat every field the tool returns; summarise what matters.

Today is ${new Date().toISOString().slice(0, 10)}.`;
}

export async function runAdminAssistant(messages: AdminAssistantMessage[]): Promise<{ reply: string }> {
  if (!env.deepseekApiKey) throw new Error("ASSISTANT_NOT_CONFIGURED");

  const conversation: DeepSeekMessage[] = [
    { role: "system", content: systemPrompt() },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ];

  for (let round = 0; round < 3; round += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let response: Response;
    try {
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.deepseekApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.deepseekModel,
          messages: conversation,
          tools: TOOLS,
          tool_choice: "auto",
          thinking: { type: "disabled" },
          temperature: 0.1,
          max_tokens: 600,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[admin-assistant] DeepSeek ${response.status}: ${detail.slice(0, 300)}`);
      throw new Error("ASSISTANT_UPSTREAM");
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: DeepSeekMessage }>;
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("ASSISTANT_EMPTY");

    if (message.tool_calls?.length) {
      conversation.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        const result = await executeTool(call.function.name, call.function.arguments);
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const reply = (message.content ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!reply) throw new Error("ASSISTANT_EMPTY");
    return { reply };
  }

  return {
    reply: "I need a little more detail to answer that. Try asking about low stock, inventory value, sales for a specific number of days, or recent orders.",
  };
}
