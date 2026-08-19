import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Hotel,
  Store,
  CreditCard,
  Settings2,
  ChefHat,
  ChevronDown,
  ChevronRight,
  LogOut,
  ChevronLeft,
  Building,
  Plus,
  FileText,
  Wrench
} from 'lucide-react'
import logo from '../../assets/logo.png'
import { useAuth } from '../../context/AuthContext'

const SidebarItem = ({ item, isActive, isExpanded, onToggle, isCollapsed, onClose }) => {
  const Icon = item.icon
  const hasSubItems = item.subItems && item.subItems.length > 0

  return (
    <div className="mb-0.5">
      <Link
        to={item.path || '#'}
        onClick={(e) => {
          if (hasSubItems) {
            e.preventDefault()
            onToggle()
          } else if (onClose) {
            onClose()
          }
        }}
        className={`flex items-center transition-all duration-200 group relative ${isCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-4 py-2.5'
          } rounded-xl ${isActive
            ? 'bg-white/15 text-white'
            : 'text-white/50 hover:text-white/90 hover:bg-white/8'
          }`}
      >
        <div className={`flex items-center gap-3.5 ${isCollapsed ? 'justify-center' : ''}`}>
          <Icon size={19} strokeWidth={isActive ? 2 : 1.5} />
          {!isCollapsed && (
            <span className={`text-[13px] font-medium ${isActive ? 'text-white' : 'text-white/80 group-hover:text-white'}`}>
              {item.title}
            </span>
          )}
        </div>

        {!isCollapsed && hasSubItems && (
          <div className={`${isActive ? 'text-white/70' : 'text-white/30'}`}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        )}

        {/* Tooltip for Collapsed State */}
        {isCollapsed && (
          <div className="absolute left-full ml-4 px-3 py-2 bg-[#1C2B12] text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-xl z-[100] whitespace-nowrap border border-white/10">
            {item.title}
          </div>
        )}
      </Link>

      {!isCollapsed && hasSubItems && isExpanded && (
        <div className="ml-9 mt-1 mb-2 flex flex-col gap-0.5 border-l border-white/10 pl-4">
          {item.subItems.map((sub) => {
            const isSubActive = location.pathname === sub.path;
            return (
              <Link
                key={sub.path}
                to={sub.path}
                onClick={onClose}
                className={`relative px-3 py-2 text-[13px] font-medium rounded-lg transition-all flex items-center gap-2 ${isSubActive
                  ? 'text-[#9BBF42] bg-white/10 font-bold'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
              >
                {isSubActive && <div className="w-1.5 h-1.5 rounded-full bg-[#9BBF42]"></div>}
                {sub.title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  )
}

const Sidebar = ({ isCollapsed, setIsCollapsed, onClose }) => {
  const location = useLocation()
  const { user, activeHotel } = useAuth()
  const [expandedItems, setExpandedItems] = useState(
    user?.role === 'superadmin' ? [] : ['Front Office']
  )
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  let menuItems = []

  if (user?.role === 'superadmin') {
    menuItems = [
      { title: 'Dashboard', icon: LayoutDashboard, path: '/superadmin/dashboard' },
      { title: 'Hotel Registry', icon: Building, path: '/superadmin/hotels' },
      { title: 'Add New Hotel', icon: Plus, path: '/superadmin/hotels/add' },
      { title: 'Billing Templates', icon: FileText, path: '/superadmin/billing-template' },
      { title: 'Activity Logs', icon: FileText, path: '/superadmin/activity-logs' }
    ]
  } else {
    menuItems = [
      { title: 'Overview', icon: LayoutDashboard, path: '/dashboard/overview' },
      {
        title: 'Front Office',
        icon: Hotel,
        subItems: [
          { title: 'Guest Registry', path: '/dashboard/front-office/user' },
          { title: 'Stay Overview', path: '/dashboard/front-office/stay' },
          { title: 'New Reservation', path: '/dashboard/front-office/reservation' },
          { title: 'Room Availability', path: '/dashboard/front-office/availability' },
          { title: 'Billing and Payment', path: '/dashboard/front-office/billing' },
          { title: 'Guest History', path: '/dashboard/front-office/history' },
          { title: 'GST Report', path: '/dashboard/front-office/gst' },
          { title: 'Report', path: '/dashboard/front-office/report' },
          { title: 'Service Orders (Extras)', path: '/dashboard/front-office/services' },
        ]
      }
    ];

    if (activeHotel?.hasAccounts !== false) {
      menuItems.push({
        title: 'Accounts',
        icon: CreditCard,
        subItems: [
          { title: 'Transaction History', path: '/dashboard/accounts/transactions' },
          { title: 'Hotel Expenses', path: '/dashboard/accounts/expenses' }
        ]
      });
    }

    if (activeHotel?.hasKot !== false) {
      menuItems.push({
        title: 'KOT Management',
        icon: ChefHat,
        subItems: [
          { title: 'Generate KOT', path: '/dashboard/kot/new' },
          { title: 'KOT Bills & History', path: '/dashboard/kot/list' }
        ]
      });
    }

    if (activeHotel?.hasAssets !== false) {
      menuItems.push({
        title: 'Asset Manager',
        icon: Wrench,
        subItems: [
          { title: 'Asset Dashboard', path: '/dashboard/assets' },
          { title: 'Asset Inventory', path: '/dashboard/assets/list' },
          { title: 'Maintenance Log', path: '/dashboard/assets/logs' }
        ]
      });
    }

    if (activeHotel?.hasActivityLogs !== false) {
      menuItems.push({
        title: 'Activity Logs',
        icon: FileText,
        path: '/dashboard/activity-logs'
      });
    }
  }

  useEffect(() => {
    menuItems.forEach(item => {
      if (item.subItems?.some(sub => location.pathname === sub.path)) {
        setExpandedItems(prev => prev.includes(item.title) ? prev : [...prev, item.title]);
      }
    });
  }, [location.pathname]);

  const toggleExpand = (title) => {
    setExpandedItems(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    )
  }

  return (
    <aside className="h-full w-full bg-gradient-to-b from-[#1C2B22] to-[#15250D] flex flex-col transition-all duration-500 shadow-2xl">

      {/* Header / Logo */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center p-5' : 'justify-between px-6 py-7'}`}>
        <div className="flex items-center gap-3">
          {user?.role === 'superadmin' ? (
            <>
              <img
                src="/favicon.png"
                alt="Hotel Software Logo"
                className="w-14 h-14 rounded-2xl object-cover shadow-lg shadow-[#84A63C]/20 border border-white/10 bg-white p-1"
              />
              {!isCollapsed && (
                <div>
                  <span className="text-base font-bold text-white tracking-wide block leading-tight">Hotel Software</span>
                  <span className="text-[11px] font-semibold text-white/70 block">SuperAdmin Portal</span>
                </div>
              )}
            </>
          ) : (
            <>
              <img
                src={activeHotel?.logoUrl || logo}
                alt={`${activeHotel?.name || 'Hotel'} Logo`}
                className="w-14 h-14 rounded-2xl object-cover shadow-lg shadow-[#84A63C]/20 border border-white/10 bg-white"
              />
              {!isCollapsed && (
                <div>
                  <span className="text-base font-bold text-white tracking-wide block leading-tight truncate max-w-[150px]">{activeHotel?.name || 'Hotel'}</span>
                  <span className="text-xs font-semibold text-[#84A63C] block mt-0.5 capitalize">{activeHotel?.hotelType || 'Hotel'}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className={`mx-5 h-px bg-white/8 mb-4`}></div>

      {/* Collapse Toggle Button (Desktop Only) */}
      <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute top-10 -right-3 w-6 h-6 bg-[#1C2B12] rounded-full items-center justify-center shadow-lg border border-white/10 hover:scale-110 transition-transform z-[60] text-white/50 hover:text-[#9BBF42]"
      >
        {isCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
      </button>

      <nav className={`flex-1 overflow-y-auto no-scrollbar ${isCollapsed ? 'px-3' : 'px-4'}`}>
        {!isCollapsed && (
          <p className="px-4 mb-3 text-xs font-bold text-white/70">Navigation</p>
        )}
        {menuItems.map((item) => (
          <SidebarItem
            key={item.title}
            item={item}
            isCollapsed={isCollapsed}
            isActive={location.pathname === item.path || (item.subItems?.some(s => location.pathname === s.path))}
            isExpanded={expandedItems.includes(item.title)}
            onToggle={() => toggleExpand(item.title)}
            onClose={onClose}
          />
        ))}
      </nav>

      {/* Footer / Settings & Sign Out */}
      <div className={`border-t border-white/8 ${isCollapsed ? 'p-3 flex flex-col items-center gap-1.5' : 'p-4 flex flex-col gap-1'}`}>
        {user?.role !== 'superadmin' && (
          <Link
            to="/dashboard/settings"
            onClick={onClose}
            className={`w-full flex items-center gap-3.5 rounded-xl transition-all group ${
              location.pathname === '/dashboard/settings'
                ? 'bg-white/15 text-white font-bold'
                : 'text-white/50 lg:hover:text-white/90 lg:hover:bg-white/8'
            } ${isCollapsed ? 'p-3 justify-center' : 'px-4 py-2.5'}`}
          >
            <Settings2 size={19} strokeWidth={location.pathname === '/dashboard/settings' ? 2 : 1.5} />
            {!isCollapsed && (
              <span className="text-[13px] font-medium">Settings</span>
            )}
          </Link>
        )}

        <button
          onClick={() => setShowLogoutConfirm(true)}
          className={`w-full flex items-center gap-3 rounded-xl text-white/80 hover:text-red-400 hover:bg-red-500/10 transition-all group ${isCollapsed ? 'p-3 justify-center' : 'px-4 py-2.5'
            }`}
        >
          <LogOut size={19} strokeWidth={1.5} />
          {!isCollapsed && (
            <span className="text-[13px] font-medium transition-colors">Sign Out</span>
          )}
        </button>
      </div>

      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#1C2B12]/40 backdrop-blur-sm animate-fade-in-fast">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-slide-up-fast border border-[#DDE5D0]">
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-4 shadow-sm">
                <LogOut size={28} className="translate-x-0.5" />
              </div>
              <h3 className="text-xl font-bold text-[#1A2E05]">Sign Out</h3>
              <p className="text-sm font-medium text-[#7A8A6A] mt-2 px-2 leading-relaxed">
                Are you sure you want to sign out? You will need to log back in to access the dashboard.
              </p>
            </div>
            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 border border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F0F3E8] hover:text-[#1A2E05] rounded-xl text-sm font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  window.location.href = '/login';
                  if (onClose) onClose();
                }}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-red-500/10"
              >
                Sign Out
              </button>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{
            __html: `
            @keyframes fadeInFast {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFast {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in-fast {
              animation: fadeInFast 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .animate-slide-up-fast {
              animation: slideUpFast 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}} />
        </div>,
        document.body
      )}
    </aside>
  )
}

export default Sidebar
