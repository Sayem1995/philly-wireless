import { relations } from "drizzle-orm";
import { customers, customerNotes, bookings, notifications } from "./schema";

export const customersRelations = relations(customers, ({ many }) => ({
  notes: many(customerNotes),
  bookings: many(bookings),
  notifications: many(notifications),
}));

export const customerNotesRelations = relations(customerNotes, ({ one }) => ({
  customer: one(customers, {
    fields: [customerNotes.customerId],
    references: [customers.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  customer: one(customers, {
    fields: [bookings.customerId],
    references: [customers.id],
  }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  booking: one(bookings, {
    fields: [notifications.bookingId],
    references: [bookings.id],
  }),
  customer: one(customers, {
    fields: [notifications.customerId],
    references: [customers.id],
  }),
}));
