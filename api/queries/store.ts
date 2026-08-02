import type { Query } from "firebase-admin/firestore";
import { getDb, toDate } from "./firestore";
import { nextId } from "./ids";

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
} as const;

type Row = Record<string, unknown>;

/* ---------- raw helpers ---------- */

async function listRows(col: string, field?: string, order: "asc" | "desc" = "asc"): Promise<Row[]> {
  const db = getDb();
  let q: Query = db.collection(col);
  if (field) q = q.orderBy(field, order);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: Number(d.id), ...d.data() }) as Row);
}

async function queryWhere(col: string, field: string, value: unknown): Promise<Row[]> {
  const snap = await getDb().collection(col).where(field, "==", value).get();
  return snap.docs.map((d) => ({ id: Number(d.id), ...d.data() }) as Row);
}

async function getRow(col: string, id: number): Promise<Row | undefined> {
  const snap = await getDb().collection(col).doc(String(id)).get();
  if (!snap.exists) return undefined;
  return { id, ...snap.data() } as Row;
}

async function createRow(col: string, data: Row): Promise<Row> {
  const db = getDb();
  const id = await nextId(db, col);
  const row: Row = {
    id,
    ...data,
    createdAt: data.createdAt ?? new Date(),
    updatedAt: data.updatedAt ?? new Date(),
  };
  await db.collection(col).doc(String(id)).set(row);
  return row;
}

async function updateRow(col: string, id: number, data: Row): Promise<void> {
  await getDb()
    .collection(col)
    .doc(String(id))
    .update({ ...data, updatedAt: new Date() });
}

async function deleteRow(col: string, id: number): Promise<void> {
  await getDb().collection(col).doc(String(id)).delete();
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
      await updateRow(COLLECTIONS.products, data.id, data);
    } else {
      await createRow(COLLECTIONS.products, data);
    }
  },
  async deleteProduct(id: number): Promise<void> {
    await deleteRow(COLLECTIONS.products, id);
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
};