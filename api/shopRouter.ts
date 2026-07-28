import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  repairPrices,
  products,
  blogPosts,
  messages,
  subscribers,
  bookings,
  customers,
} from "@db/schema";
import { eq, asc, and, ne, desc } from "drizzle-orm";
import { TIME_SLOTS, STORE } from "@contracts/constants";
import { notifications } from "@db/schema";
import {
  sendEmail,
  bookingConfirmationHtml,
  staffNotificationHtml,
} from "./email";

export const shopRouter = createRouter({
  /* ---------- repair pricing ---------- */
  prices: publicQuery.query(async () => {
    return getDb()
      .select()
      .from(repairPrices)
      .orderBy(asc(repairPrices.sortOrder));
  }),

  /* ---------- products (devices + accessories) ---------- */
  products: publicQuery
    .input(z.object({ kind: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.kind) {
        return db
          .select()
          .from(products)
          .where(
            and(eq(products.active, true), eq(products.kind, input.kind as never)),
          );
      }
      return db.select().from(products).where(eq(products.active, true));
    }),

  /* ---------- blog ---------- */
  blogList: publicQuery.query(async () => {
    return getDb()
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        tag: blogPosts.tag,
        publishedAt: blogPosts.publishedAt,
      })
      .from(blogPosts)
      .orderBy(desc(blogPosts.publishedAt));
  }),

  blogBySlug: publicQuery
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return getDb().query.blogPosts.findFirst({
        where: eq(blogPosts.slug, input.slug),
      });
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
      await getDb().insert(messages).values(input);
      return { ok: true };
    }),

  /* ---------- newsletter ---------- */
  subscribe: publicQuery
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await getDb()
        .insert(subscribers)
        .values({ email: input.email })
        .onDuplicateKeyUpdate({ set: { email: input.email } });
      return { ok: true };
    }),

  /* ---------- booking: available slots for a date ---------- */
  slots: publicQuery
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(async ({ input }) => {
      const taken = await getDb()
        .select({ timeSlot: bookings.timeSlot })
        .from(bookings)
        .where(
          and(
            eq(bookings.date, input.date),
            ne(bookings.status, "cancelled"),
          ),
        );
      const takenSet = new Set(taken.map((t) => t.timeSlot));
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
      const db = getDb();
      // conflict check
      const clash = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.date, input.date),
            eq(bookings.timeSlot, input.timeSlot),
            ne(bookings.status, "cancelled"),
          ),
        );
      if (clash.length > 0) {
        throw new Error("That time slot was just taken — please pick another.");
      }
      // link or create CRM customer
      let customerId: number | undefined;
      const existing = await db.query.customers.findFirst({
        where: eq(customers.phone, input.phone),
      });
      if (existing) {
        customerId = existing.id;
      } else {
        const [{ id }] = await db
          .insert(customers)
          .values({
            name: input.customerName,
            phone: input.phone,
            email: input.email || null,
          })
          .$returningId();
        customerId = id;
      }
      const [{ id: bookingId }] = await db
        .insert(bookings)
        .values({
          customerId,
          customerName: input.customerName,
          phone: input.phone,
          email: input.email || null,
          device: input.device,
          repairType: input.repairType,
          date: input.date,
          timeSlot: input.timeSlot,
          notes: input.notes || null,
          priceEstimate: input.priceEstimate || null,
        })
        .$returningId();

      // --- email confirmations (delivered if SMTP is configured; always logged to CRM) ---
      const details = {
        id: bookingId,
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
        const logs: (typeof notifications.$inferInsert)[] = [];
        if (input.email) {
          const r = await sendEmail({
            to: input.email,
            subject: `Booking confirmed #PPR-${bookingId} — ${STORE.name}`,
            html: bookingConfirmationHtml(details),
          });
          logs.push({
            bookingId,
            customerId,
            channel: "email",
            message: `Booking confirmation #PPR-${bookingId}${r.delivered ? " (sent)" : " (queued — SMTP not configured)"}`,
          });
        }
        const staff = await sendEmail({
          to: process.env.STAFF_EMAIL ?? STORE.email,
          subject: `New booking #PPR-${bookingId}: ${input.device} — ${input.repairType}`,
          html: staffNotificationHtml(details),
        });
        logs.push({
          bookingId,
          customerId,
          channel: "email",
          message: `Staff notification for #PPR-${bookingId}${staff.delivered ? " (sent)" : " (queued — SMTP not configured)"}`,
        });
        await db.insert(notifications).values(logs);
      } catch (err) {
        console.error("[email] booking notification failed:", err);
      }

      return { ok: true, bookingId };
    }),
});
