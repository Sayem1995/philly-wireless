import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { store } from "./queries/store";
import { TIME_SLOTS, STORE } from "@contracts/constants";
import {
  sendEmail,
  bookingConfirmationHtml,
  staffNotificationHtml,
} from "./email";

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
      try {
        if (input.email) {
          const r = await sendEmail({
            to: input.email,
            subject: `Booking confirmed #PPR-${booking.id} — ${STORE.name}`,
            html: bookingConfirmationHtml(details),
          });
          await store.addNotification({
            bookingId: booking.id,
            customerId: customer.id,
            channel: "email",
            message: `Booking confirmation #PPR-${booking.id}${r.delivered ? " (sent)" : " (queued — SMTP not configured)"}`,
          });
        }
        const staff = await sendEmail({
          to: process.env.STAFF_EMAIL ?? STORE.email,
          subject: `New booking #PPR-${booking.id}: ${input.device} — ${input.repairType}`,
          html: staffNotificationHtml(details),
        });
        await store.addNotification({
          bookingId: booking.id,
          customerId: customer.id,
          channel: "email",
          message: `Staff notification for #PPR-${booking.id}${staff.delivered ? " (sent)" : " (queued — SMTP not configured)"}`,
        });
      } catch (err) {
        console.error("[email] booking notification failed:", err);
      }

      return { ok: true, bookingId: booking.id };
    }),
});