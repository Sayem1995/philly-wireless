import { z } from "zod";
import { createRouter, publicQuery } from "./middleware.js";
import { store } from "./queries/store.js";
import { TIME_SLOTS, STORE } from "../contracts/constants.js";
import { sendEmail, staffNotificationHtml } from "./email.js";
import { notifyCustomer } from "./notifications.js";

export const shopRouter = createRouter({
  /* ---------- repair pricing ---------- */
  prices: publicQuery.query(async () => {
    return store.prices();
  }),

  /* ---------- products (devices + accessories) ---------- */
  products: publicQuery
    .input(z.object({ kind: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return store.products(input?.kind);
    }),

  /* ---------- blog ---------- */
  blogList: publicQuery.query(async () => {
    const posts = await store.blogList();
    return posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      tag: p.tag,
      publishedAt: p.publishedAt,
    }));
  }),

  blogBySlug: publicQuery
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return store.blogBySlug(input.slug);
    }),

  /* ---------- contact form ---------- */
  contact: publicQuery
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await store.createMessage({
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        message: input.message,
      });
      return { ok: true };
    }),

  /* ---------- newsletter ---------- */
  subscribe: publicQuery
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await store.subscribe(input.email);
      return { ok: true };
    }),

  /* ---------- booking: available slots for a date ---------- */
  slots: publicQuery
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(async ({ input }) => {
      const taken = (await store.bookingsByDate(input.date))
        .filter((b) => b.status !== "cancelled")
        .map((b) => b.timeSlot);
      const takenSet = new Set(taken);
      return TIME_SLOTS.map((s) => ({ slot: s, available: !takenSet.has(s) }));
    }),

  /* ---------- payment receipt (public, by capability token) ---------- */
  receiptByToken: publicQuery
    .input(z.object({ token: z.string().min(10).max(200) }))
    .query(async ({ input }) => {
      // A receipt is only readable with its unguessable token — the customer's
      // link is the authorisation.
      const r = await store.receiptByToken(input.token);
      if (!r) return null;
      return {
        id: r.id,
        customerName: r.customerName,
        device: r.device,
        repairType: r.repairType,
        lines: r.lines,
        subtotalCents: r.subtotalCents,
        taxCents: r.taxCents,
        totalCents: r.totalCents,
        paymentMethod: r.paymentMethod,
        paidAt: r.paidAt,
        notes: r.notes,
      };
    }),

  /* ---------- booking: create ---------- */
  book: publicQuery
    .input(
      z.object({
        customerName: z.string().min(1),
        phone: z.string().min(7),
        email: z.string().email().optional().or(z.literal("")),
        device: z.string().min(1),
        repairType: z.string().min(1),
        date: z.string().min(8),
        timeSlot: z.string().min(4),
        notes: z.string().optional(),
        priceEstimate: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // conflict check
      const clash = (await store.bookingsByDate(input.date)).find(
        (b) => b.timeSlot === input.timeSlot && b.status !== "cancelled",
      );
      if (clash) {
        throw new Error("That time slot was just taken — please pick another.");
      }

      // link or create CRM customer
      const existingCustomer = await store.customerByPhone(input.phone);
      const customer = existingCustomer ??
        (await store.createCustomer({
          name: input.customerName,
          phone: input.phone,
          email: input.email || null,
          notes: null,
        }));

      const booking = await store.createBooking({
        customerId: customer.id,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email || null,
        device: input.device,
        repairType: input.repairType,
        date: input.date,
        timeSlot: input.timeSlot,
        notes: input.notes || null,
        priceEstimate: input.priceEstimate || null,
        warrantyUntil: null,
      });

      // --- email confirmations (delivered if SMTP/SendGrid configured; otherwise logged to CRM) ---
      const details = {
        id: booking.id,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email || null,
        device: input.device,
        repairType: input.repairType,
        date: input.date,
        timeSlot: input.timeSlot,
        notes: input.notes || null,
      };
      // Customer gets this on every channel we hold for them (email and/or SMS);
      // the exact delivery outcome is recorded in the CRM notification history.
      await notifyCustomer(
        {
          id: booking.id,
          customerId: customer.id,
          customerName: input.customerName,
          phone: input.phone,
          email: input.email || null,
          device: input.device,
          repairType: input.repairType,
          date: input.date,
          timeSlot: input.timeSlot,
        },
        "received",
      );

      // Staff alert (email only).
      try {
        const staff = await sendEmail({
          to: process.env.STAFF_EMAIL ?? STORE.email,
          subject: `New booking #PPR-${booking.id}: ${input.device} — ${input.repairType}`,
          html: staffNotificationHtml(details),
        });
        await store.addNotification({
          bookingId: booking.id,
          customerId: customer.id,
          channel: "email",
          message: `Staff notification for #PPR-${booking.id}${staff.delivered ? " (sent)" : " (queued — email not configured)"}`,
        });
      } catch (err) {
        console.error("[email] staff notification failed:", err);
      }

      return { ok: true, bookingId: booking.id };
    }),
});