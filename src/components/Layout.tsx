import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Menu, X, Phone, MapPin, Clock, MessageCircle, Facebook, Instagram, Twitter, ArrowUp, ArrowUpRight, ShoppingBag, Wrench } from "lucide-react";
import Logo from "./Logo";
import CartDrawer from "./CartDrawer";
import { STORE, BRAND } from "@contracts/constants";
import { compactHours } from "@contracts/brand";
import { trpc } from "@/providers/trpc";
import { useCart } from "@/providers/cart";
import { toast } from "sonner";

const NAV = [
  { to: "/services", label: "Repairs" },
  { to: "/pricing", label: "Pricing" },
  { to: "/devices", label: "Devices" },
  { to: "/accessories", label: "Accessories" },
  { to: "/about", label: "Our Story" },
  { to: "/blog", label: "Journal" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Visit Us" },
];

const MOBILE_NAV = [{ to: "/", label: "Home" }, ...NAV];

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { count, openCart } = useCart();
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      {/* Brand utility strip: the shop's address and phone, not another menu. */}
      <div
        className={`hidden md:block overflow-hidden bg-ink text-blush/70 transition-all duration-500 ${
          scrolled ? "max-h-0 opacity-0" : "max-h-9 opacity-100"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 h-9 flex items-center justify-between gap-4 text-[10.5px] tracking-[0.08em]">
          <div className="flex items-center gap-4 whitespace-nowrap">
            <span className="flex items-center gap-1.5">
              <MapPin size={11} className="text-blush/60" />
              {STORE.address}
              <span className="text-blush/30">·</span>
              {STORE.city}
            </span>
            <span className="hidden lg:flex items-center gap-1.5 text-blush/50">
              <Clock size={11} />
              Mon–Fri 9–7 · Sat 10–6
            </span>
          </div>
          <div className="flex items-center gap-4 whitespace-nowrap">
            <span className="hidden xl:inline text-blush/45">Same-day repairs · Walk-ins welcome</span>
            <a href={STORE.phoneHref} className="flex items-center gap-1.5 text-blush/90 hover:text-ivory transition-colors">
              <Phone size={11} />
              {STORE.phone}
            </a>
          </div>
        </div>
      </div>

      <div
        className={`border-b transition-all duration-500 ${
          scrolled
            ? "border-blush bg-ivory/95 backdrop-blur-xl shadow-[0_10px_30px_-22px_rgba(43,26,24,0.45)]"
            : "border-blush/70 bg-ivory/95 backdrop-blur-md"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 h-[72px] flex items-center gap-5">
          <Link to="/" aria-label={`${STORE.name} home`} className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden xl:flex items-center gap-6 ml-4 border-l border-ink/10 pl-6" aria-label="Main navigation">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `group relative py-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    isActive ? "text-burgundy" : "text-ink/55 hover:text-ink"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {n.label}
                    <span
                      className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-burgundy transition-transform duration-300 ${
                        isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={openCart}
              aria-label={count > 0 ? `Open cart, ${count} item${count === 1 ? "" : "s"}` : "Open cart"}
              className="group inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/60 px-3 py-2 text-ink/70 transition-all hover:border-burgundy/30 hover:bg-white hover:text-burgundy"
            >
              <ShoppingBag size={17} />
              <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-[0.14em]">Bag</span>
              {count > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-burgundy text-ivory text-[10px] font-semibold grid place-items-center leading-none">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>

            <Link
              to="/book"
              className="hidden sm:inline-flex items-center gap-2 rounded-full bg-burgundy px-5 py-2.5 text-[12px] font-semibold text-ivory shadow-sm shadow-burgundy/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-burgundy-dark hover:shadow-md"
            >
              <Wrench size={14} />
              Book a Repair
            </Link>

            <button
              className="xl:hidden p-2 text-ink"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <nav
          className="xl:hidden max-h-[calc(100vh-72px)] overflow-y-auto border-t border-blush bg-ivory px-6 py-5 shadow-xl"
          aria-label="Mobile navigation"
        >
          <div className="grid">
            {MOBILE_NAV.map((n, i) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between border-b border-blush/60 py-3.5 text-[15px] ${
                    isActive ? "text-burgundy font-semibold" : "text-ink/70"
                  }`
                }
              >
                <span>{n.label}</span>
                <span className="font-mono text-[10px] tracking-[0.18em] text-ink/30">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </NavLink>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <a
              href={STORE.phoneHref}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-burgundy/25 px-5 py-3 text-sm font-semibold text-burgundy"
            >
              <Phone size={15} /> Call
            </a>
            <Link
              to="/book"
              onClick={() => setOpen(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-burgundy px-5 py-3 text-sm font-semibold text-ivory"
            >
              <Wrench size={15} /> Book a Repair
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const [email, setEmail] = useState("");
  const subscribe = trpc.shop.subscribe.useMutation({
    onSuccess: () => { toast.success("You're on the list — welcome!"); setEmail(""); },
    onError: () => toast.error("Please enter a valid email address."),
  });
  return (
    <footer className="relative overflow-hidden bg-[#2b0f11] text-blush/80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(127,29,29,0.55),transparent_58%),radial-gradient(ellipse_at_bottom_left,rgba(243,213,216,0.08),transparent_55%)]" />
      <div className="relative h-px bg-gradient-to-r from-transparent via-blush/40 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-5 py-16 grid md:grid-cols-4 gap-10">
        <div>
          <Logo light />
          <p className="text-sm leading-relaxed mt-5 text-blush/75">
            Fast, honest device repair in the heart of {BRAND.region}. Walk-ins welcome. Lifetime warranty on screen repairs.
          </p>
          <div className="flex gap-3 mt-6">
            {[Facebook, Instagram, Twitter].map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label="Social link"
                className="grid h-9 w-9 place-items-center rounded-full border border-blush/30 bg-white/[0.04] text-blush/80 transition-all duration-300 hover:border-blush hover:bg-blush hover:text-[#2b0f11]"
              >
                <Icon size={15} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-4 flex items-center gap-3 font-serif text-lg text-ivory">
            Visit Us
            <span className="h-px flex-1 bg-gradient-to-r from-blush/30 to-transparent" />
          </h4>
          <p className="mb-3 flex items-start gap-2.5 text-sm text-blush/80">
            <MapPin size={15} className="mt-0.5 shrink-0 text-blush" />
            <span>
              {STORE.address}
              <br />
              {STORE.city}
            </span>
          </p>
          <a href={STORE.phoneHref} className="mb-3 flex items-center gap-2.5 text-sm text-blush/80 transition-colors hover:text-ivory">
            <Phone size={15} className="text-blush" />
            {STORE.phone}
          </a>
          <p className="flex items-start gap-2.5 text-sm text-blush/75">
            <Clock size={15} className="mt-0.5 shrink-0 text-blush" />
            {compactHours(BRAND.hours)}
          </p>
        </div>

        <div>
          <h4 className="mb-4 flex items-center gap-3 font-serif text-lg text-ivory">
            Quick Links
            <span className="h-px flex-1 bg-gradient-to-r from-blush/30 to-transparent" />
          </h4>
          <div className="border-t border-blush/10">
            {[["Repair Services", "/services"], ["Pricing", "/pricing"], ["Buy Devices", "/devices"], ["Accessories", "/accessories"], ["Book a Repair", "/book"], ["FAQ", "/faq"]].map(([l, to]) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center justify-between border-b border-blush/10 py-2 text-sm text-blush/75 transition-colors hover:text-ivory"
              >
                <span>{l}</span>
                <ArrowUpRight size={12} className="opacity-0 transition-opacity group-hover:opacity-70" />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-4 flex items-center gap-3 font-serif text-lg text-ivory">
            Repair Tips, Monthly
            <span className="h-px flex-1 bg-gradient-to-r from-blush/30 to-transparent" />
          </h4>
          <p className="mb-4 text-sm text-blush/70">Battery care, price guides and shop news. No spam.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); subscribe.mutate({ email }); }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              aria-label="Email for newsletter"
              className="min-w-0 flex-1 rounded-full border border-blush/25 bg-white/[0.07] px-4 py-2.5 text-sm text-ivory placeholder:text-blush/45 focus:border-blush/70 focus:bg-white/10 focus:outline-none"
            />
            <button className="rounded-full bg-blush px-5 py-2.5 text-sm font-semibold text-[#2b0f11] transition-colors hover:bg-ivory">
              Join
            </button>
          </form>
        </div>
      </div>

      <div className="relative border-t border-blush/20">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-wrap justify-between gap-3 text-[11px] tracking-wide text-blush/50">
          <span>© {new Date().getFullYear()} {STORE.name}. All rights reserved.</span>
          <span>{STORE.address}, {STORE.city}</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo({ top: 0 }), [pathname]);
  const [top, setTop] = useState(false);
  useEffect(() => {
    const fn = () => setTop(window.scrollY > 600);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <div className="min-h-screen bg-ivory font-sans text-ink antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-ivory"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" tabIndex={-1}><Outlet /></main>
      <Footer />
      <CartDrawer />
      <a href={`https://wa.me/${BRAND.whatsapp}`} target="_blank" rel="noreferrer" aria-label="Chat with us"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-burgundy text-ivory grid place-items-center shadow-lg shadow-burgundy/30 hover:bg-burgundy-dark hover:-translate-y-1 transition-all duration-300">
        <MessageCircle size={22} />
      </a>
      <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top" tabIndex={top ? 0 : -1}
        className={`fixed bottom-24 right-6 z-40 w-11 h-11 rounded-full border border-burgundy/20 bg-ivory text-burgundy grid place-items-center shadow-md hover:bg-blush transition-all duration-300 ${top ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
