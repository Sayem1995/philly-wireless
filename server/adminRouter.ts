import { z } from "zod";
import { createRouter, adminQuery } from "./middleware.js";
import { store } from "./queries/store.js";

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
    const all = await store.bookings();
    const today = new Date().toISOString().slice(0, 10);
    const todayBookings = all.filter((b) => b.date === today).length;
    const pendingBookings = all.filter((b) => b.status === "pending").length;
    const completedRepairs = all.filter((b) => b.status === "completed").length;
    const customers = (await store.customers()).length;
    const lowStock = await store.lowStock();
    const recentBookings = all
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8);
    const unreadMessages = await store.unreadMessages();
    return {
      todayBookings,
      pendingBookings,
      completedRepairs,
      customers,
      lowStockCount: lowStock.length,
      lowStock,
      recentBookings,
      unreadMessages,
    };
  }),

  /* ---------- bookings ---------- */
  bookings: adminQuery
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const all = await store.bookings();
      const filtered = input?.status && input.status !== "all"
        ? all.filter((b) => b.status === input.status)
        : all;
      return filtered.sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return b.timeSlot.localeCompare(a.timeSlot);
      });
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
      const b = await store.getBooking(id);
      const days = b?.repairType.toLowerCase().includes("screen") ? 365 : 90;
      set.warrantyUntil = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    }
    await store.updateBooking(id, set as never);
    return { ok: true };
  }),

  deleteBooking: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deleteBooking(input.id);
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
      await store.addNotification({
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
      const all = await store.customers();
      if (input?.q) {
        const q = input.q.toLowerCase();
        return all.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.toLowerCase().includes(q) ||
            (c.email?.toLowerCase() ?? "").includes(q),
        );
      }
      return all;
    }),

  customerDetail: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const customer = await store.getCustomer(input.id);
      if (!customer) {
        throw new Error("Customer not found.");
      }
      const history = await store.bookingsByCustomer(input.id);
      history.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const notes = await store.customerNotes(input.id);
      const comms = await store.notifications(input.id);
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
      if (input.id) {
        await store.updateCustomer(input.id, {
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          notes: input.notes ?? null,
        });
      } else {
        await store.createCustomer({
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          notes: input.notes ?? null,
        });
      }
      return { ok: true };
    }),

  deleteCustomer: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deleteCustomer(input.id);
      return { ok: true };
    }),

  addNote: adminQuery
    .input(z.object({ customerId: z.number(), note: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await store.addCustomerNote(input);
      return { ok: true };
    }),

  /* ---------- products ---------- */
  products: adminQuery.query(async () => {
    const all = await store.adminProducts();
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
      await store.upsertProduct({
        id: input.id,
        name: input.name,
        kind: input.kind,
        subcategory: input.subcategory,
        price: input.price,
        stock: input.stock,
        description: input.description ?? null,
        badge: input.badge ?? null,
        active: input.active ?? true,
      });
      return { ok: true };
    }),

  deleteProduct: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deleteProduct(input.id);
      return { ok: true };
    }),

  /* ---------- parts inventory ---------- */
  parts: adminQuery.query(async () => {
    return store.parts();
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
      const { id, ...data } = input;
      await store.upsertPart({ id, ...data });
      return { ok: true };
    }),

  deletePart: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deletePart(input.id);
      return { ok: true };
    }),

  /* ---------- pricing management ---------- */
  prices: adminQuery.query(async () => {
    return store.prices();
  }),

  updatePrice: adminQuery
    .input(z.object({ id: z.number(), priceLabel: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await store.updatePrice(input.id, input.priceLabel);
      return { ok: true };
    }),

  /* ---------- messages ---------- */
  messages: adminQuery.query(async () => {
    return store.messages();
  }),

  markRead: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.markMessageRead(input.id);
      return { ok: true };
    }),

  /* ---------- reports ---------- */
  reports: adminQuery.query(async () => {
    const all = await store.bookings();
    const since = new Date(Date.now() - 180 * 864e5);

    const byStatus = Object.entries(
      all.reduce<Record<string, number>>((acc, b) => {
        acc[b.status] = (acc[b.status] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([status, n]) => ({ status, n }));

    const byType = Object.entries(
      all.reduce<Record<string, number>>((acc, b) => {
        acc[b.repairType] = (acc[b.repairType] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([repairType, n]) => ({ repairType, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);

    const byDevice = Object.entries(
      all.reduce<Record<string, number>>((acc, b) => {
        acc[b.device] = (acc[b.device] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([device, n]) => ({ device, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);

    const monthMap = new Map<string, number>();
    for (const b of all) {
      const d = new Date(b.createdAt);
      if (d >= since) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }
    }
    const byMonth = Array.from(monthMap.entries())
      .map(([month, n]) => ({ month, n }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const parts = await store.parts();
    const inventoryValueCents = parts.reduce((sum, p) => sum + p.stock * p.costCents, 0);

    const products = await store.adminProducts();
    const retailStockValueCents = products.reduce((sum, p) => sum + p.price * p.stock, 0);

    const subscribers = (await store.subscribers()).length;
    const blogPosts = (await store.blogList()).length;

    return {
      byStatus,
      byType,
      byDevice,
      byMonth,
      inventoryValueCents,
      retailStockValueCents,
      subscribers,
      blogPosts,
    };
  }),
});