import type { Query, Transaction } from "firebase-admin/firestore";
import { getDb, toDate } from "./firestore.js";
import { newCapabilityToken } from "../lib/tokens.js";
import { planReservation, type StockItem } from "../lib/stock.js";

export type { StockItem } from "../lib/stock.js";
import { nextId } from "./ids.js";
import { deleteProductImage } from "./productImages.js";
import { partitionNewRows } from "../../src/lib/priceImport.js";
import {
  isFulfillmentMethod,
  isOrderStatus,
  isPaymentMethod,
  isPaymentStatus,
  shouldRestock,
  type FulfillmentMethod,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "../../contracts/orders.js";

/* ==================================================================
 * Firestore-backed data access for the shop + admin routers.
 * Collections use numeric ids (contract: `#PPR-123`, `sel: number`).
 * ================================================================== */

export const COLLECTIONS = {
  repairPrices: "repairPrices",
  products: "products",
  blogPosts: "blogPosts",
  messages: "messages",
  subscribers: "subscribers",
  bookings: "bookings",
  customers: "customers",
  customerNotes: "customerNotes",
  notifications: "notifications",
  parts: "parts",
  receipts: "receipts",
  orders: "orders",
  /** One doc per checkout idempotency key; written in the same transaction as
   *  the order so a retried request cannot create (or reserve) twice. */
  orderIdempotency: "orderIdempotency",
} as const;

type Row = Record<string, unknown>;

/* ---------- raw helpers ---------- */

async function listRows(col: string, field?: string, order: "asc" | "desc" = "asc"): Promise<Row[]> {
  const db = await getDb();
  let q: Query = db.collection(col);
  if (field) q = q.orderBy(field, order);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: Number(d.id), ...d.data() }) as Row);
}

async function queryWhere(col: string, field: string, value: unknown): Promise<Row[]> {
  const snap = await (await getDb()).collection(col).where(field, "==", value).get();
  return snap.docs.map((d) => ({ id: Number(d.id), ...d.data() }) as Row);
}

async function getRow(col: string, id: number): Promise<Row | undefined> {
  const snap = await (await getDb()).collection(col).doc(String(id)).get();
  if (!snap.exists) return undefined;
  return { id, ...snap.data() } as Row;
}

async function createRow(col: string, data: Row): Promise<Row> {
  const db = await getDb();
  const id = await nextId(db, col);
  // `...data` comes FIRST: the caller is a partial row that may carry an
  // explicit `id: undefined` (superjson preserves the key), and spreading it
  // last would let that overwrite the freshly allocated id — writing a document
  // whose field disagrees with its own path.
  const row: Row = {
    ...data,
    id,
    createdAt: data.createdAt ?? new Date(),
    updatedAt: data.updatedAt ?? new Date(),
  };
  await db.collection(col).doc(String(id)).set(row);
  return row;
}

async function updateRow(col: string, id: number, data: Row): Promise<void> {
  await (await getDb())
    .collection(col)
    .doc(String(id))
    .update({ ...data, updatedAt: new Date() });
}

async function deleteRow(col: string, id: number): Promise<void> {
  await (await getDb()).collection(col).doc(String(id)).delete();
}

/**
 * Is any product still pointing at this image?
 *
 * Ids are unique per upload, so a shared reference should never happen — but
 * deleting bytes another product displays would be far worse than leaking a few
 * hundred kilobytes, so the check is cheap insurance.
 */
async function isImageReferenced(imagePath: string): Promise<boolean> {
  const db = await getDb();
  const snap = await db
    .collection(COLLECTIONS.products)
    .where("imagePath", "==", imagePath)
    .limit(1)
    .get();
  return !snap.empty;
}

type ImageChange = { previous?: unknown; next?: unknown };

/**
 * The image id whose bytes became unreachable after a product was saved.
 *
 * Returns `null` when nothing may be reclaimed: no previous image, an unchanged
 * image, or a non-string value (a malformed row is not a licence to delete).
 * Callers must still confirm the id is unreferenced before deleting.
 */
export function supersededImageId({ previous, next }: ImageChange): string | null {
  if (typeof previous !== "string" || previous === "") return null;
  if (previous === next) return null;
  return previous;
}

/** The image id to consider reclaiming when a product is deleted outright. */
export function imageIdForDeletedProduct(existing: { imagePath?: unknown } | undefined): string | null {
  const imagePath = existing?.imagePath;
  return typeof imagePath === "string" && imagePath !== "" ? imagePath : null;
}

/**
 * Sort order to continue from.
 *
 * Every price row MUST carry a `sortOrder`: `prices()` orders by that field and
 * Firestore omits documents with no value for an orderBy field, so a row
 * written without one would exist yet never appear on the site.
 */
export function nextSortOrderFor(existing: Array<{ sortOrder?: unknown }>): number {
  return existing.reduce((max, r) => Math.max(max, Number(r.sortOrder ?? 0)), 0) + 1;
}

