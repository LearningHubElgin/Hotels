import React, { useState, useEffect } from 'react';
import {
  Users, Bed, CalendarCheck, TrendingUp, ArrowUpRight, ArrowDownRight,
  Clock, MoreHorizontal, Loader2, Check, X, Sparkles, RefreshCw,
  ChevronRight, AlertCircle, ShoppingBag, Receipt, Building2,
  Calendar, Layers, ShieldCheck, Plus, ArrowRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cleanRoomNumber } from '../../utils/roomHelper';

const StatCard = ({ title, value, change, isPositive, icon: Icon, colorTheme = 'green' }) => {
  const themeStyles = {
    green: { bg: 'from-emerald-500/10 to-teal-500/5', iconBg: 'bg-[#84A63C] text-white shadow-xs' },
    blue: { bg: 'from-blue-500/10 to-indigo-500/5', iconBg: 'bg-blue-600 text-white shadow-xs' },
    purple: { bg: 'from-purple-500/10 to-pink-500/5', iconBg: 'bg-purple-600 text-white shadow-xs' },
    amber: { bg: 'from-amber-500/10 to-orange-500/5', iconBg: 'bg-amber-600 text-white shadow-xs' },
  }[colorTheme] || { bg: 'from-[#84A63C]/10 to-[#84A63C]/5', iconBg: 'bg-[#84A63C] text-white shadow-xs' };

  return (
    <div className="relative overflow-hidden bg-white p-3.5 sm:p-4 rounded-2xl border border-[#DDE5D0] shadow-xs hover:shadow-md transition-all duration-300 group">
      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${themeStyles.bg} rounded-bl-full opacity-60 group-hover:scale-110 transition-transform duration-500 pointer-events-none`} />
      
      <div className="flex justify-between items-start mb-2.5 relative z-10">
        <div className={`p-2 rounded-xl ${themeStyles.iconBg} transition-all duration-300 group-hover:scale-105`}>
          <Icon size={16} strokeWidth={2.2} />
        </div>
        <div className={`flex items-center gap-0.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
          isPositive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
        }`}>
          {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          <span>{change}</span>
        </div>
      </div>

      <div className="relative z-10">
        <p className="text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mb-0.5">{title}</p>
        <p className="text-lg sm:text-xl font-bold text-[#1A2E05] tracking-tight">{value}</p>
      </div>
    </div>
  );
};

const RecentActivity = ({ activities, hasRoomType }) => (
  <div className="bg-white rounded-2xl border border-[#DDE5D0] shadow-xs p-4 space-y-3">
    <div className="flex items-center justify-between border-b border-[#F0F3E8] pb-3">
      <div>
        <h3 className="text-xs sm:text-sm font-bold text-[#1A2E05]">Resident Status</h3>
        <p className="text-[10px] font-semibold text-[#7A8A6A]">Live Occupancy & Guest Details</p>
      </div>
      <span className="px-2 py-0.5 bg-[#F0F3E8] text-[#4A5E38] text-[9px] font-black rounded-full uppercase tracking-wider">
        {activities.length} Active
      </span>
    </div>
    <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
      {activities.length > 0 ? activities.map((item, i) => (
        <div key={i} className="flex items-center justify-between group p-2 hover:bg-[#F5F7F0] border border-transparent hover:border-[#DDE5D0] rounded-xl transition-all">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1C2B12] text-white flex items-center justify-center font-bold text-[10px] shadow-xs shrink-0">
              {item.user ? item.user.split(' ').map(n => n[0]).join('') : 'G'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#1A2E05] truncate">{item.user}</p>
              <p className="text-[10px] font-semibold text-[#7A8A6A] truncate">
                {item.roomNumber ? (hasRoomType ? `${item.roomType || ''} Room ${item.roomNumber}` : `Room ${item.roomNumber}`) : item.room}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block ${
              item.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              {item.status}
            </span>
            <p className="text-[9px] text-[#7A8A6A] font-bold mt-0.5">{item.time}</p>
          </div>
        </div>
      )) : (
        <div className="py-8 text-center text-[#7A8A6A] text-xs font-bold italic">No Active Guests Currently</div>
      )}
    </div>
  </div>
);

// Module-level in-memory cache for instant navigation without loading lag
let overviewCache = {
  stats: null,
  rooms: null,
  billing: null
};

const Overview = () => {
  const [dateFilter, setDateFilter] = useState('Daily');
  const [data, setData] = useState(overviewCache.stats);
  const [rooms, setRooms] = useState(overviewCache.rooms || []);
  const [billingData, setBillingData] = useState(overviewCache.billing);
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(!overviewCache.stats);
  const [currentTime, setCurrentTime] = useState(new Date());

  const navigate = useNavigate();
  const { user, activeHotel } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setIsRefreshing(true);
    try {
      const [statsRes, roomsRes, billingRes] = await Promise.all([
        api.get('/analytics/dashboard').catch(() => null),
        api.get('/rooms').catch(() => null),
        api.get('/analytics/billing?page=1&limit=6').catch(() => null)
      ]);

      if (statsRes?.data?.data) {
        overviewCache.stats = statsRes.data.data;
        setData(statsRes.data.data);
      }
      if (roomsRes?.data?.data) {
        overviewCache.rooms = roomsRes.data.data;
        setRooms(roomsRes.data.data);
      }
      if (billingRes?.data?.data) {
        overviewCache.billing = billingRes.data.data;
        setBillingData(billingRes.data.data);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUpdateRoomStatus = async (roomId, newStatus) => {
    try {
      await api.put(`/rooms/${roomId}`, { status: newStatus });
      await loadDashboard();
      setSelectedRoomForStatus(null);
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update room status");
    }
  };

  const getGreeting = () => {
    const hrs = currentTime.getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parts[2];
      const d = new Date(year, monthIndex, day);
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return dateStr;
  };

  const formatTime12hr = (timeStr) => {
    if (!timeStr) return '';
    try {
      const [hourStr, minStr] = timeStr.split(':');
      const hour = parseInt(hourStr, 10);
      const min = minStr ? minStr.substring(0, 2) : '00';
      if (isNaN(hour)) return timeStr;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}:${min} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  const hasRoomType = activeHotel?.hasRoomType !== false;

  // Group rooms by floor
  const roomsByFloor = rooms.reduce((acc, r) => {
    const f = r.floor || 1;
    if (!acc[f]) acc[f] = [];
    acc[f].push(r);
    return acc;
  }, {});
  const sortedFloors = Object.keys(roomsByFloor).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-4 pb-6 text-[#1A2E05]">

      {/* Compact Modern Greeting Banner */}
      <div className="bg-gradient-to-r from-[#14230D] via-[#1C2B12] to-[#2E441F] rounded-2xl p-4 sm:p-5 text-white border border-[#DDE5D0]/10 shadow-lg relative overflow-hidden">
        {/* Ambient background blur circles */}
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#84A63C]/15 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl -mb-10 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 bg-[#84A63C]/20 border border-[#84A63C]/40 text-[#C1DF83] text-[9px] font-black tracking-widest uppercase px-2.5 py-0.5 rounded-full backdrop-blur-md">
                <Sparkles size={10} className="animate-pulse" /> Control Console
              </div>
              <div className="inline-flex items-center gap-1 bg-white/10 border border-white/15 text-white/90 text-[9px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-md">
                <Clock size={10} className="text-[#C1DF83]" />
                <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            </div>

            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white leading-snug">
              {getGreeting()}, <span className="bg-gradient-to-r from-white via-white to-[#C1DF83] bg-clip-text text-transparent">{activeHotel?.name || 'Hotel'}</span>!
            </h1>

            <p className="text-white/75 text-[11px] sm:text-xs font-medium leading-relaxed">
              Welcome to your dashboard for <span className="text-[#C1DF83] font-bold">{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>.
            </p>

            <div className="flex items-center gap-2.5 pt-0.5">
              <button
                onClick={() => navigate('/dashboard/front-office/stay')}
                className="px-3 py-1.5 bg-[#84A63C] hover:bg-[#6c8a2f] text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
              >
                <Plus size={13} /> New Check-In
              </button>
              <button
                onClick={() => loadDashboard()}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 backdrop-blur-md active:scale-95"
              >
                <RefreshCw size={12} className={isRefreshing ? "animate-spin text-[#C1DF83]" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* Compact Live Status Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0 md:w-auto">
            <div className="bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 rounded-xl text-center shadow-xs">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Available</p>
              </div>
              <p className="text-base font-black text-[#C1DF83]">{rooms.filter(r => r.status === 'available').length}</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 rounded-xl text-center shadow-xs">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Occupied</p>
              </div>
              <p className="text-base font-black text-rose-300">{rooms.filter(r => r.status === 'occupied').length}</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 rounded-xl text-center shadow-xs">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Cleaning</p>
              </div>
              <p className="text-base font-black text-blue-300">{rooms.filter(r => r.status === 'cleaning').length}</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 rounded-xl text-center shadow-xs">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Maintenance</p>
              </div>
              <p className="text-base font-black text-amber-300">{rooms.filter(r => r.status === 'maintenance').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compact KPI Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Bookings" value={data?.kpi?.totalBookings || '0'} change={data?.kpi?.totalBookingsChange || '+0%'} isPositive={data?.kpi?.totalBookingsPositive !== false} icon={CalendarCheck} colorTheme="blue" />
        <StatCard title="Available Rooms" value={data?.kpi?.availableRooms || '0/0'} change={data?.kpi?.availableRoomsChange || '+0%'} isPositive={data?.kpi?.availableRoomsPositive !== false} icon={Bed} colorTheme="green" />
        <StatCard title="Active Guests" value={data?.kpi?.activeGuests || '0'} change={data?.kpi?.activeGuestsChange || '+0%'} isPositive={data?.kpi?.activeGuestsPositive !== false} icon={Users} colorTheme="purple" />
        <StatCard title="Revenue (MTD)" value={data?.kpi?.revenue || '₹0k'} change={data?.kpi?.revenueChange || '+0%'} isPositive={data?.kpi?.revenuePositive !== false} icon={TrendingUp} colorTheme="amber" />
      </div>

      {/* Main Grid: Charts & Financial registry on left, Operational Widgets on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">

          {/* Revenue & Occupancy Bar Chart */}
          <div className="bg-white rounded-2xl border border-[#DDE5D0] shadow-xs p-4 flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A2E05]">Analytic Insights</h3>
                <p className="text-[10px] font-semibold text-[#7A8A6A]">Revenue & Occupancy Metrics Breakdown</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex bg-[#F0F3E8] p-0.5 rounded-lg border border-[#DDE5D0]">
                  {['Daily', 'Monthly'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDateFilter(tab)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                        dateFilter === tab ? 'bg-white text-[#1C2B12] shadow-xs' : 'text-[#7A8A6A] hover:text-[#1A2E05]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2.5 text-[10px] font-bold">
                  <div className="flex items-center gap-1 text-[#4A5E38]">
                    <span className="w-2 h-2 rounded-full bg-[#84A63C]" /> Revenue
                  </div>
                  <div className="flex items-center gap-1 text-[#7A8A6A]">
                    <span className="w-2 h-2 rounded-full bg-[#DDE5D0]" /> Occupancy
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full h-[240px]">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={dateFilter === 'Daily' ? (data?.dailyData || []) : (data?.monthlyData || [])}
                  margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F3E8" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#7A8A6A', fontSize: 9, fontWeight: 700 }}
                    dy={5}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#7A8A6A', fontSize: 9, fontWeight: 700 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#7A8A6A', fontSize: 9, fontWeight: 700 }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C2B12',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.2)'
                    }}
                    itemStyle={{ color: '#fff' }}
                    cursor={{ fill: '#F0F3E8', opacity: 0.5 }}
                    formatter={(value, name) => [
                      name === 'revenue' ? `₹${value}` : `${value}%`,
                      name.charAt(0).toUpperCase() + name.slice(1)
                    ]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    fill="#84A63C"
                    radius={[4, 4, 0, 0]}
                    barSize={dateFilter === 'Daily' ? 20 : 28}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="occupancy"
                    fill="#DDE5D0"
                    radius={[4, 4, 0, 0]}
                    barSize={dateFilter === 'Daily' ? 20 : 28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Financial Registry & Invoices Table */}
          <div className="bg-white rounded-2xl border border-[#DDE5D0] shadow-xs p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0F3E8] pb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A2E05]">Financial Registry & Invoices</h3>
                <p className="text-[10px] font-semibold text-[#7A8A6A]">Track live balances and pending guest checkouts</p>
              </div>
              <button
                onClick={() => navigate('/dashboard/front-office/billing')}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#5C7A1F] hover:text-[#1C2B12] bg-[#EEF4E0] border border-[#DDE5D0] px-3 py-1.5 rounded-lg transition-all"
              >
                <Receipt size={13} /> View Billing
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DDE5D0] text-[9px] font-black text-[#7A8A6A] uppercase tracking-wider bg-[#F9FAFA]">
                    <th className="py-2.5 px-2.5 rounded-l-lg">Invoice / Ref</th>
                    <th className="py-2.5 px-2.5">Guest Details</th>
                    <th className="py-2.5 px-2.5 text-right">Total Bill</th>
                    <th className="py-2.5 px-2.5 text-right">Paid</th>
                    <th className="py-2.5 px-2.5 text-right">Outstanding</th>
                    <th className="py-2.5 px-2.5 text-center rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3E8]">
                  {(() => {
                    const uniqueBills = [];
                    const seenGroups = new Set();
                    (billingData?.recentBills || []).forEach(bill => {
                      if (bill.groupBookingId) {
                        if (!seenGroups.has(bill.groupBookingId)) {
                          seenGroups.add(bill.groupBookingId);
                          if (bill.groupBookings && bill.groupBookings.length > 0) {
                            const sortedGb = [...bill.groupBookings].sort((x, y) => x.id - y.id);
                            const primaryGb = sortedGb[0];
                            const primaryBill = (billingData?.recentBills || []).find(b => b.id === primaryGb.id) || bill;
                            uniqueBills.push(primaryBill);
                          } else {
                            uniqueBills.push(bill);
                          }
                        }
                      } else {
                        uniqueBills.push(bill);
                      }
                    });

                    if (uniqueBills.length === 0) {
                      return (
                        <tr>
                          <td colSpan="6" className="py-8 text-center text-[#7A8A6A] font-bold text-xs italic">
                            No financial logs found
                          </td>
                        </tr>
                      );
                    }

                    return uniqueBills.map((bill) => {
                      let baseAmount = parseFloat(bill.totalAmount) || 0;
                      let discount = parseFloat(bill.discount) || 0;
                      let amountPaid = parseFloat(bill.amountPaid) || 0;

                      const isGroup = bill.groupBookings && bill.groupBookings.length > 1;
                      if (isGroup) {
                        baseAmount = bill.groupBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                        discount = bill.groupBookings.reduce((sum, b) => sum + Number(b.discount || 0), 0);
                        amountPaid = bill.groupBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
                      }

                      const gstOption = bill.gstOption || 'none';
                      const gstRate = Number(bill.gstRate !== undefined && bill.gstRate !== null ? bill.gstRate : 12);
                      const extraCharges = parseFloat(bill.extraCharges || 0);

                      let roomTotal = Math.max(0, baseAmount - discount);
                      if (gstOption === 'inclusive' && amountPaid > roomTotal && Math.abs(amountPaid - Math.round(roomTotal * (1 + gstRate / 100))) < 1.5) {
                        roomTotal = amountPaid;
                      }

                      let total = roomTotal + extraCharges;
                      if (gstOption === 'exclusive') {
                        const gstAmt = gstRate > 0 ? roomTotal * (gstRate / 100) : 0;
                        total = Math.round((roomTotal + gstAmt + extraCharges) * 100) / 100;
                      } else {
                        total = Math.round(total * 100) / 100;
                      }

                      const paid = Math.round(amountPaid * 100) / 100;
                      const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
                      const isFullyPaid = balance <= 0.1;

                      const roomNumbersList = isGroup
                        ? bill.groupBookings.map(b => cleanRoomNumber(b.Room?.roomNumber || b.roomId)).filter(Boolean)
                        : [];

                      return (
                        <tr key={bill.id} className="text-xs text-[#1A2E05] hover:bg-[#F5F7F0]/60 transition-colors">
                          <td className="py-2.5 px-2.5 font-bold text-[#4A5E38] whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-[#F0F3E8] rounded-md border border-[#DDE5D0] font-mono text-[10px]">
                              {bill.invoiceNumber}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-[#1A2E05] text-xs">{bill.guestName}</p>
                              {isGroup && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-extrabold uppercase tracking-wide">
                                  <Layers size={10} /> Multi-Room ({bill.groupBookings.length})
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-medium text-[#7A8A6A] mt-0.5">
                              {isGroup ? (
                                <span className="font-bold text-[#4A5E38]">
                                  Rooms: {roomNumbersList.join(', ')}
                                </span>
                              ) : (
                                bill.Room ? (hasRoomType ? `Room ${cleanRoomNumber(bill.Room.roomNumber)} (${bill.Room.type})` : `Room ${cleanRoomNumber(bill.Room.roomNumber)}`) : 'Room unassigned'
                              )}
                            </p>
                            <p className="text-[9px] font-bold text-[#5C7A1F] mt-0.5">
                              In: {formatDate(bill.checkInDate)} {bill.checkInTime ? `@ ${formatTime12hr(bill.checkInTime)}` : ''} | Out: {formatDate(bill.checkOutDate)} {bill.checkOutTime ? `@ ${formatTime12hr(bill.checkOutTime)}` : ''}
                            </p>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-bold">₹{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-2.5 text-right font-bold text-emerald-600">₹{paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className={`py-2.5 px-2.5 text-right font-black ${isFullyPaid ? 'text-emerald-700' : 'text-rose-600'}`}>
                            ₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                            <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isFullyPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
                            }`}>
                              {isFullyPaid ? 'Paid' : 'Due'}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-4">

          {/* Spatial Room Status Map */}
          <div className="bg-white rounded-2xl border border-[#DDE5D0] shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#F0F3E8] pb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A2E05]">Real-time Room Status</h3>
                <p className="text-[10px] font-semibold text-[#7A8A6A]">Live status map of all units</p>
              </div>
              <button
                onClick={() => navigate('/dashboard/front-office/availability')}
                className="p-1.5 hover:bg-[#F0F3E8] rounded-lg transition-all border border-[#DDE5D0] text-[#7A8A6A]"
                title="View Room Availability"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {sortedFloors.length > 0 ? (
                sortedFloors.map(floor => (
                  <div key={floor} className="border-b border-[#F0F3E8] last:border-b-0 pb-2">
                    <p className="text-[9px] font-black text-[#7A8A6A] mb-1.5 uppercase tracking-widest">Floor {floor}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {roomsByFloor[floor].map(room => {
                        let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
                        if (room.status === 'occupied') {
                          badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100';
                        } else if (room.status === 'maintenance') {
                          badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
                        } else if (room.status === 'cleaning') {
                          badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
                        }
                        return (
                          <button
                            type="button"
                            key={room.id}
                            onClick={() => setSelectedRoomForStatus(room)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold shadow-xs cursor-pointer hover:scale-105 active:scale-95 transition-all text-left ${badgeStyle}`}
                            title={`Room ${room.roomNumber} Status: ${room.status}. Click to change.`}
                          >
                            {room.roomNumber}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-[#7A8A6A] text-xs font-bold italic">
                  No rooms cataloged
                </div>
              )}
            </div>
          </div>

          <RecentActivity activities={data?.recentActivity || []} hasRoomType={hasRoomType} />

        </div>

      </div>

      {/* Compact Quick Actions Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { title: 'New Reservation', subtitle: 'Book guest via Stay Overview', icon: CalendarCheck, path: '/dashboard/front-office/stay' },
          { title: 'Guest Directory', subtitle: 'Search guest history & registry', icon: Users, path: '/dashboard/front-office/history' },
          { title: 'Room Maintenance', subtitle: 'Housekeeping & availability control', icon: Clock, path: '/dashboard/front-office/availability' },
        ].map((action, i) => (
          <button
            key={i}
            onClick={() => navigate(action.path)}
            className="flex items-center justify-between p-3.5 bg-white border border-[#DDE5D0] rounded-2xl text-left hover:shadow-md hover:border-[#84A63C]/30 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-[#F0F3E8] rounded-xl group-hover:bg-[#1C2B12] group-hover:text-white transition-all duration-300 text-[#4A5E38] border border-[#DDE5D0] group-hover:border-transparent shrink-0">
                <action.icon size={16} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#1A2E05] mb-0.5 truncate">{action.title}</h4>
                <p className="text-[10px] text-[#7A8A6A] truncate">{action.subtitle}</p>
              </div>
            </div>
            <div className="p-1 text-[#7A8A6A] group-hover:text-[#84A63C] group-hover:translate-x-1 transition-all shrink-0">
              <ArrowRight size={16} />
            </div>
          </button>
        ))}
      </div>

      {/* Room Status Change Modal */}
      {selectedRoomForStatus && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 border border-[#DDE5D0] shadow-xl animate-slide-up text-center relative">
            <button
              onClick={() => setSelectedRoomForStatus(null)}
              className="absolute top-3.5 right-3.5 p-1.5 hover:bg-[#F0F3E8] rounded-lg text-[#7A8A6A] hover:text-[#1A2E05] transition-all"
            >
              <X size={16} />
            </button>

            <div className="w-12 h-12 rounded-xl bg-[#F0F3E8] flex items-center justify-center mx-auto mb-3 text-[#84A63C]">
              <Bed size={22} />
            </div>

            <h3 className="text-sm font-black text-[#1A2E05]">Update Room {selectedRoomForStatus.roomNumber}</h3>
            <p className="text-[10px] font-bold text-[#7A8A6A] mt-0.5 uppercase tracking-wider mb-4">
              Current Status: <span className="text-[#84A63C]">{selectedRoomForStatus.status}</span>
            </p>

            <div className="space-y-2">
              {selectedRoomForStatus.status === 'occupied' ? (
                <div className="space-y-2.5">
                  <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl text-left text-rose-800 text-[11px] font-medium space-y-1 leading-relaxed">
                    <p className="font-extrabold text-xs text-rose-900 flex items-center gap-1"><AlertCircle size={14} /> Room is Occupied</p>
                    <p>This room has an active guest checked in. Setting it to Available manually is blocked to prevent database errors and billing mismatch. Please use Front Office Check-Out.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRoomForStatus(null);
                      navigate('/dashboard/front-office/stay');
                    }}
                    className="w-full py-2.5 px-3 bg-[#1C2B12] hover:bg-black text-white rounded-xl text-xs font-bold transition-all active:scale-[0.98] shadow-xs"
                  >
                    Go to Stay Overview
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { status: 'available', label: 'Available', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
                    { status: 'maintenance', label: 'Maintenance', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200' },
                    { status: 'cleaning', label: 'Cleaning', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' }
                  ].map(opt => (
                    <button
                      key={opt.status}
                      type="button"
                      onClick={() => handleUpdateRoomStatus(selectedRoomForStatus.id, opt.status)}
                      className={`w-full py-2.5 px-3 border rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${opt.color}`}
                    >
                      Set as {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styled overrides & animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #F0F3E8; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #84A63C; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #5C7A1F; }
      `}} />

    </div>
  );
};

export default Overview;
