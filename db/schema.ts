import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  int,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ---------- CRM: customers ---------- */
export const customers = mysqlTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 320 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Customer = typeof customers.$inferSelect;

export const customerNotes = mysqlTable("customer_notes", {
  id: serial("id").primaryKey(),
  customerId: bigint("customerId", { mode: "number", unsigned: true }).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerNote = typeof customerNotes.$inferSelect;

/* ---------- Bookings ---------- */
export const bookings = mysqlTable("bookings", {
  id: serial("id").primaryKey(),
  customerId: bigint("customerId", { mode: "number", unsigned: true }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 320 }),
  device: varchar("device", { length: 120 }).notNull(),
  repairType: varchar("repairType", { length: 120 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  timeSlot: varchar("timeSlot", { length: 20 }).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", [
    "pending",
    "accepted",
    "in_progress",
    "completed",
    "rescheduled",
    "cancelled",
  ])
    .default("pending")
    .notNull(),
  priceEstimate: varchar("priceEstimate", { length: 40 }),
  warrantyUntil: date("warrantyUntil", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type Booking = typeof bookings.$inferSelect;

/* ---------- Notifications / communication history ---------- */
export const notifications = mysqlTable("notifications", {
  id: serial("id").primaryKey(),
  bookingId: bigint("bookingId", { mode: "number", unsigned: true }),
  customerId: bigint("customerId", { mode: "number", unsigned: true }),
  channel: mysqlEnum("channel", ["sms", "email", "call"]).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;

/* ---------- Repair pricing ---------- */
export const repairPrices = mysqlTable("repair_prices", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 40 }).notNull(), // smartphone | ipad | tablet | laptop | macbook | console
  brand: varchar("brand", { length: 60 }).notNull(),
  service: varchar("service", { length: 120 }).notNull(),
  priceLabel: varchar("priceLabel", { length: 60 }).notNull(), // "$99+" or "Call us for pricing"
  sortOrder: int("sortOrder").default(0).notNull(),
});
export type RepairPrice = typeof repairPrices.$inferSelect;

/* ---------- Products (devices + accessories) ---------- */
export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["device_new", "device_refurb", "accessory"]).notNull(),
  subcategory: varchar("subcategory", { length: 60 }).notNull(), // iPhone | iPad | Tablet | Phone Cases | ...
  price: int("price").notNull(), // cents
  stock: int("stock").default(0).notNull(),
  description: text("description"),
  badge: varchar("badge", { length: 60 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Product = typeof products.$inferSelect;

/* ---------- Repair parts inventory ---------- */
export const parts = mysqlTable("parts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  sku: varchar("sku", { length: 60 }).notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  stock: int("stock").default(0).notNull(),
  lowStockAt: int("lowStockAt").default(5).notNull(),
  costCents: int("costCents").default(0).notNull(),
});
export type Part = typeof parts.$inferSelect;

/* ---------- Blog ---------- */
export const blogPosts = mysqlTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  excerpt: varchar("excerpt", { length: 300 }).notNull(),
  content: text("content").notNull(),
  tag: varchar("tag", { length: 60 }).default("Repair Tips"),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
});
export type BlogPost = typeof blogPosts.$inferSelect;

/* ---------- Contact messages ---------- */
export const messages = mysqlTable("messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Message = typeof messages.$inferSelect;

/* ---------- Newsletter ---------- */
export const subscribers = mysqlTable("subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Subscriber = typeof subscribers.$inferSelect;