/* ---------- typed rows ---------- */

export type RepairPriceRow = {
  id: number;
  category: string;
  brand: string;
  service: string;
  priceLabel: string;
  sortOrder: number;
  createdAt?: Date;
};

export type ProductRow = {
  id: number;
  name: string;
  kind: "device_new" | "device_refurb" | "accessory";
  subcategory: string;
  price: number; // cents
  stock: number;
  description: string | null;
  badge: string | null;
  /**
   * Id of the row in the `productImages` collection, NOT a URL. The public URL
   * (`/api/images/<id>`) is derived at render time, so nothing expiring or
   * environment-specific is ever stored on the product.
   */
  imagePath: string | null;
  active: boolean;
  createdAt: Date;
};

export type BlogRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  tag: string;
  publishedAt: Date;
};

export type MessageRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  read: boolean;
  createdAt: Date;
};

export type SubscriberRow = {
  id: number;
  email: string;
  createdAt: Date;
};

export type BookingRow = {
  id: number;
  customerId: number | null;
  customerName: string;
  phone: string;
  email: string | null;
  device: string;
  repairType: string;
  date: string;
  timeSlot: string;
  notes: string | null;
  status: string;
  priceEstimate: string | null;
  warrantyUntil: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: Date;
};

export type CustomerNoteRow = {
  id: number;
  customerId: number;
  note: string;
  createdAt: Date;
};

export type NotificationRow = {
  id: number;
  bookingId: number | null;
  customerId: number | null;
  channel: "sms" | "email" | "call";
  message: string;
  createdAt: Date;
};

export type PartRow = {
  id: number;
  name: string;
  sku: string;
  category: string;
  stock: number;
  lowStockAt: number;
  costCents: number;
};

export type ReceiptLine = { description: string; amountCents: number };

export type OrderItemRow = {
  productId: number;
  /** Name and price are snapshotted: a later catalogue edit must not rewrite
   *  the history of an order the customer already placed. */
  name: string;
  unitCents: number;
  qty: number;
  lineCents: number;
};

