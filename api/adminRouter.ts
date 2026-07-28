import { z } from "zod";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  bookings,
  customers,
  customerNotes,
  notifications,
  repairPrices,
  products,
  parts,
  messages,
  subscribers,
  blogPosts,
} from "@db/schema";
import { eq, desc, like, or, sql, gte } from "drizzle-orm";

const bookingInput = z.object({
  id: z.number(),
  status: z
    .enum(["pending", "accepted", "in_progress", "completed", "rescheduled", "cancelled"])
    .optional(),
  date: z.string().optional(),
  timeSlot: z.string().optional(),
  priceEstimate: z.string().optional(),
  warrantyUntil: z.string().optional(),
  notes: z.string().optional(),
});

export const adminRouter = createRouter({
  /* ---------- dashboard stats ---------- */
  stats: adminQuery.query(async () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const [todayCount] = await db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.date, today));
    const [pending] = await db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.status, "pending"));
    const [completed] = await db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.status, "completed"));
    const [customerCount] = await db
      .select({ n: sql<number>`count(*)` })
      .from(customers);
    const lowStock = await db
      .select()
      .from(parts)
      .where(sql`${parts.stock} <= ${parts.lowStockAt}`);
    const recentBookings = await db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(8);
    const unreadMessages = await db
      .select({ n: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.read, false));
    return {
      todayBookings: todayCount?.n ?? 0,
      pendingBookings: pending?.n ?? 0,
      completedRepairs: completed?.n ?? 0,
      customers: customerCount?.n ?? 0,
      lowStockCount: lowStock.length,
      lowStock,
      recentBookings,
      unreadMessages: unreadMessages[0]?.n ?? 0,
    };
  }),

  /* ---------- bookings ---------- */
  bookings: adminQuery
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.status && input.status !== "all") {
        return db
          .select()
          .from(bookings)
          .where(eq(bookings.status, input.status as never))
          .orderBy(desc(bookings.date), desc(bookings.timeSlot));
      }
      return db.select().from(bookings).orderBy(desc(bookings.date), desc(bookings.timeSlot));
    }),

  updateBooking: adminQuery.input(bookingInput).mutation(async ({ input }) => {
    const { id, ...data } = input;
    const set: Record<string, unknown> = {};
    if (data.status) set.status = data.status;
    if (data.date) set.date = data.date;
    if (data.timeSlot) set.timeSlot = data.timeSlot;
    if (data.priceEstimate !== undefined) set.priceEstimate = data.priceEstimate;
    if (data.warrantyUntil) set.warrantyUntil = data.warrantyUntil;
    if (data.notes !== undefined) set.notes = data.notes;
    // auto warranty: 1 year from completion for screen repairs, 90 days otherwise
    if (data.status === "completed" && !data.warrantyUntil) {
      const b = await getDb().query.bookings.findFirst({ where: eq(bookings.id, id) });
      const days = b?.repairType.toLowerCase().includes("screen") ? 365 : 90;
      set.warrantyUntil = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    }
    await getDb().update(bookings).set(set).where(eq(bookings.id, id));
    return { ok: true };
  }),

  deleteBooking: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(bookings).where(eq(bookings.id, input.id));
      return { ok: true };
    }),

  /* ---------- notifications ---------- */
  notify: adminQuery
    .input(
      z.object({
        bookingId: z.number().optional(),
        customerId: z.number().optional(),
        channel: z.enum(["sms", "email", "call"]),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb().insert(notifications).values({
        bookingId: input.bookingId ?? null,
        customerId: input.customerId ?? null,
        channel: input.channel,
        message: input.message,
      });
      return { ok: true };
    }),

  /* ---------- customers ---------- */
  customers: adminQuery
    .input(z.object({ q: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.q) {
        const q = `%${input.q}%`;
        return db
          .select()
          .from(customers)
          .where(or(like(customers.name, q), like(customers.phone, q), like(customers.email, q)))
          .orderBy(desc(customers.createdAt));
      }
      return db.select().from(customers).orderBy(desc(customers.createdAt));
    }),

  customerDetail: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const customer = await db.query.customers.findFirst({ where: eq(customers.id, input.id) });
      const history = await db
        .select()
        .from(bookings)
        .where(eq(bookings.customerId, input.id))
        .orderBy(desc(bookings.createdAt));
      const notes = await db
        .select()
        .from(customerNotes)
        .where(eq(customerNotes.customerId, input.id))
        .orderBy(desc(customerNotes.createdAt));
      const comms = await db
        .select()
        .from(notifications)
        .where(eq(notifications.customerId, input.id))
        .orderBy(desc(notifications.createdAt));
      return { customer, history, notes, comms };
    }),

  upsertCustomer: adminQuery
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        phone: z.string().min(7),
        email: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (input.id) {
        await db
          .update(customers)
          .set({ name: input.name, phone: input.phone, email: input.email || null, notes: input.notes || null })
          .where(eq(customers.id, input.id));
      } else {
        await db.insert(customers).values({
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          notes: input.notes || null,
        });
      }
      return { ok: true };
    }),

  deleteCustomer: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(customers).where(eq(customers.id, input.id));
      return { ok: true };
    }),

  addNote: adminQuery
    .input(z.object({ customerId: z.number(), note: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await getDb().insert(customerNotes).values(input);
      return { ok: true };
    }),

  /* ---------- products ---------- */
  products: adminQuery.query(async () => {
    return getDb().select().from(products).orderBy(desc(products.createdAt));
  }),

  upsertProduct: adminQuery
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        kind: z.enum(["device_new", "device_refurb", "accessory"]),
        subcategory: z.string().min(1),
        price: z.number().min(0),
        stock: z.number().min(0),
        description: z.string().optional(),
        badge: z.string().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const data = {
        name: input.name,
        kind: input.kind,
        subcategory: input.subcategory,
        price: input.price,
        stock: input.stock,
        description: input.description || null,
        badge: input.badge || null,
        active: input.active ?? true,
      };
      if (input.id) {
        await db.update(products).set(data).where(eq(products.id, input.id));
      } else {
        await db.insert(products).values(data);
      }
      return { ok: true };
    }),

  deleteProduct: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(products).where(eq(products.id, input.id));
      return { ok: true };
    }),

  /* ---------- parts inventory ---------- */
  parts: adminQuery.query(async () => {
    return getDb().select().from(parts).orderBy(parts.category, parts.name);
  }),

  upsertPart: adminQuery
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        sku: z.string().min(1),
        category: z.string().min(1),
        stock: z.number().min(0),
        lowStockAt: z.number().min(0),
        costCents: z.number().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      if (id) {
        await db.update(parts).set(data).where(eq(parts.id, id));
      } else {
        await db.insert(parts).values(data);
      }
      return { ok: true };
    }),

  deletePart: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(parts).where(eq(parts.id, input.id));
      return { ok: true };
    }),

  /* ---------- pricing management ---------- */
  prices: adminQuery.query(async () => {
    return getDb().select().from(repairPrices).orderBy(repairPrices.sortOrder);
  }),

  updatePrice: adminQuery
    .input(z.object({ id: z.number(), priceLabel: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(repairPrices)
        .set({ priceLabel: input.priceLabel })
        .where(eq(repairPrices.id, input.id));
      return { ok: true };
    }),

  /* ---------- messages ---------- */
  messages: adminQuery.query(async () => {
    return getDb().select().from(messages).orderBy(desc(messages.createdAt));
  }),

  markRead: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().update(messages).set({ read: true }).where(eq(messages.id, input.id));
      return { ok: true };
    }),

  /* ---------- reports ---------- */
  reports: adminQuery.query(async () => {
    const db = getDb();
    const since = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
    const byStatus = await db
      .select({ status: bookings.status, n: sql<number>`count(*)` })
      .from(bookings)
      .groupBy(bookings.status);
    const byType = await db
      .select({ repairType: bookings.repairType, n: sql<number>`count(*)` })
      .from(bookings)
      .groupBy(bookings.repairType)
      .orderBy(desc(sql`count(*)`))
      .limit(8);
    const byDevice = await db
      .select({ device: bookings.device, n: sql<number>`count(*)` })
      .from(bookings)
      .groupBy(bookings.device)
      .orderBy(desc(sql`count(*)`))
      .limit(8);
    const byMonth = await db
      .select({
        month: sql<string>`date_format(${bookings.createdAt}, '%Y-%m')`,
        n: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, new Date(since)))
      .groupBy(sql`date_format(${bookings.createdAt}, '%Y-%m')`)
      .orderBy(sql`date_format(${bookings.createdAt}, '%Y-%m')`);
    const inventoryValue = await db
      .select({ v: sql<number>`coalesce(sum(${parts.stock} * ${parts.costCents}), 0)` })
      .from(parts);
    const productSalesValue = await db
      .select({ v: sql<number>`coalesce(sum(${products.price} * ${products.stock}), 0)` })
      .from(products);
    const [subscriberCount] = await db
      .select({ n: sql<number>`count(*)` })
      .from(subscribers);
    const [postCount] = await db.select({ n: sql<number>`count(*)` }).from(blogPosts);
    return {
      byStatus,
      byType,
      byDevice,
      byMonth,
      inventoryValueCents: inventoryValue[0]?.v ?? 0,
      retailStockValueCents: productSalesValue[0]?.v ?? 0,
      subscribers: subscriberCount?.n ?? 0,
      blogPosts: postCount?.n ?? 0,
    };
  }),
});
