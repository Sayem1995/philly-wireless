import { NavLink, Outlet, Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import Seo from "@/components/Seo";
import Logo from "@/components/Logo";
import { LOGIN_PATH } from "@/const";
import {
  LayoutDashboard, CalendarCheck, Users, Package, Wrench,
  Tag, BarChart3, LogOut, Store, ShoppingBag, Sparkles,
} from "lucide-react";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/assistant", label: "AI Analyst", icon: Sparkles },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/inventory", label: "Inventory", icon: Wrench },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/pricing", label: "Pricing", icon: Tag },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminLayout() {
  const { user, isAuthenticated, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  if (isLoading) return <div className="min-h-screen grid place-items-center bg-ivory text-ink/40">Loading…</div>;
  // Never render nothing: a blank screen looks like the app is broken and gives
  // the user no way forward. Show where they are and how to get in.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen grid place-items-center bg-ivory px-5 text-center">
        <div>
          <h1 className="font-serif text-2xl text-ink mb-3">Please sign in</h1>
          <p className="text-ink/55 text-sm mb-6 max-w-sm">
            The admin area needs a staff account. If you were signed in, your session may have
            expired.
          </p>
          <Link to={LOGIN_PATH} className="bg-burgundy text-ivory text-sm font-semibold px-6 py-3 rounded-full hover:bg-burgundy-dark transition-colors">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }
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
      <Seo title="Admin" noindex />
      <aside className="relative w-60 shrink-0 overflow-hidden bg-[linear-gradient(180deg,#1C1110_0%,#261615_52%,#160D0C_100%)] text-blush/75 shadow-[inset_-1px_0_0_rgba(255,255,255,0.06),24px_0_60px_-30px_rgba(36,18,16,0.55)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(120%_60%_at_10%_0%,rgba(190,74,80,0.16),transparent_60%)] before:content-[''] flex flex-col fixed inset-y-0 max-lg:hidden">
        <div className="relative z-10 p-5 border-b border-white/10"><Logo light /></div>
        <nav className="relative z-10 flex-1 overflow-y-auto p-3 space-y-1.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end as boolean | undefined}
              className={({ isActive }) => `group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] font-medium tracking-[0.01em] transition-all duration-300 ${
                isActive
                  ? "border border-white/15 bg-white/[0.09] text-ivory shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_28px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl after:absolute after:right-3.5 after:h-1.5 after:w-1.5 after:rounded-full after:bg-blush/90 after:shadow-[0_0_10px_rgba(247,225,222,0.55)] after:content-['']"
                  : "border border-transparent text-blush/60 hover:border-white/10 hover:bg-white/[0.045] hover:text-blush"
              }`}>
              <n.icon size={17} className="shrink-0" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="relative z-10 p-3 border-t border-white/10 space-y-1">
          <Link to="/" className="flex items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-[13px] text-blush/55 transition-colors hover:border-white/10 hover:bg-white/[0.05] hover:text-ivory"><Store size={16} /> View Website</Link>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-left text-[13px] text-blush/55 transition-colors hover:border-white/10 hover:bg-white/[0.05] hover:text-ivory"><LogOut size={16} /> Sign Out</button>
        </div>
      </aside>
      {/* mobile top nav */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex gap-1 overflow-x-auto border-b border-white/10 bg-[#1B1110]/95 px-4 py-3 text-blush/65 shadow-[0_12px_30px_-18px_rgba(24,12,10,0.8)] backdrop-blur-xl">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end as boolean | undefined}
            className={({ isActive }) => `whitespace-nowrap rounded-full border px-3.5 py-2 text-xs transition-colors ${
              isActive
                ? "border-white/15 bg-white/10 text-ivory shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl"
                : "border-transparent text-blush/55 hover:bg-white/[0.05] hover:text-blush"
            }`}>
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
