import { trpc } from "@/providers/trpc";
import { Link } from "react-router";
import { CalendarCheck, Clock, CheckCircle2, Users, AlertTriangle, Mail } from "lucide-react";

export default function Dashboard() {
  const { data } = trpc.admin.stats.useQuery();
  const cards = [
    { label: "Today's Bookings", value: data?.todayBookings, icon: CalendarCheck, to: "/admin/bookings" },
    { label: "Pending Requests", value: data?.pendingBookings, icon: Clock, to: "/admin/bookings" },
    { label: "Completed Repairs", value: data?.completedRepairs, icon: CheckCircle2, to: "/admin/bookings" },
    { label: "Customers", value: data?.customers, icon: Users, to: "/admin/customers" },
    { label: "Low-Stock Parts", value: data?.lowStockCount, icon: AlertTriangle, to: "/admin/inventory" },
    { label: "Unread Messages", value: data?.unreadMessages, icon: Mail, to: "/admin/bookings" },
  ];
  return (
    <div>
      <h1 className="font-serif text-3xl text-ink mb-8">Dashboard</h1>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="bg-white rounded-2xl border border-blush p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
            <span className="w-11 h-11 rounded-xl bg-blush grid place-items-center"><c.icon size={19} className="text-burgundy" /></span>
            <span><span className="block font-serif text-2xl">{c.value ?? "—"}</span><span className="text-xs text-ink/50">{c.label}</span></span>
          </Link>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-blush p-6">
          <h2 className="font-serif text-xl mb-4">Recent bookings</h2>
          <div className="space-y-3">
            {(data?.recentBookings ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm border-b border-blush/60 pb-3">
                <div>
                  <p className="font-medium">{b.customerName} · {b.device}</p>
                  <p className="text-xs text-ink/45">{b.repairType} — {b.date} {b.timeSlot}</p>
                </div>
                <span className={`text-[11px] px-3 py-1 rounded-full font-medium ${b.status === "pending" ? "bg-amber-100 text-amber-800" : b.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-blush text-burgundy"}`}>{b.status}</span>
              </div>
            ))}
            {(data?.recentBookings ?? []).length === 0 && <p className="text-sm text-ink/40">No bookings yet.</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-blush p-6">
          <h2 className="font-serif text-xl mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /> Low stock alerts</h2>
          <div className="space-y-3">
            {(data?.lowStock ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-blush/60 pb-3">
                <div><p className="font-medium">{p.name}</p><p className="text-xs text-ink/45">{p.sku}</p></div>
                <span className="text-[11px] px-3 py-1 rounded-full bg-red-100 text-red-700 font-medium">{p.stock} left</span>
              </div>
            ))}
            {(data?.lowStock ?? []).length === 0 && <p className="text-sm text-ink/40">All parts healthy.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
