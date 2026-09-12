import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingRow, CustomerRow, PartRow } from "../server/queries/store.js";

/**
 * Router contract tests.
 *
 * The Firestore data layer (`server/queries/store.ts`) and the mailer are
 * mocked so these tests exercise the actual tRPC surface: middleware
 * (auth / role guards), Zod input validation and the public route handlers.
 *
 * `vi.mock` is hoisted above these imports by Vitest, so `appRouter` and
 * `store` below are the modules wired to the mocks.
 */

vi.mock("../server/queries/store.js", () => ({
  store: {
    prices: vi.fn(),
    products: vi.fn(),
    blogList: vi.fn(),
    blogBySlug: vi.fn(),
    createMessage: vi.fn(),
    subscribe: vi.fn(),
    bookingsByDate: vi.fn(),
    customerByPhone: vi.fn(),
    createCustomer: vi.fn(),
    createBooking: vi.fn(),
    addNotification: vi.fn(),
    // pricing management
    updatePrice: vi.fn(),
    createPrice: vi.fn(),
    deletePrice: vi.fn(),
    // admin surface
    bookings: vi.fn(),
    customers: vi.fn(),
    unreadMessages: vi.fn(),
    getBooking: vi.fn(),
    updateBooking: vi.fn(),
    parts: vi.fn(),
    lowStock: vi.fn(),
  },
}));

vi.mock("../server/email.js", () => ({
  sendEmail: vi.fn(async () => ({ delivered: false })),
  bookingConfirmationHtml: vi.fn(() => "<html>confirmation</html>"),
  staffNotificationHtml: vi.fn(() => "<html>staff</html>"),
}));

import { appRouter } from "../server/router.js";
import { store } from "../server/queries/store.js";
import { sendEmail } from "../server/email.js";

const mockedStore = vi.mocked(store);
const mockedSendEmail = vi.mocked(sendEmail);

const adminUser = {
  id: 1,
  uid: "admin-uid",
  name: "Admin",
  email: "admin@example.com",
  avatar: null,
  role: "admin" as const,
};
const regularUser = { ...adminUser, id: 2, uid: "user-uid", role: "user" as const };

/** Build a caller; `user` undefined means an anonymous request. */
function caller(user?: typeof adminUser | typeof regularUser) {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
  });
}

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  const now = new Date("2026-01-05T12:00:00Z");
  return {
    id: 1,
    customerId: 10,
    customerName: "Ada Lovelace",
    phone: "2155550100",
    email: null,
    device: "iPhone 15",
    repairType: "Screen Replacement",
    date: "2026-02-01",
    timeSlot: "10:00",
    notes: null,
    status: "pending",
    priceEstimate: null,
    warrantyUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public procedures", () => {
  it("answers ping without touching the database", async () => {
    const res = await caller().ping();
    expect(res.ok).toBe(true);
    expect(typeof res.ts).toBe("number");
  });

  it("returns repair prices from the store", async () => {
    mockedStore.prices.mockResolvedValue([
      {
        id: 1,
        category: "Phone",
        brand: "Apple",
        service: "Screen",
        priceLabel: "$129",
        sortOrder: 1,
      },
    ]);

    const res = await caller().shop.prices();
    expect(res).toHaveLength(1);
    expect(res[0].priceLabel).toBe("$129");
  });

  it("passes the product kind filter through to the store", async () => {
    mockedStore.products.mockResolvedValue([]);
    await caller().shop.products({ kind: "accessory" });
    expect(mockedStore.products).toHaveBeenCalledWith("accessory");
  });

  it("rejects a malformed newsletter email before reaching the store", async () => {
    await expect(caller().shop.subscribe({ email: "not-an-email" })).rejects.toThrow();
    expect(mockedStore.subscribe).not.toHaveBeenCalled();
  });

  it("stores a valid contact message", async () => {
    mockedStore.createMessage.mockResolvedValue(undefined);
    const res = await caller().shop.contact({
      name: "Ada",
      email: "ada@example.com",
      message: "Do you fix Pixel screens?",
    });
    expect(res).toEqual({ ok: true });
    expect(mockedStore.createMessage).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      message: "Do you fix Pixel screens?",
    });
  });

  it("returns 404-ish undefined for an unknown blog slug", async () => {
    mockedStore.blogBySlug.mockResolvedValue(undefined);
    await expect(caller().shop.blogBySlug({ slug: "nope" })).resolves.toBeUndefined();
  });
});