export type OrderRow = {
  id: number;
  /** Random capability token for the customer's confirmation view. */
  token: string;
  customerName: string;
  phone: string;
  email: string | null;
  fulfillment: FulfillmentMethod;
  address: string | null;
  /** Customer-supplied note (pickup instructions, preferences). */
  notes: string | null;
  /** Staff-only note. Never projected to the public order lookup. */
  staffNotes: string | null;
  items: OrderItemRow[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  /** Stripe Checkout session, kept so a return/webhook can be re-verified. */
  stripeSessionId: string | null;
  /** Stripe PaymentIntent, required to issue a refund through Stripe. */
  paymentIntentId: string | null;
  refundId: string | null;
  paidAt: string | null;
  /** Client-generated key that makes retried checkouts idempotent. */
  idempotencyKey: string | null;
  /**
   * When the reserved stock stops being held for an unpaid card order
   * (ISO). Null for pay-in-store orders, which staff resolve manually.
   */
  reservationExpiresAt: string | null;
  /** ISO timestamp set the first time reserved stock was returned. */
  stockRestoredAt: string | null;
  /** Why staff (or the expiry sweep) cancelled the order. */
  cancelledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Reserved for customer-facing stock conflicts; routers turn this into a 409. */
export class StockError extends Error {}
/** A lifecycle transition the server refuses (e.g. cancelling a paid order). */
export class OrderStateError extends Error {}

export type ReceiptRow = {
  id: number;
  /** Random capability token used for the customer's public view link. */
  token: string;
  bookingId: number | null;
  customerId: number | null;
  customerName: string;
  phone: string;
  email: string | null;
  device: string;
  repairType: string;
  lines: ReceiptLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  paidAt: string;
  notes: string | null;
  createdAt: Date;
};

/* ---------- mappers ---------- */

function mapRepairPrice(r: Row): RepairPriceRow {
  return {
    id: Number(r.id),
    category: String(r.category ?? ""),
    brand: String(r.brand ?? ""),
    service: String(r.service ?? ""),
    priceLabel: String(r.priceLabel ?? ""),
    sortOrder: Number(r.sortOrder ?? 0),
    createdAt: toDate(r.createdAt) ?? undefined,
  };
}

function mapProduct(r: Row): ProductRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    kind: (r.kind as ProductRow["kind"]) ?? "accessory",
    subcategory: String(r.subcategory ?? ""),
    price: Number(r.price ?? 0),
    stock: Number(r.stock ?? 0),
    description: r.description == null ? null : String(r.description),
    badge: r.badge == null ? null : String(r.badge),
    imagePath: r.imagePath == null || r.imagePath === "" ? null : String(r.imagePath),
    active: Boolean(r.active ?? true),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapBlog(r: Row): BlogRow {
  return {
    id: Number(r.id),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    excerpt: String(r.excerpt ?? ""),
    content: String(r.content ?? ""),
    tag: String(r.tag ?? "Repair Tips"),
    publishedAt: toDate(r.publishedAt) ?? new Date(),
  };
}

function mapMessage(r: Row): MessageRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone == null ? null : String(r.phone),
    message: String(r.message ?? ""),
    read: Boolean(r.read ?? false),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapSubscriber(r: Row): SubscriberRow {
  return {
    id: Number(r.id),
    email: String(r.email ?? ""),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapBooking(r: Row): BookingRow {
  return {
    id: Number(r.id),
    customerId: r.customerId == null ? null : Number(r.customerId),
    customerName: String(r.customerName ?? ""),
    phone: String(r.phone ?? ""),
    email: r.email == null ? null : String(r.email),
    device: String(r.device ?? ""),
    repairType: String(r.repairType ?? ""),
    date: String(r.date ?? ""),
    timeSlot: String(r.timeSlot ?? ""),
    notes: r.notes == null ? null : String(r.notes),
    status: String(r.status ?? "pending"),
    priceEstimate: r.priceEstimate == null ? null : String(r.priceEstimate),
    warrantyUntil: r.warrantyUntil == null ? null : String(r.warrantyUntil),
    createdAt: toDate(r.createdAt) ?? new Date(),
    updatedAt: toDate(r.updatedAt) ?? new Date(),
  };
}

function mapCustomer(r: Row): CustomerRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    email: r.email == null ? null : String(r.email),
    notes: r.notes == null ? null : String(r.notes),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapCustomerNote(r: Row): CustomerNoteRow {
  return {
    id: Number(r.id),
    customerId: Number(r.customerId ?? 0),
    note: String(r.note ?? ""),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapNotification(r: Row): NotificationRow {
  return {
    id: Number(r.id),
    bookingId: r.bookingId == null ? null : Number(r.bookingId),
    customerId: r.customerId == null ? null : Number(r.customerId),
    channel: (r.channel as NotificationRow["channel"]) ?? "sms",
    message: String(r.message ?? ""),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapPart(r: Row): PartRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    sku: String(r.sku ?? ""),
    category: String(r.category ?? ""),
    stock: Number(r.stock ?? 0),
    lowStockAt: Number(r.lowStockAt ?? 5),
    costCents: Number(r.costCents ?? 0),
  };
}

function mapReceipt(r: Row): ReceiptRow {
  const rawLines = Array.isArray(r.lines) ? (r.lines as Row[]) : [];
  return {
    id: Number(r.id),
    token: String(r.token ?? ""),
    bookingId: r.bookingId == null ? null : Number(r.bookingId),
    customerId: r.customerId == null ? null : Number(r.customerId),
    customerName: String(r.customerName ?? ""),
    phone: String(r.phone ?? ""),
    email: r.email == null ? null : String(r.email),
    device: String(r.device ?? ""),
    repairType: String(r.repairType ?? ""),
    lines: rawLines.map((l) => ({
      description: String(l.description ?? ""),
      amountCents: Number(l.amountCents ?? 0),
    })),
    subtotalCents: Number(r.subtotalCents ?? 0),
    taxCents: Number(r.taxCents ?? 0),
    totalCents: Number(r.totalCents ?? 0),
    paymentMethod: String(r.paymentMethod ?? ""),
    paidAt: String(r.paidAt ?? ""),
    notes: r.notes == null ? null : String(r.notes),
    createdAt: toDate(r.createdAt) ?? new Date(),
  };
}

function mapOrder(r: Row): OrderRow {
  const rawItems = Array.isArray(r.items) ? (r.items as Row[]) : [];
  return {
    id: Number(r.id),
    token: String(r.token ?? ""),
    customerName: String(r.customerName ?? ""),
    phone: String(r.phone ?? ""),
    email: r.email == null ? null : String(r.email),
    fulfillment: isFulfillmentMethod(r.fulfillment) ? r.fulfillment : "pickup",
    address: r.address == null ? null : String(r.address),
    notes: r.notes == null ? null : String(r.notes),
    staffNotes: r.staffNotes == null ? null : String(r.staffNotes),
    items: rawItems
      .map((l) => ({
        productId: Number(l.productId ?? 0),
        name: String(l.name ?? ""),
        unitCents: Number(l.unitCents ?? 0),
        qty: Number(l.qty ?? 0),
        lineCents: Number(l.lineCents ?? 0),
      }))
      .filter((l) => l.productId > 0 && l.qty > 0),
    subtotalCents: Number(r.subtotalCents ?? 0),
    taxCents: Number(r.taxCents ?? 0),
    totalCents: Number(r.totalCents ?? 0),
    paymentMethod: isPaymentMethod(r.paymentMethod) ? r.paymentMethod : "card_in_store",
    paymentStatus: isPaymentStatus(r.paymentStatus) ? r.paymentStatus : "unpaid",
    status: isOrderStatus(r.status) ? r.status : "new",
    stripeSessionId: r.stripeSessionId == null ? null : String(r.stripeSessionId),
    paymentIntentId: r.paymentIntentId == null ? null : String(r.paymentIntentId),
    refundId: r.refundId == null ? null : String(r.refundId),
    paidAt: r.paidAt == null ? null : String(r.paidAt),
    idempotencyKey: r.idempotencyKey == null ? null : String(r.idempotencyKey),
    reservationExpiresAt:
      r.reservationExpiresAt == null ? null : String(r.reservationExpiresAt),
    stockRestoredAt: r.stockRestoredAt == null ? null : String(r.stockRestoredAt),
    cancelledReason: r.cancelledReason == null ? null : String(r.cancelledReason),
    createdAt: toDate(r.createdAt) ?? new Date(),
    updatedAt: toDate(r.updatedAt) ?? new Date(),
  };
}

/* ---------- order transaction helpers ---------- */

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Return stock inside an existing transaction.
 *
 * Must be called before any write in that transaction (Firestore requires all
 * reads first). Deleting or cancelling an order and restoring its stock then
 * commit atomically — there is no window in which the order is gone but the
 * stock is still withheld, or vice versa.
 */
async function restockInTransaction(
  tx: Transaction,
  db: Db,
  items: StockItem[],
): Promise<void> {
  if (items.length === 0) return;
  const refs = items.map((i) =>
    db.collection(COLLECTIONS.products).doc(String(i.productId)),
  );
  const snaps = await tx.getAll(...refs);
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const raw = Number((snap.data() as Row | undefined)?.stock ?? 0);
    const current = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    tx.update(refs[i], {
      // Non-finite/negative legacy values are treated as zero; a normal
      // restock adds the reserved quantity back exactly once.
      stock: current + items[i].qty,
      updatedAt: new Date(),
    });
  });
}

function orderFromSnapshot(id: number, data: Row | undefined): OrderRow {
  return mapOrder({ id, ...(data ?? {}) });
}

/* ---------- public accessors ---------- */

export const store = {
  // Repair prices
  async prices(): Promise<RepairPriceRow[]> {
    const rows = await listRows(COLLECTIONS.repairPrices, "sortOrder", "asc");
    return rows.map(mapRepairPrice);
  },
  async updatePrice(id: number, priceLabel: string): Promise<void> {
    await updateRow(COLLECTIONS.repairPrices, id, { priceLabel });
  },
  async createPrice(data: {
    category: string;
    brand: string;
    service: string;
    priceLabel: string;
  }): Promise<RepairPriceRow> {
    // `prices()` orders by `sortOrder`, and Firestore omits documents that have
    // no value for an orderBy field — so every row MUST carry one, or it would be
    // written successfully yet never appear on the site.
    const existing = await listRows(COLLECTIONS.repairPrices, "sortOrder", "asc");
    const nextSortOrder = nextSortOrderFor(existing);
    const row = await createRow(COLLECTIONS.repairPrices, { ...data, sortOrder: nextSortOrder });
    return mapRepairPrice(row);
  },
  async deletePrice(id: number): Promise<void> {
    await deleteRow(COLLECTIONS.repairPrices, id);
  },

  /**
   * Append several price rows at once.
   *
   * Deliberately additive: it never overwrites an existing row, it skips rows
   * that already exist (matched on category + brand + service) and it skips
   * repeats inside the same batch. That makes re-running an import harmless,
   * which matters because the price list is live and mistakes are public.
   */
  async createPrices(data: Array<Omit<RepairPriceRow, "id" | "sortOrder">>): Promise<{
    created: RepairPriceRow[];
    skipped: Array<Omit<RepairPriceRow, "id" | "sortOrder">>;
  }> {
    const existing = await listRows(COLLECTIONS.repairPrices);
    const { fresh, duplicates } = partitionNewRows(data, existing.map(mapRepairPrice));
    if (fresh.length === 0) return { created: [], skipped: duplicates };

    let nextSortOrder = nextSortOrderFor(existing);
    const created: RepairPriceRow[] = [];
    for (const row of fresh) {
      const written = await createRow(COLLECTIONS.repairPrices, { ...row, sortOrder: nextSortOrder++ });
      created.push(mapRepairPrice(written));
    }
    return { created, skipped: duplicates };
  },

  // Products
  async products(kind?: string): Promise<ProductRow[]> {
    const rows =
      kind && kind !== "all"
        ? await queryWhere(COLLECTIONS.products, "kind", kind)
        : await listRows(COLLECTIONS.products);
    return rows.map(mapProduct).filter((p) => p.active);
  },
  async adminProducts(): Promise<ProductRow[]> {
    const rows = await listRows(COLLECTIONS.products);
    return rows.map(mapProduct);
  },
  async upsertProduct(data: Partial<ProductRow>): Promise<void> {
    if (data.id) {
      const existing = await getRow(COLLECTIONS.products, data.id);
      await updateRow(COLLECTIONS.products, data.id, data);

      // Reclaim superseded image bytes. On the free plan the whole catalogue
      // shares a 1 GiB quota, so leaving every replaced upload behind would
      // gradually eat it. Ids are unique per upload, so nothing else can be
      // pointing at the old document.
      const superseded = supersededImageId({ previous: existing?.imagePath, next: data.imagePath });
      if (superseded && !(await isImageReferenced(superseded))) {
        await deleteProductImage(superseded);
      }
    } else {
      await createRow(COLLECTIONS.products, data);
    }
  },
  async deleteProduct(id: number): Promise<void> {
    const existing = await getRow(COLLECTIONS.products, id);
    await deleteRow(COLLECTIONS.products, id);

    const imagePath = imageIdForDeletedProduct(existing);
    if (imagePath && !(await isImageReferenced(imagePath))) {
      await deleteProductImage(imagePath);
    }
  },

  /** Products by id, including inactive ones (the caller decides what to reject). */
  async getProductsByIds(ids: number[]): Promise<ProductRow[]> {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (unique.length === 0) return [];
    const db = await getDb();
    const refs = unique.map((id) => db.collection(COLLECTIONS.products).doc(String(id)));
    const snaps = await db.getAll(...refs);
    return snaps
      .filter((snap) => snap.exists)
      .map((snap) => mapProduct({ id: Number(snap.id), ...(snap.data() as Row) }));
  },

  // Blog
  async blogList(): Promise<BlogRow[]> {
    const rows = await listRows(COLLECTIONS.blogPosts, "publishedAt", "desc");
    return rows.map(mapBlog);
  },
  async blogBySlug(slug: string): Promise<BlogRow | undefined> {
    const rows = await queryWhere(COLLECTIONS.blogPosts, "slug", slug);
    return rows.length ? mapBlog(rows[0]) : undefined;
  },

  // Messages
  async messages(): Promise<MessageRow[]> {
    const rows = await listRows(COLLECTIONS.messages);
    return rows.map(mapMessage).reverse();
  },
  async createMessage(data: Omit<MessageRow, "id" | "createdAt" | "read">): Promise<void> {
    await createRow(COLLECTIONS.messages, { ...data, read: false });
  },
  async markMessageRead(id: number): Promise<void> {
    await updateRow(COLLECTIONS.messages, id, { read: true });
  },
  async unreadMessages(): Promise<number> {
    const rows = await queryWhere(COLLECTIONS.messages, "read", false);
    return rows.length;
  },

  // Subscribers
  async subscribers(): Promise<SubscriberRow[]> {
    const rows = await listRows(COLLECTIONS.subscribers);
    return rows.map(mapSubscriber);
  },
  async subscribe(email: string): Promise<void> {
    const existing = await queryWhere(COLLECTIONS.subscribers, "email", email);
    if (existing.length === 0) {
      await createRow(COLLECTIONS.subscribers, { email });
    }
  },

  // Bookings
  async bookings(): Promise<BookingRow[]> {
    const rows = await listRows(COLLECTIONS.bookings);
    return rows.map(mapBooking);
  },
  async bookingsByDate(date: string): Promise<BookingRow[]> {
    const rows = await queryWhere(COLLECTIONS.bookings, "date", date);
    return rows.map(mapBooking);
  },
  async bookingsByStatus(status: string): Promise<BookingRow[]> {
    const rows = await queryWhere(COLLECTIONS.bookings, "status", status);
    return rows.map(mapBooking);
  },
  async bookingsByCustomer(customerId: number): Promise<BookingRow[]> {
    const rows = await queryWhere(COLLECTIONS.bookings, "customerId", customerId);
    return rows.map(mapBooking);
  },
  async getBooking(id: number): Promise<BookingRow | undefined> {
    const row = await getRow(COLLECTIONS.bookings, id);
    return row ? mapBooking(row) : undefined;
  },
  async createBooking(data: Omit<BookingRow, "id" | "createdAt" | "updatedAt" | "status"> & { status?: string }): Promise<BookingRow> {
    const row = await createRow(COLLECTIONS.bookings, {
      ...data,
      status: data.status ?? "pending",
    });
    return mapBooking(row);
  },
  async updateBooking(id: number, data: Partial<BookingRow>): Promise<void> {
    await updateRow(COLLECTIONS.bookings, id, data);
  },
  async deleteBooking(id: number): Promise<void> {
    await deleteRow(COLLECTIONS.bookings, id);
  },

  // Customers
  async customers(): Promise<CustomerRow[]> {
    const rows = await listRows(COLLECTIONS.customers);
    return rows.map(mapCustomer).reverse();
  },
  async customerByPhone(phone: string): Promise<CustomerRow | undefined> {
    const rows = await queryWhere(COLLECTIONS.customers, "phone", phone);
    return rows.length ? mapCustomer(rows[0]) : undefined;
  },
  async getCustomer(id: number): Promise<CustomerRow | undefined> {
    const row = await getRow(COLLECTIONS.customers, id);
    return row ? mapCustomer(row) : undefined;
  },
  async createCustomer(data: Omit<CustomerRow, "id" | "createdAt">): Promise<CustomerRow> {
    const row = await createRow(COLLECTIONS.customers, data);
    return mapCustomer(row);
  },
  async updateCustomer(id: number, data: Partial<CustomerRow>): Promise<void> {
    await updateRow(COLLECTIONS.customers, id, data);
  },
  async deleteCustomer(id: number): Promise<void> {
    await deleteRow(COLLECTIONS.customers, id);
  },

  // Customer notes
  async customerNotes(customerId: number): Promise<CustomerNoteRow[]> {
    const rows = await queryWhere(COLLECTIONS.customerNotes, "customerId", customerId);
    return rows.map(mapCustomerNote).reverse();
  },
  async addCustomerNote(data: Omit<CustomerNoteRow, "id" | "createdAt">): Promise<void> {
    await createRow(COLLECTIONS.customerNotes, data);
  },

  // Notifications
  async notifications(customerId?: number, bookingId?: number): Promise<NotificationRow[]> {
    let rows: Row[];
    if (customerId !== undefined) rows = await queryWhere(COLLECTIONS.notifications, "customerId", customerId);
    else if (bookingId !== undefined) rows = await queryWhere(COLLECTIONS.notifications, "bookingId", bookingId);
    else rows = await listRows(COLLECTIONS.notifications);
    return rows.map(mapNotification).reverse();
  },
  async addNotification(data: Omit<NotificationRow, "id" | "createdAt">): Promise<void> {
    await createRow(COLLECTIONS.notifications, data);
  },

  // Parts
  async parts(): Promise<PartRow[]> {
    const rows = await listRows(COLLECTIONS.parts);
    return rows
      .map(mapPart)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  },
  async lowStock(): Promise<PartRow[]> {
    const all = await this.parts();
    return all.filter((p) => p.stock <= p.lowStockAt);
  },
  async upsertPart(data: Partial<PartRow>): Promise<void> {
    if (data.id) {
      await updateRow(COLLECTIONS.parts, data.id, data);
    } else {
      await createRow(COLLECTIONS.parts, data);
    }
  },
  async deletePart(id: number): Promise<void> {
    await deleteRow(COLLECTIONS.parts, id);
  },

  // Payment receipts
  async createReceipt(
    data: Omit<ReceiptRow, "id" | "createdAt" | "token">,
  ): Promise<ReceiptRow> {
    // Capability token: anyone holding the link can view that one receipt, so
    // it must be unguessable rather than a sequential id.
    const token = newCapabilityToken();
    const row = await createRow(COLLECTIONS.receipts, { ...data, token });
    return mapReceipt(row);
  },
  async receipts(): Promise<ReceiptRow[]> {
    const rows = await listRows(COLLECTIONS.receipts);
    return rows
      .map(mapReceipt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
  async receiptByToken(token: string): Promise<ReceiptRow | undefined> {
    if (!token) return undefined;
    const rows = await queryWhere(COLLECTIONS.receipts, "token", token);
    return rows.length ? mapReceipt(rows[0]) : undefined;
  },
  async receiptByBooking(bookingId: number): Promise<ReceiptRow | undefined> {
    const rows = await queryWhere(COLLECTIONS.receipts, "bookingId", bookingId);
    return rows.length ? mapReceipt(rows[0]) : undefined;
  },
  async deleteReceipt(id: number): Promise<void> {
    await deleteRow(COLLECTIONS.receipts, id);
  },

  // Online orders
  async orders(): Promise<OrderRow[]> {
    const rows = await listRows(COLLECTIONS.orders);
    return rows
      .map(mapOrder)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
  async orderByToken(token: string): Promise<OrderRow | undefined> {
    if (!token) return undefined;
    const rows = await queryWhere(COLLECTIONS.orders, "token", token);
    return rows.length ? mapOrder(rows[0]) : undefined;
  },
  async orderById(id: number): Promise<OrderRow | undefined> {
    const row = await getRow(COLLECTIONS.orders, id);
    return row ? mapOrder(row) : undefined;
  },
  async orderByIdempotencyKey(key: string): Promise<OrderRow | undefined> {
    if (!key) return undefined;
    const db = await getDb();
    const snap = await db.collection(COLLECTIONS.orderIdempotency).doc(key).get();
    if (!snap.exists) return undefined;
    const orderId = Number(snap.data()?.orderId ?? 0);
    if (!Number.isInteger(orderId) || orderId <= 0) return undefined;
    const row = await getRow(COLLECTIONS.orders, orderId);
    return row ? mapOrder(row) : undefined;
  },

  /**
   * Create an order and take its stock off the shelf in ONE transaction.
   *
   * Previously the reservation and the order write were separate calls; a
   * crash between them held stock for an order that never existed. Now a
   * shortage, a Firestore error or a duplicate idempotency key leaves both
   * collections untouched.
   */
  async createOrderWithReservation(
    data: Omit<OrderRow, "id" | "createdAt" | "updatedAt" | "token">,
    stockItems: StockItem[],
  ): Promise<{ order: OrderRow; duplicate: boolean }> {
    const db = await getDb();
    // The numeric id is allocated before the transaction because the counter
    // uses its own transaction (Firestore forbids nested transactions). A
    // rolled-back attempt leaves a harmless gap in the sequence.
    const id = await nextId(db, COLLECTIONS.orders);
    // Capability token: the confirmation page is public and reachable only with
    // the unguessable link we hand the customer, exactly like receipts.
    const token = newCapabilityToken();
    const now = new Date();
    const row: Row = { ...data, id, token, createdAt: now, updatedAt: now };
    const orderRef = db.collection(COLLECTIONS.orders).doc(String(id));
    const idemKey = data.idempotencyKey;
    const idemRef = idemKey
      ? db.collection(COLLECTIONS.orderIdempotency).doc(idemKey)
      : null;

    return db.runTransaction(async (tx) => {
      // Every read happens before the first write, as Firestore requires.
      if (idemRef) {
        const idemSnap = await tx.get(idemRef);
        if (idemSnap.exists) {
          const existingId = Number(idemSnap.data()?.orderId ?? 0);
          if (Number.isInteger(existingId) && existingId > 0) {
            const existingSnap = await tx.get(
              db.collection(COLLECTIONS.orders).doc(String(existingId)),
            );
            if (existingSnap.exists) {
              return {
                order: orderFromSnapshot(existingId, existingSnap.data() as Row),
                duplicate: true,
              };
            }
          }
          // Stale key pointing at a deleted order: the `tx.set(idemRef, …)`
          // below replaces it with this attempt's pointer.
        }
      }

      const refs = stockItems.map((i) =>
        db.collection(COLLECTIONS.products).doc(String(i.productId)),
      );
      const snaps = await tx.getAll(...refs);
      const plan = planReservation(
        stockItems,
        snaps.map((snap) => {
          if (!snap.exists) return { exists: false };
          const product = mapProduct({
            id: Number(snap.id),
            ...(snap.data() as Row),
          });
          return {
            exists: true,
            name: product.name,
            stock: product.stock,
            active: product.active,
          };
        }),
      );

      if (!plan.ok) throw new StockError(plan.reason);

      tx.set(orderRef, row);
      if (idemRef) {
        tx.set(idemRef, { orderId: id, token, createdAt: now });
      }
      plan.nextStock.forEach((entry, index) => {
        tx.update(refs[index], { stock: entry.stock, updatedAt: now });
      });
      return { order: orderFromSnapshot(id, row), duplicate: false };
    });
  },

  /**
   * Cancel an unpaid order and return its stock exactly once.
   *
   * The status read, the stock increment and the status write share one
   * transaction, so two admins (or an admin and the expiry sweep) cannot both
   * restock the same order. Paid orders are refused: they must be refunded.
   */
  async cancelOrder(
    id: number,
    reason = "cancelled_by_staff",
  ): Promise<{ order: OrderRow; changed: boolean; restocked: boolean }> {
    const db = await getDb();
    const ref = db.collection(COLLECTIONS.orders).doc(String(id));

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Order not found.");
      const order = orderFromSnapshot(id, snap.data() as Row);
      if (order.status === "cancelled") {
        return { order, changed: false, restocked: false };
      }
      if (order.paymentStatus === "paid") {
        throw new OrderStateError(
          "A paid order must be refunded before it can be cancelled.",
        );
      }

      const restock = shouldRestock(order.status) && !order.stockRestoredAt;
      if (restock) await restockInTransaction(tx, db, order.items);

      const now = new Date();
      const stockRestoredAt = restock ? now.toISOString() : order.stockRestoredAt;
      const patch = {
        status: "cancelled" as const,
        cancelledReason: reason,
        stockRestoredAt,
        // Leaving the expiry set would keep this cancelled order in the
        // reconciliation query forever and could starve live candidates.
        reservationExpiresAt: null,
        updatedAt: now,
      };
      tx.update(ref, patch);
      return {
        order: orderFromSnapshot(id, { ...(snap.data() as Row), ...patch }),
        changed: true,
        restocked: restock,
      };
    });
  },

  /**
   * Mark an order paid. Idempotent: a replayed webhook or a second success-page
   * verification returns `changed: false` and sends no second email.
   */
  async markOrderPaid(
    id: number,
    input: {
      paidAt: string;
      stripeSessionId?: string | null;
      paymentIntentId?: string | null;
    },
  ): Promise<{ order: OrderRow; changed: boolean }> {
    const db = await getDb();
    const ref = db.collection(COLLECTIONS.orders).doc(String(id));

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Order not found.");
      const order = orderFromSnapshot(id, snap.data() as Row);
      if (order.paymentStatus === "paid") {
        return { order, changed: false };
      }
      if (order.paymentStatus === "refunded") {
        throw new OrderStateError("A refunded order cannot be marked paid.");
      }

      const now = new Date();
      const patch = {
        paymentStatus: "paid" as const,
        paidAt: input.paidAt,
        stripeSessionId: input.stripeSessionId ?? order.stripeSessionId,
        paymentIntentId: input.paymentIntentId ?? order.paymentIntentId,
        // A paid order no longer needs a stock hold and must drop out of the
        // abandoned-checkout query.
        reservationExpiresAt: null,
        updatedAt: now,
      };
      tx.update(ref, patch);
      return {
        order: orderFromSnapshot(id, { ...(snap.data() as Row), ...patch }),
        changed: true,
      };
    });
  },

  /**
   * Record a completed refund. Called only after Stripe has confirmed it (for
   * card-online orders) or after staff have refunded an offline payment.
   * Restocks only orders whose goods were still on hold.
   */
  async markOrderRefunded(
    id: number,
    input: { refundId: string | null; reason?: string },
  ): Promise<{ order: OrderRow; changed: boolean; restocked: boolean }> {
    const db = await getDb();
    const ref = db.collection(COLLECTIONS.orders).doc(String(id));

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Order not found.");
      const order = orderFromSnapshot(id, snap.data() as Row);
      if (order.paymentStatus === "refunded") {
        return { order, changed: false, restocked: false };
      }
      if (order.paymentStatus !== "paid") {
        throw new OrderStateError("Only a paid order can be refunded.");
      }

      const restock = shouldRestock(order.status) && !order.stockRestoredAt;
      if (restock) await restockInTransaction(tx, db, order.items);

      const now = new Date();
      const nextStatus = shouldRestock(order.status) ? "cancelled" : order.status;
      const patch = {
        paymentStatus: "refunded" as const,
        refundId: input.refundId,
        status: nextStatus,
        cancelledReason:
          nextStatus === "cancelled"
            ? (input.reason ?? "refunded")
            : order.cancelledReason,
        stockRestoredAt: restock ? now.toISOString() : order.stockRestoredAt,
        reservationExpiresAt: null,
        updatedAt: now,
      };
      tx.update(ref, patch);
      return {
        order: orderFromSnapshot(id, { ...(snap.data() as Row), ...patch }),
        changed: true,
        restocked: restock,
      };
    });
  },

  /**
   * Delete an order safely: paid orders are refused, stock is returned only
   * once and only if it was still held, and the idempotency key is cleared so
   * the same key cannot resurrect a deleted order.
   */
  async deleteOrderSafely(
    id: number,
  ): Promise<{ deleted: boolean; restocked: boolean }> {
    const db = await getDb();
    const ref = db.collection(COLLECTIONS.orders).doc(String(id));

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { deleted: false, restocked: false };
      const order = orderFromSnapshot(id, snap.data() as Row);
      if (order.paymentStatus === "paid") {
        throw new OrderStateError("Refund paid orders before deleting them.");
      }

      const restock = shouldRestock(order.status) && !order.stockRestoredAt;
      if (restock) await restockInTransaction(tx, db, order.items);

      tx.delete(ref);
      if (order.idempotencyKey) {
        tx.delete(
          db.collection(COLLECTIONS.orderIdempotency).doc(order.idempotencyKey),
        );
      }
      return { deleted: true, restocked: restock };
    });
  },

  /**
   * Unpaid card orders whose reservation window has passed.
   *
   * Only the query lives here; the caller must re-check Stripe before deciding
   * whether to release stock, because a delayed webhook could mean the payment
   * was captured before the reservation elapsed. See `orderReconciliation.ts`.
   *
   * Filtering in code (rather than a composite `where`) keeps this on a
   * single-field index that Firestore creates automatically.
   */
  async staleCardOrders(now = new Date(), limit = 100): Promise<OrderRow[]> {
    const db = await getDb();
    const snap = await db
      .collection(COLLECTIONS.orders)
      .where("reservationExpiresAt", "<=", now.toISOString())
      .orderBy("reservationExpiresAt", "asc")
      .limit(limit)
      .get();
    return snap.docs
      .map((doc) => orderFromSnapshot(Number(doc.id), doc.data() as Row))
      .filter(
        (order) =>
          order.paymentMethod === "card_online" &&
          order.paymentStatus === "unpaid" &&
          shouldRestock(order.status),
      );
  },

  /** Delete old idempotency keys so the collection does not grow forever. */
  async cleanupIdempotency(olderThan: Date, limit = 200): Promise<number> {
    const db = await getDb();
    const snap = await db
      .collection(COLLECTIONS.orderIdempotency)
      .where("createdAt", "<=", olderThan)
      .limit(limit)
      .get();
    if (snap.empty) return 0;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return snap.size;
  },

  /** Generic patch for non-financial admin edits (notes, method, status). */
  async updateOrder(id: number, data: Partial<OrderRow>): Promise<void> {
    await updateRow(COLLECTIONS.orders, id, data);
  },
};