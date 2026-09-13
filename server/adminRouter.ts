import { z } from "zod";
import { createRouter, adminQuery } from "./middleware.js";
import { store } from "./queries/store.js";
import { sendEmail, receiptHtml, messageHtml } from "./email.js";
import { sendSms } from "./sms.js";
import { env } from "./lib/env.js";
import { STORE } from "../contracts/constants.js";
import {
  notifyCustomer,
  type CustomerNotificationKind,
} from "./notifications.js";

/** Status changes worth telling the customer about. "pending" is the default. */
const CUSTOMER_NOTIFIABLE_STATUSES = [
  "accepted",
  "in_progress",
  "completed",
  "rescheduled",
  "cancelled",
];

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
    const existing = await store.getBooking(id);

    const set: Record<string, unknown> = {};
    if (data.status) set.status = data.status;
    if (data.date) set.date = data.date;
    if (data.timeSlot) set.timeSlot = data.timeSlot;
    if (data.priceEstimate !== undefined) set.priceEstimate = data.priceEstimate;
    if (data.warrantyUntil) set.warrantyUntil = data.warrantyUntil;
    if (data.notes !== undefined) set.notes = data.notes;

    // auto warranty: 1 year from completion for screen repairs, 90 days otherwise
    if (data.status === "completed" && !data.warrantyUntil) {
      const days = existing?.repairType.toLowerCase().includes("screen") ? 365 : 90;
      set.warrantyUntil = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    }

    await store.updateBooking(id, set as never);

    // Tell the customer — but only when the status genuinely changed, so
    // re-saving an edit (notes, price) doesn't spam them.
    const statusChanged =
      Boolean(data.status) && Boolean(existing) && existing!.status !== data.status;

    if (statusChanged && existing && CUSTOMER_NOTIFIABLE_STATUSES.includes(data.status as string)) {
      await notifyCustomer(
        {
          id: existing.id,
          customerId: existing.customerId,
          customerName: existing.customerName,
          phone: existing.phone,
          email: existing.email,
          device: existing.device,
          repairType: existing.repairType,
          date: (data.date as string) ?? existing.date,
          timeSlot: (data.timeSlot as string) ?? existing.timeSlot,
          warrantyUntil: (set.warrantyUntil as string) ?? existing.warrantyUntil,
        },
        data.status as CustomerNotificationKind,
      );
    }

    return { ok: true, notifiedCustomer: statusChanged };
  }),

  deleteBooking: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deleteBooking(input.id);
      return { ok: true };
    }),

  /* ---------- payment receipts ---------- */
  receipts: adminQuery.query(async () => {
    return store.receipts();
  }),

  receiptForBooking: adminQuery
    .input(z.object({ bookingId: z.number() }))
    .query(async ({ input }) => {
      return (await store.receiptByBooking(input.bookingId)) ?? null;
    }),

  /** Record a payment against a booking and issue the customer a receipt. */
  createReceipt: adminQuery
    .input(
      z.object({
        bookingId: z.number(),
        lines: z
          .array(
            z.object({
              description: z.string().min(1).max(120),
              amountCents: z.number().int().min(0).max(10_000_000),
            }),
          )
          .min(1)
          .max(10),
        taxCents: z.number().int().min(0).max(1_000_000).optional(),
        paymentMethod: z.enum(["cash", "card", "zelle", "check", "other"]),
        paidAt: z.string().min(8).optional(),
        notes: z.string().max(600).optional(),
        emailCustomer: z.boolean().optional(),
        markCompleted: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const booking = await store.getBooking(input.bookingId);
      if (!booking) throw new Error("Booking not found.");

      const lines = input.lines.map((l) => ({
        description: l.description.trim(),
        amountCents: l.amountCents,
      }));
      const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
      const taxCents = input.taxCents ?? 0;
      const totalCents = subtotalCents + taxCents;
      const paidAt = input.paidAt || new Date().toISOString().slice(0, 10);

      const receipt = await store.createReceipt({
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: booking.customerName,
        phone: booking.phone,
        email: booking.email,
        device: booking.device,
        repairType: booking.repairType,
        lines,
        subtotalCents,
        taxCents,
        totalCents,
        paymentMethod: input.paymentMethod,
        paidAt,
        notes: input.notes?.trim() || null,
      });

      // Optionally close the booking out at the same time.
      if (input.markCompleted && booking.status !== "completed") {
        await store.updateBooking(booking.id, { status: "completed" } as never);
      }

      const url = env.publicSiteUrl
        ? `${env.publicSiteUrl.replace(/\/$/, "")}/receipt/${receipt.token}`
        : null;

      let emailed = false;
      if (input.emailCustomer !== false && booking.email) {
        try {
          const r = await sendEmail({
            to: booking.email,
            subject: `Payment receipt #PPR-R${receipt.id} — ${STORE.name}`,
            html: receiptHtml({
              id: receipt.id,
              customerName: receipt.customerName,
              device: receipt.device,
              repairType: receipt.repairType,
              lines: receipt.lines,
              subtotalCents,
              taxCents,
              totalCents,
              paymentMethod: receipt.paymentMethod,
              paidAt: receipt.paidAt,
              notes: receipt.notes,
              url,
            }),
          });
          emailed = r.delivered;
          await store.addNotification({
            bookingId: booking.id,
            customerId: booking.customerId,
            channel: "email",
            message: `Receipt #PPR-R${receipt.id} for ${(totalCents / 100).toFixed(2)}${r.delivered ? " (sent)" : " (queued — email not configured)"}`,
          });
        } catch (err) {
          console.error("[receipt] email failed:", err);
          await store.addNotification({
            bookingId: booking.id,
            customerId: booking.customerId,
            channel: "email",
            message: `Receipt #PPR-R${receipt.id} (failed — ${err instanceof Error ? err.message : "unknown error"})`,
          });
        }
      }

      return { ok: true, id: receipt.id, totalCents, emailed, url };
    }),

  deleteReceipt: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deleteReceipt(input.id);
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
      // Work out how to reach the customer. Previously this only wrote a log
      // row while the UI reported "sent" — so a message could look delivered
      // when nothing had left the building.
      let toEmail: string | null = null;
      let toPhone: string | null = null;
      const bookingId = input.bookingId ?? null;
      let customerId = input.customerId ?? null;

      if (input.bookingId !== undefined) {
        const b = await store.getBooking(input.bookingId);
        if (b) {
          toEmail = b.email;
          toPhone = b.phone;
          customerId = customerId ?? b.customerId;
        }
      }
      if (!toEmail && !toPhone && input.customerId !== undefined) {
        const c = await store.getCustomer(input.customerId);
        if (c) {
          toEmail = c.email;
          toPhone = c.phone;
        }
      }

      // A phone call is made by a human — there is nothing to dispatch.
      if (input.channel === "call") {
        await store.addNotification({
          bookingId,
          customerId,
          channel: "call",
          message: `${input.message} (logged — call to be made by staff)`,
        });
        return { ok: true, delivered: false, channel: "call" as const, reason: "manual" as const };
      }

      let delivered = false;
      let reason: "sent" | "not_configured" | "failed" | "no_contact" = "no_contact";

      if (input.channel === "email") {
        if (toEmail) {
          try {
            const r = await sendEmail({
              to: toEmail,
              subject: `${STORE.name} — about your repair`,
              html: messageHtml(input.message),
            });
            delivered = r.delivered;
            reason = r.delivered ? "sent" : "not_configured";
          } catch (err) {
            console.error("[notify] admin email failed:", err);
            reason = "failed";
          }
        }
      } else if (toPhone) {
        try {
          const r = await sendSms({
            to: toPhone,
            body: `${STORE.name}: ${input.message}`,
          });
          delivered = r.delivered;
          reason = r.delivered ? "sent" : "not_configured";
        } catch (err) {
          console.error("[notify] admin sms failed:", err);
          reason = "failed";
        }
      }

      const outcome =
        reason === "sent"
          ? "(sent)"
          : reason === "no_contact"
            ? "(not sent — no email/phone on file for this customer)"
            : reason === "failed"
              ? "(failed — check provider configuration)"
              : `(queued — ${input.channel} not configured)`;

      await store.addNotification({
        bookingId,
        customerId,
        channel: input.channel,
        message: `${input.message} ${outcome}`,
      });

      return { ok: true, delivered, channel: input.channel, reason };
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

  /** Add a new model / repair to the public price list. */
  createPrice: adminQuery
    .input(
      z.object({
        category: z.string().min(1).max(40),
        brand: z.string().min(1).max(80),
        service: z.string().min(1).max(80),
        priceLabel: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ input }) => {
      const row = await store.createPrice({
        category: input.category.trim().toLowerCase(),
        brand: input.brand.trim(),
        service: input.service.trim(),
        priceLabel: input.priceLabel.trim(),
      });
      return { ok: true, id: row.id };
    }),

  deletePrice: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await store.deletePrice(input.id);
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