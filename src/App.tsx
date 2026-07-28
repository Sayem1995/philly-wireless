import { Routes, Route } from "react-router"
import Layout from "./components/Layout"
import Home from "./pages/Home"
import Services from "./pages/Services"
import Pricing from "./pages/Pricing"
import Devices from "./pages/Devices"
import Accessories from "./pages/Accessories"
import Booking from "./pages/Booking"
import About from "./pages/About"
import Contact from "./pages/Contact"
import Faq from "./pages/Faq"
import Blog from "./pages/Blog"
import BlogPost from "./pages/BlogPost"
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import AdminLayout from "./pages/admin/AdminLayout"
import Dashboard from "./pages/admin/Dashboard"
import AdminBookings from "./pages/admin/Bookings"
import AdminCustomers from "./pages/admin/Customers"
import AdminInventory from "./pages/admin/Inventory"
import AdminProducts from "./pages/admin/Products"
import AdminPricing from "./pages/admin/Pricing"
import AdminReports from "./pages/admin/Reports"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/accessories" element={<Accessories />} />
        <Route path="/book" element={<Booking />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="pricing" element={<AdminPricing />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
