import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../context/AuthContext'

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const location = useLocation()
  const { user, activeHotel } = useAuth()

  useEffect(() => {
    // 1. Get Section Title
    const pageTitle = getTitle(location.pathname);

    // 2. Set Document Title
    if (user?.role === 'superadmin') {
      document.title = `SuperAdmin | ${pageTitle} | HotelSoft`;
    } else {
      const hotelName = activeHotel?.name || 'Hotel';
      document.title = `${hotelName} | ${pageTitle}`;
    }

    // 3. Set Favicon
    const faviconLink = document.querySelector("link[rel~='icon']");
    if (faviconLink) {
      if (user?.role !== 'superadmin' && activeHotel?.logoUrl) {
        faviconLink.href = activeHotel.logoUrl;
      } else {
        faviconLink.href = '/favicon.png';
      }
    }
  }, [location.pathname, user, activeHotel]);

  const getTitle = (path) => {
    const titles = {
      '/dashboard/overview': 'Overview',
      '/dashboard/front-office/user': 'Guest Registry',
      '/dashboard/front-office/stay': 'Stay Overview',
      '/dashboard/front-office/reservation': 'New Reservation',
      '/dashboard/front-office/availability': 'Room Availability',
      '/dashboard/front-office/billing': 'Billing and Payment',
      '/dashboard/front-office/history': 'Guest History',
      '/dashboard/front-office/gst': 'GST Report',
      '/dashboard/front-office/report': 'Report',
      '/dashboard/kot/new': 'Generate KOT',
      '/dashboard/kot/list': 'KOT Bills & History',
      '/dashboard/kot/kitchen': 'Kitchen View',
      '/dashboard/settings': 'Hotel Settings',
      '/superadmin/billing-template': 'Billing Templates',
      '/superadmin/dashboard': 'Global Analytics Dashboard',
      '/superadmin/hotels': 'Hotel Registry',
      '/superadmin/hotels/add': 'Register Hotel'
    }
    if (titles[path]) return titles[path];
    if (path.startsWith('/superadmin/hotels/edit')) return 'Edit Hotel Profile';
    if (path.startsWith('/dashboard/front-office/guest-billing')) return 'Guest Billing Details';

    const parts = path.split('/').filter(Boolean)
    if (parts.length <= 1) return 'Dashboard'
    const lastPart = parts[parts.length - 1]
    return lastPart
      .replace(/-/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
  }

  return (
    <div className="min-h-screen bg-[#F5F7F0] font-sans text-[#1A2E05]">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-[70] transition-all duration-500 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-[76px]' : 'w-[270px]'}`}>
        <Sidebar
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <div className={`flex flex-col min-h-screen transition-all duration-500 ${isCollapsed ? 'lg:ml-[76px]' : 'lg:ml-[270px]'
        }`}>
        <Header
          title={getTitle(location.pathname)}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main
          style={{ backgroundColor: "rgba(211, 243, 214, 0.22)" }}
          className="flex-1 p-3 md:p-5 lg:p-6"
        >
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #F5F7F0;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #C4D4A4;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #84A63C;
        }
      `}} />
    </div>
  )
}

export default DashboardLayout
