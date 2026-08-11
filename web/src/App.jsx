import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home.jsx'
import VendorPage from './pages/VendorPage.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import ServicesAdmin from './pages/ServicesAdmin.jsx'

function NotFound() {
  return (
    <div className="app">
      <div className="empty-state">
        <h2>الصفحة غير موجودة</h2>
        <Link to="/" className="link-btn">
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/barber/:slug" element={<VendorPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/settings" element={<Settings />} />
      <Route path="/dashboard/services" element={<ServicesAdmin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}