import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Menu, X, Phone, MapPin, Clock, MessageCircle, Facebook, Instagram, Twitter, ArrowUp } from "lucide-react";
import Logo from "./Logo";
import { STORE } from "@contracts/constants";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Repair Services" },
  { to: "/pricing", label: "Pricing" },
  { to: "/devices", label: "Buy Devices" },
  { to: "/accessories", label: "Accessories" },
  { to: "/about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? "bg-ivory/90 backdrop-blur-lg shadow-[0_1px_0_rgba(127,29,29,0.08)]" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-5 h-[76px] flex items-center justify-between">
        <Link to="/" aria-label="Philly Phone Repair home"><Logo /></Link>
        <nav className="hidden lg:flex items-center gap-7" aria-label="Main navigation">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) =>
                `text-[13px] tracking-wide font-medium transition-colors hover:text-burgundy ${isActive ? "text-burgundy" : "text-ink/60"}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href={STORE.phoneHref} className="hidden md:flex items-center gap-2 text-sm font-semibold text-burgundy hover:text-burgundy-dark transition-colors">
            <Phone size={16} /> {STORE.phone}
          </a>
          <Link to="/book" className="hidden sm:inline-flex bg-burgundy text-ivory text-sm font-semibold px-6 py-3 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 hover:shadow-lg hover:shadow-burgundy/25 transition-all duration-300">
            Book a Repair
          </Link>
          <button className="lg:hidden p-2 text-ink" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden bg-ivory border-t border-blush px-6 py-4 flex flex-col gap-1 shadow-xl" aria-label="Mobile navigation">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `py-3 text-[15px] border-b border-blush/50 ${isActive ? "text-burgundy font-semibold" : "text-ink/70"}`}>
              {n.label}
            </NavLink>
          ))}
          <Link to="/book" className="mt-3 bg-burgundy text-ivory text-center font-semibold px-6 py-3.5 rounded-full">Book a Repair</Link>
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
    <footer className="bg-ink text-blush/80">
      <div className="max-w-7xl mx-auto px-5 py-16 grid md:grid-cols-4 gap-10">
        <div>
          <Logo light />
          <p className="text-sm leading-relaxed mt-5 text-blush/60">
            Fast, honest device repair in the heart of Philadelphia. Walk-ins welcome. Lifetime warranty on screen repairs.
          </p>
          <div className="flex gap-3 mt-6">
            {[Facebook, Instagram, Twitter].map((Icon, i) => (
              <a key={i} href="#" aria-label="Social link" className="w-9 h-9 rounded-full border border-blush/20 grid place-items-center hover:bg-burgundy hover:border-burgundy hover:text-ivory transition-all duration-300">
                <Icon size={15} />
              </a>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-ivory font-serif text-lg mb-4">Visit Us</h4>
          <p className="text-sm flex items-start gap-2.5 mb-3"><MapPin size={15} className="mt-0.5 shrink-0 text-blush" />{STORE.address}<br />{STORE.city}</p>
          <a href={STORE.phoneHref} className="text-sm flex items-center gap-2.5 mb-3 hover:text-ivory transition-colors"><Phone size={15} className="text-blush" />{STORE.phone}</a>
          <p className="text-sm flex items-start gap-2.5"><Clock size={15} className="mt-0.5 shrink-0 text-blush" />Mon–Fri 9–7 · Sat 10–6 · Sun 12–5</p>
        </div>
        <div>
          <h4 className="text-ivory font-serif text-lg mb-4">Quick Links</h4>
          {[["Repair Services", "/services"], ["Pricing", "/pricing"], ["Buy Devices", "/devices"], ["Accessories", "/accessories"], ["Book a Repair", "/book"], ["FAQ", "/faq"]].map(([l, to]) => (
            <Link key={to} to={to} className="block text-sm py-1.5 hover:text-ivory hover:translate-x-1 transition-all duration-300">{l}</Link>
          ))}
        </div>
        <div>
          <h4 className="text-ivory font-serif text-lg mb-4">Repair Tips, Monthly</h4>
          <p className="text-sm text-blush/60 mb-4">Battery care, price guides and shop news. No spam.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); subscribe.mutate({ email }); }}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Email for newsletter"
              className="flex-1 min-w-0 bg-white/5 border border-blush/20 rounded-full px-4 py-2.5 text-sm text-ivory placeholder:text-blush/40 focus:outline-none focus:border-blush" />
            <button className="bg-burgundy text-ivory text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-burgundy-light transition-colors">Join</button>
          </form>
        </div>
      </div>
      <div className="border-t border-blush/10">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-wrap justify-between gap-3 text-xs text-blush/40">
          <span>© {new Date().getFullYear()} Philly Phone Repair. All rights reserved.</span>
          <span>1033 Chestnut Street, Philadelphia, PA 19107</span>
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
      <Navbar />
      <main><Outlet /></main>
      <Footer />
      <a href={`https://wa.me/12155550123`} target="_blank" rel="noreferrer" aria-label="Chat with us"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-burgundy text-ivory grid place-items-center shadow-lg shadow-burgundy/30 hover:bg-burgundy-dark hover:-translate-y-1 transition-all duration-300">
        <MessageCircle size={22} />
      </a>
      <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top"
        className={`fixed bottom-24 right-6 z-40 w-11 h-11 rounded-full border border-burgundy/20 bg-ivory text-burgundy grid place-items-center shadow-md hover:bg-blush transition-all duration-300 ${top ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