describe("slot availability", () => {
  it("marks every time slot available when the day is empty", async () => {
    mockedStore.bookingsByDate.mockResolvedValue([]);
    const slots = await caller().shop.slots({ date: "2026-02-01" });
    expect(slots).toHaveLength(10);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("marks taken slots unavailable and ignores cancelled bookings", async () => {
    mockedStore.bookingsByDate.mockResolvedValue([
      booking({ id: 1, timeSlot: "10:00", status: "pending" }),
      booking({ id: 2, timeSlot: "11:00", status: "cancelled" }),
    ]);

    const slots = await caller().shop.slots({ date: "2026-02-01" });
    const bySlot = new Map(slots.map((s) => [s.slot, s.available]));

    expect(bySlot.get("10:00")).toBe(false);
    expect(bySlot.get("11:00")).toBe(true);
  });
});

describe("shop.book", () => {
  const input = {
    customerName: "Ada Lovelace",
    phone: "2155550100",
    email: "ada@example.com",
    device: "iPhone 15",
    repairType: "Screen Replacement",
    date: "2026-02-01",
    timeSlot: "10:00",
  };

  it("rejects a slot that is already taken", async () => {
    mockedStore.bookingsByDate.mockResolvedValue([booking({ timeSlot: "10:00" })]);

    await expect(caller().shop.book(input)).rejects.toThrow(/just taken/i);
    expect(mockedStore.createBooking).not.toHaveBeenCalled();
  });

  it("creates the booking and emails the customer and staff", async () => {
    mockedStore.bookingsByDate.mockResolvedValue([]);
    mockedStore.customerByPhone.mockResolvedValue(undefined);
    mockedStore.createCustomer.mockResolvedValue({
      id: 7,
      name: "Ada Lovelace",
      phone: "2155550100",
      email: "ada@example.com",
      notes: null,
      createdAt: new Date(),
    } satisfies CustomerRow);
    mockedStore.createBooking.mockResolvedValue(booking({ id: 42 }));
    mockedStore.addNotification.mockResolvedValue(undefined);

    const res = await caller().shop.book(input);

    expect(res).toEqual({ ok: true, bookingId: 42 });
    expect(mockedStore.createCustomer).toHaveBeenCalledOnce();
    expect(mockedStore.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 7, date: "2026-02-01", timeSlot: "10:00" }),
    );
    // customer confirmation + staff notification
    expect(mockedSendEmail).toHaveBeenCalledTimes(2);
    expect(mockedStore.addNotification).toHaveBeenCalledTimes(2);
  });

  it("reuses an existing customer found by phone", async () => {
    mockedStore.bookingsByDate.mockResolvedValue([]);
    mockedStore.customerByPhone.mockResolvedValue({
      id: 99,
      name: "Ada Lovelace",
      phone: "2155550100",
      email: null,
      notes: null,
      createdAt: new Date(),
    } satisfies CustomerRow);
    mockedStore.createBooking.mockResolvedValue(booking({ id: 43 }));
    mockedStore.addNotification.mockResolvedValue(undefined);

    await caller().shop.book(input);

    expect(mockedStore.createCustomer).not.toHaveBeenCalled();
    expect(mockedStore.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 99 }),
    );
  });

  it("still books when email delivery blows up", async () => {
    mockedStore.bookingsByDate.mockResolvedValue([]);
    mockedStore.customerByPhone.mockResolvedValue(undefined);
    mockedStore.createCustomer.mockResolvedValue({
      id: 7,
      name: "Ada Lovelace",
      phone: "2155550100",
      email: null,
      notes: null,
      createdAt: new Date(),
    } satisfies CustomerRow);
    mockedStore.createBooking.mockResolvedValue(booking({ id: 44 }));
    mockedSendEmail.mockRejectedValue(new Error("smtp down"));

    await expect(caller().shop.book(input)).resolves.toEqual({ ok: true, bookingId: 44 });
  });

  it("rejects a too-short phone number", async () => {
    await expect(caller().shop.book({ ...input, phone: "123" })).rejects.toThrow();
    expect(mockedStore.createBooking).not.toHaveBeenCalled();
  });
});

describe("authorization", () => {
  it("blocks anonymous access to auth.me", async () => {
    await expect(caller().auth.me()).rejects.toThrow(/Authentication required/i);
  });

  it("blocks anonymous access to admin routes", async () => {
    await expect(caller().admin.stats()).rejects.toThrow(/Authentication required/i);
  });

  it("blocks a signed-in non-admin from admin routes", async () => {
    await expect(caller(regularUser).admin.stats()).rejects.toThrow(/permissions/i);
  });

  it("returns the hydrated user for an authenticated caller", async () => {
    await expect(caller(adminUser).auth.me()).resolves.toMatchObject({
      uid: "admin-uid",
      role: "admin",
    });
  });
});

