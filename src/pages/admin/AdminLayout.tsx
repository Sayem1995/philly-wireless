import { NavLink, Outlet, Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import Seo from "@/components/Seo";
import Logo from "@/components/Logo";
import {
  LayoutDashboard, CalendarCheck, Users, Package, Wrench,
  Tag, BarChart3, LogOut, Store,
} from "lucide-react";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/inventory", label: "Inventory", icon: Wrench },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/pricing", label: "Pricing", icon: Tag },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminLayout() {
  const { user, isAuthenticated, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  if (isLoading) return <div className="min-h-screen grid place-items-center bg-ivory text-ink/40">Loading…</div>;
  if (!isAuthenticated) return null;
  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen grid place-items-center bg-ivory px-5 text-center">
        <div>
          <h1 className="font-serif text-3xl text-ink mb-3">Staff access only</h1>
          <p className="text-ink/55 text-sm mb-6 max-w-sm">Your account doesn't have admin permissions. Ask the shop owner to grant the admin role.</p>
          <Link to="/" className="text-burgundy font-semibold hover:underline">← Back to the website</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#FAF6F2] flex">
      <Seo title="Admin — Philly Phone Repair" />
      <aside className="w-60 shrink-0 bg-ink text-blush/80 flex flex-col fixed inset-y-0 max-lg:hidden">
        <div className="p-5 border-b border-blush/10"><Logo light /></div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end as boolean | undefined}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${isActive ? "bg-burgundy text-ivory" : "hover:bg-white/5"}`}>
              <n.icon size={17} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-blush/10 space-y-1">
          <Link to="/" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm hover:bg-white/5"><Store size={16} /> View Website</Link>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm hover:bg-white/5 text-left"><LogOut size={16} /> Sign Out</button>
        </div>
      </aside>
      {/* mobile top nav */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-ink text-blush px-4 py-3 flex gap-1 overflow-x-auto">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end as boolean | undefined}
            className={({ isActive }) => `px-3.5 py-2 rounded-full text-xs whitespace-nowrap ${isActive ? "bg-burgundy text-ivory" : ""}`}>
            {n.label}
          </NavLink>
        ))}
      </div>
      <main className="flex-1 lg:ml-60 p-5 md:p-9 max-lg:pt-20">
        <Outlet />
      </main>
    </div>
  );
}