describe("admin price management", () => {
  it("creates a new price row, normalising category and trimming input", async () => {
    mockedStore.createPrice.mockResolvedValue({
      id: 1105,
      category: "smartphone",
      brand: "Nothing Phone",
      service: "Screen Replacement",
      priceLabel: "From $119",
      sortOrder: 52,
    });

    const res = await caller(adminUser).admin.createPrice({
      category: "Smartphone",
      brand: "  Nothing Phone  ",
      service: " Screen Replacement ",
      priceLabel: " From $119 ",
    });

    expect(res).toEqual({ ok: true, id: 1105 });
    expect(mockedStore.createPrice).toHaveBeenCalledWith({
      category: "smartphone",
      brand: "Nothing Phone",
      service: "Screen Replacement",
      priceLabel: "From $119",
    });
  });

  it("rejects an empty field", async () => {
    await expect(
      caller(adminUser).admin.createPrice({
        category: "smartphone",
        brand: "",
        service: "Screen Replacement",
        priceLabel: "From $10",
      }),
    ).rejects.toThrow();
    expect(mockedStore.createPrice).not.toHaveBeenCalled();
  });

  it("blocks non-admins from creating prices", async () => {
    await expect(
      caller(regularUser).admin.createPrice({
        category: "smartphone",
        brand: "X",
        service: "Y",
        priceLabel: "From $1",
      }),
    ).rejects.toThrow(/permissions/i);
    expect(mockedStore.createPrice).not.toHaveBeenCalled();
  });

  it("deletes a price row", async () => {
    mockedStore.deletePrice.mockResolvedValue(undefined);
    await expect(caller(adminUser).admin.deletePrice({ id: 42 })).resolves.toEqual({ ok: true });
    expect(mockedStore.deletePrice).toHaveBeenCalledWith(42);
  });

  it("blocks non-admins from deleting prices", async () => {
    await expect(caller(regularUser).admin.deletePrice({ id: 42 })).rejects.toThrow(/permissions/i);
    expect(mockedStore.deletePrice).not.toHaveBeenCalled();
  });
});

describe("admin.updateBooking warranty rules", () => {
  /**
   * The warranty date is stored date-only (`toISOString().slice(0, 10)`), so
   * comparing it against `Date.now()` is affected by the current time of day.
   * Assert the calendar date instead, allowing for a one-day boundary.
   */
  function expectWarrantyAboutDaysAway(warrantyUntil: unknown, days: number) {
    expect(typeof warrantyUntil).toBe("string");
    const actual = Math.round(
      (new Date(`${warrantyUntil as string}T00:00:00Z`).getTime() -
        new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime()) /
        864e5,
    );
    expect(Math.abs(actual - days)).toBeLessThanOrEqual(1);
  }

  it("applies a 365-day warranty to screen repairs", async () => {
    mockedStore.getBooking.mockResolvedValue(booking({ repairType: "Screen Replacement" }));
    mockedStore.updateBooking.mockResolvedValue(undefined);

    await caller(adminUser).admin.updateBooking({ id: 1, status: "completed" });

    const [, patch] = mockedStore.updateBooking.mock.calls[0];
    expectWarrantyAboutDaysAway((patch as { warrantyUntil?: string }).warrantyUntil, 365);
  });

  it("applies a 90-day warranty to other repairs", async () => {
    mockedStore.getBooking.mockResolvedValue(booking({ repairType: "Battery Replacement" }));
    mockedStore.updateBooking.mockResolvedValue(undefined);

    await caller(adminUser).admin.updateBooking({ id: 1, status: "completed" });

    const [, patch] = mockedStore.updateBooking.mock.calls[0];
    expectWarrantyAboutDaysAway((patch as { warrantyUntil?: string }).warrantyUntil, 90);
  });

  it("respects an explicit warranty date", async () => {
    mockedStore.getBooking.mockResolvedValue(booking());
    mockedStore.updateBooking.mockResolvedValue(undefined);

    await caller(adminUser).admin.updateBooking({
      id: 1,
      status: "completed",
      warrantyUntil: "2027-01-01",
    });

    const [, patch] = mockedStore.updateBooking.mock.calls[0];
    expect((patch as { warrantyUntil?: string }).warrantyUntil).toBe("2027-01-01");
  });
});

describe("admin.lowStock reporting", () => {
  it("counts parts at or below their threshold", async () => {
    const parts: PartRow[] = [
      { id: 1, name: "Screen", sku: "S1", category: "Display", stock: 1, lowStockAt: 5, costCents: 100 },
      { id: 2, name: "Battery", sku: "B1", category: "Power", stock: 50, lowStockAt: 5, costCents: 200 },
    ];
    mockedStore.parts.mockResolvedValue(parts);
    mockedStore.lowStock.mockResolvedValue(parts.filter((p) => p.stock <= p.lowStockAt));
    mockedStore.bookings.mockResolvedValue([]);
    mockedStore.customers.mockResolvedValue([]);
    mockedStore.unreadMessages.mockResolvedValue(0);

    const stats = await caller(adminUser).admin.stats();
    expect(stats.lowStockCount).toBe(1);
  });
});
