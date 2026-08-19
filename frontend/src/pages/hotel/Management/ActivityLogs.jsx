import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Clock, User, Layers, Shield, Monitor, Globe, Search, RefreshCw, 
  Trash2, Filter, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, CheckCircle, XCircle 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatDateDMY = (dateStr) => {
  if (!dateStr) return '';
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    return `${dd}-${mm}-${yyyy}`;
  }
  return dateStr;
};

const ActivityLogs = () => {
  const { user, activeHotel } = useAuth();
  
  // State
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [dateRangeType, setDateRangeType] = useState('30days'); // today, yesterday, 7days, 30days, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Retention cleanup state
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupDays, setCleanupDays] = useState('90');
  const [purging, setPurging] = useState(false);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    dateTime: true,
    module: true,
    action: true,
    performedBy: true,
    ipAddress: true,
    client: true,
    status: true
  });

  // Live activity stream from SSE
  const [liveActivities, setLiveActivities] = useState([]);

  // SuperAdmin hotel selection
  const [hotelsList, setHotelsList] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState('');

  // Available options for filter dropdowns
  const moduleOptions = [
    'Authentication', 'Hotel', 'Users', 'Guests', 'Rooms', 'Reservations', 
    'Billing', 'Restaurant', 'Inventory', 'Housekeeping', 'Staff', 'Settings', 'Reports'
  ];

  const roleOptions = ['superadmin', 'admin', 'manager', 'reception', 'Staff'];

  // Initialize dates based on preset range
  const getDatesForRange = (type) => {
    const today = new Date();
    let start = '';
    let end = today.toISOString().split('T')[0];

    if (type === 'today') {
      start = today.toISOString().split('T')[0];
    } else if (type === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      start = yesterday.toISOString().split('T')[0];
      end = yesterday.toISOString().split('T')[0];
    } else if (type === '7days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      start = sevenDaysAgo.toISOString().split('T')[0];
    } else if (type === '30days') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      start = thirtyDaysAgo.toISOString().split('T')[0];
    } else if (type === 'custom') {
      start = customStartDate;
      end = customEndDate;
    }
    return { startDate: start, endDate: end };
  };

  // Fetch Summary data & timeline chart series
  const fetchSummary = async () => {
    try {
      const { startDate, endDate } = getDatesForRange(dateRangeType);
      const params = {
        startDate,
        endDate,
        hotelId: reqHotelId()
      };
      const res = await api.get('/activity-logs/summary', { params });
      if (res.data?.success) {
        setSummary(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching summary stats:', err);
    }
  };

  // Get active hotel id scoping
  const reqHotelId = () => {
    if (user?.role === 'superadmin') return selectedHotelId || '';
    return user?.hotelId || '';
  };

  // Fetch Logs with pagination, search and filters
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDatesForRange(dateRangeType);
      const params = {
        page,
        limit: 15,
        search,
        startDate,
        endDate,
        hotelId: reqHotelId(),
        moduleName: selectedModule,
        action: selectedAction,
        role: selectedRole,
        status: selectedStatus
      };

      const res = await api.get('/activity-logs', { params });
      if (res.data?.success) {
        setLogs(res.data.data);
        setTotalPages(res.data.meta.totalPages);
        setTotalItems(res.data.meta.totalItems);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reset filters
  const resetFilters = () => {
    setSearch('');
    setDateRangeType('30days');
    setSelectedModule('');
    setSelectedAction('');
    setSelectedRole('');
    setSelectedStatus('');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedHotelId('');
    setPage(1);
  };

  // Setup SSE event stream
  useEffect(() => {
    // Determine exact API URL for EventSource (adds authorization bearer token)
    const token = localStorage.getItem('token');
    if (!token) return;

    const streamUrl = `${api.defaults.baseURL || 'http://localhost:5000/api'}/activity-logs/stream?token=${token}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        
        // Add to live activity feed ticker (keep maximum of 4)
        setLiveActivities(prev => {
          const updated = [log, ...prev];
          if (updated.length > 4) updated.pop();
          return updated;
        });

        // Auto-refresh summary and first page logs if user is on page 1
        fetchSummary();
        if (page === 1) {
          fetchLogs();
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection lost. Reconnecting...', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [page, dateRangeType, selectedModule, selectedAction, selectedRole, selectedStatus, search, selectedHotelId]);

  // Fetch hotels list on mount if SuperAdmin
  useEffect(() => {
    if (user?.role === 'superadmin') {
      const fetchHotels = async () => {
        try {
          const res = await api.get('/hotels');
          if (res.data?.success) {
            setHotelsList(res.data.data);
          }
        } catch (err) {
          console.error('Error fetching hotels list:', err);
        }
      };
      fetchHotels();
    }
  }, [user]);

  // Handle queries trigger
  useEffect(() => {
    fetchSummary();
    fetchLogs();
  }, [page, dateRangeType, selectedModule, selectedAction, selectedRole, selectedStatus, customStartDate, customEndDate, activeHotel, selectedHotelId]);

  // Execute Retention Pruning
  const handleCleanup = async () => {
    setPurging(true);
    try {
      const res = await api.post('/activity-logs/cleanup', { retentionDays: cleanupDays });
      if (res.data?.success) {
        alert(res.data.message);
        setShowCleanupModal(false);
        fetchSummary();
        fetchLogs();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Pruning operation failed.');
    } finally {
      setPurging(false);
    }
  };

  // Toggle Row Expansion
  const toggleRow = (id) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  // Export CSV
  const exportToCSV = () => {
    if (logs.length === 0) return alert('No log records available to export.');

    const headers = ['Log ID', 'Module', 'Action', 'Entity Type', 'Entity Name', 'Performed By', 'Role', 'Date', 'Time', 'IP Address', 'OS', 'Browser', 'Status'];
    const csvRows = [
      headers.join(','),
      ...logs.map(l => [
        l.id,
        `"${l.moduleName}"`,
        `"${l.action}"`,
        `"${l.entityType}"`,
        `"${l.entityName || 'N/A'}"`,
        `"${l.performedByName}"`,
        `"${l.performedByRole}"`,
        formatDateDMY(l.date),
        l.time,
        l.ipAddress,
        `"${l.operatingSystem}"`,
        `"${l.browser}"`,
        l.status
      ].join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `activity_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF
  const exportToPDF = () => {
    if (logs.length === 0) return alert('No log records available to export.');
    
    const doc = new jsPDF('l', 'pt');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`Audit Trail logs - ${activeHotel?.name || 'HotelSoft'}`, 40, 40);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 40, 55);

    const tableRows = logs.map(l => [
      `${formatDateDMY(l.date)} ${l.time}`,
      l.moduleName,
      l.action,
      `${l.performedByName} (${l.performedByRole})`,
      l.ipAddress,
      `${l.browser} / ${l.operatingSystem}`,
      l.status.toUpperCase()
    ]);

    autoTable(doc, {
      head: [['Date/Time', 'Module', 'Action', 'Performed By', 'IP Address', 'Client details', 'Status']],
      body: tableRows,
      startY: 75,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [74, 94, 56], textColor: [255, 255, 255] }
    });

    doc.save(`audit_logs_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 pb-12 text-[#1A2E05]">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#1A2E05] uppercase tracking-wider flex items-center gap-2">
            <Activity className="text-[#84A63C]" size={28} /> Enterprise Audit Trail
          </h1>
          <p className="text-[#7A8A6A] text-xs mt-1">
            Centralized activity logging system tracking system operations, user auths, and modifications.
          </p>
        </div>
        
        <div className="flex gap-2.5 flex-wrap">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
            <button onClick={exportToCSV} className="px-3 py-2 text-xs font-bold text-[#4A5E38] hover:bg-gray-50 border-r border-gray-100 flex items-center gap-1">
              <FileSpreadsheet size={14} /> CSV
            </button>
            <button onClick={exportToPDF} className="px-3 py-2 text-xs font-bold text-[#4A5E38] hover:bg-gray-50 flex items-center gap-1">
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* Live Activity Feed Broadcast Alert Ticker */}
      {liveActivities.length > 0 && (
        <div className="bg-[#1C2B12] text-white p-4 rounded-2xl shadow-lg border border-[#84A63C]/30 animate-pulse-slow">
          <div className="flex items-center gap-2 mb-2 text-[10px] font-black uppercase text-[#9BBF42] tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
            Live Activity Monitor
          </div>
          <div className="space-y-2">
            {liveActivities.map((act) => (
              <div key={act.id} className="text-xs flex items-center justify-between border-b border-white/5 pb-1 last:border-0 last:pb-0">
                <span className="font-semibold text-white/95">{act.performedByName} ({act.performedByRole})</span>
                <span className="text-[#9BBF42] font-black">{act.action}</span>
                <span className="text-white/60 text-[10px]">{act.moduleName} • {act.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600"><Clock size={20} /></div>
            <div>
              <div className="text-[10px] font-black text-[#7A8A6A] uppercase">Today's Logs</div>
              <div className="text-lg font-black text-[#1A2E05]">{summary.stats.todayLogs}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600"><Layers size={20} /></div>
            <div>
              <div className="text-[10px] font-black text-[#7A8A6A] uppercase">Total Logs</div>
              <div className="text-lg font-black text-[#1A2E05]">{summary.stats.totalLogs}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-green-50 text-emerald-600"><CheckCircle size={20} /></div>
            <div>
              <div className="text-[10px] font-black text-[#7A8A6A] uppercase">Successful</div>
              <div className="text-lg font-black text-emerald-600">{summary.stats.successLogs}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-50 text-rose-600"><XCircle size={20} /></div>
            <div>
              <div className="text-[10px] font-black text-[#7A8A6A] uppercase">Failed</div>
              <div className="text-lg font-black text-rose-600">{summary.stats.failedLogs}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 col-span-2 lg:col-span-1">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600"><User size={20} /></div>
            <div className="truncate">
              <div className="text-[10px] font-black text-[#7A8A6A] uppercase">Most Active User</div>
              <div className="text-sm font-black text-[#1A2E05] truncate">
                {summary.stats.mostActiveUser ? summary.stats.mostActiveUser.performedByName : 'None'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Timeline Chart */}
      {summary?.timeline && summary.timeline.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-xs font-black text-[#1A2E05] uppercase tracking-wider mb-4">Activity Timeline</h3>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height={176}>
              <AreaChart data={summary.timeline}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#84A63C" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#84A63C" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" stroke="#94A3B8" fontSize={9} tickFormatter={(val) => formatDateDMY(val)} />
                <YAxis stroke="#94A3B8" fontSize={9} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Activities" stroke="#84A63C" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Advanced Filter and Search Bar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          
          {/* Global Search */}
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8A6A]" size={16} />
            <input 
              type="text" 
              placeholder="Search by Guest, Invoice, Reservation, Phone, Username..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-[#1A2E05] focus:outline-none focus:border-[#84A63C] placeholder-gray-400 bg-[#F9FAFA] focus:bg-white transition-all"
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            {user?.role === 'superadmin' && (
              <select
                value={selectedHotelId}
                onChange={(e) => { setSelectedHotelId(e.target.value); setPage(1); }}
                className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-black text-[#1A2E05] bg-white focus:outline-none focus:border-[#84A63C] max-w-[200px]"
              >
                <option value="">All Hotels</option>
                {hotelsList.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}

            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 md:flex-initial px-4 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${showFilters ? 'bg-gray-50' : 'bg-white'}`}
            >
              <Filter size={14} /> {showFilters ? 'Hide Filters' : 'More Filters'}
            </button>
            
            <select
              value={dateRangeType}
              onChange={(e) => { setDateRangeType(e.target.value); setPage(1); }}
              className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-black text-[#1A2E05] bg-white focus:outline-none focus:border-[#84A63C]"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Dynamic Custom Date Picker */}
        {dateRangeType === 'custom' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase">Start Date</label>
              <input 
                type="date" 
                value={customStartDate} 
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase">End Date</label>
              <input 
                type="date" 
                value={customEndDate} 
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-bold"
              />
            </div>
          </div>
        )}

        {/* Extended filters */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase">Module</label>
              <select
                value={selectedModule}
                onChange={(e) => { setSelectedModule(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none"
              >
                <option value="">All Modules</option>
                {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase">Performed Role</label>
              <select
                value={selectedRole}
                onChange={(e) => { setSelectedRole(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none"
              >
                <option value="">All Roles</option>
                {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase">Action Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase text-right block">Table Columns</label>
              <div className="flex gap-2 flex-wrap justify-end">
                <button 
                  onClick={() => setVisibleColumns(prev => ({ ...prev, client: !prev.client }))}
                  className={`px-2.5 py-1.5 border rounded-lg text-[9px] font-bold ${visibleColumns.client ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                >
                  Show Browser
                </button>
                <button 
                  onClick={() => setVisibleColumns(prev => ({ ...prev, ipAddress: !prev.ipAddress }))}
                  className={`px-2.5 py-1.5 border rounded-lg text-[9px] font-bold ${visibleColumns.ipAddress ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                >
                  Show IP
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Logs Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/75 border-b border-gray-100 text-[#4A5E38] text-[10px] font-black uppercase tracking-wider">
                <th className="w-6 px-4 py-3"></th>
                {visibleColumns.dateTime && <th className="px-4 py-3">Date / Time</th>}
                {visibleColumns.module && <th className="px-4 py-3">Module</th>}
                {visibleColumns.action && <th className="px-4 py-3">Action</th>}
                {visibleColumns.performedBy && <th className="px-4 py-3">Performed By</th>}
                {visibleColumns.ipAddress && <th className="px-4 py-3">IP Address</th>}
                {visibleColumns.client && <th className="px-4 py-3">Device / Browser</th>}
                {visibleColumns.status && <th className="px-4 py-3">Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs font-semibold text-[#1A2E05]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#7A8A6A] font-bold">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} /> Loading activity audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#7A8A6A] font-bold">
                    No activity logs match your search filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const hasValues = log.oldValue || log.newValue || (log.changedFields && log.changedFields.length > 0);

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        onClick={() => hasValues && toggleRow(log.id)}
                        className={`hover:bg-[#F9FAFA]/50 transition-colors ${hasValues ? 'cursor-pointer' : ''}`}
                      >
                        <td className="px-4 py-3 text-center">
                          {hasValues && (
                            isExpanded ? <ChevronDown size={14} className="text-[#7A8A6A]" /> : <ChevronRight size={14} className="text-[#7A8A6A]" />
                          )}
                        </td>
                        {visibleColumns.dateTime && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div>{formatDateDMY(log.date)}</div>
                            <div className="text-[10px] text-[#7A8A6A] mt-0.5">{log.time}</div>
                          </td>
                        )}
                        {visibleColumns.module && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-black text-[#4A5E38]">
                              {log.moduleName}
                            </span>
                          </td>
                        )}
                        {visibleColumns.action && (
                          <td className="px-4 py-3 font-bold">
                            <div>{log.action}</div>
                            <div className="text-[10px] text-[#7A8A6A] font-medium mt-0.5">{log.description}</div>
                          </td>
                        )}
                        {visibleColumns.performedBy && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold">{log.performedByName}</div>
                            <div className="text-[10px] text-emerald-600 font-extrabold capitalize">{log.performedByRole}</div>
                          </td>
                        )}
                        {visibleColumns.ipAddress && (
                          <td className="px-4 py-3 whitespace-nowrap font-medium font-mono text-[#4A5E38]">
                            {log.ipAddress}
                          </td>
                        )}
                        {visibleColumns.client && (
                          <td className="px-4 py-3 whitespace-nowrap text-[#7A8A6A]">
                            <div className="flex items-center gap-1">
                              <Monitor size={10} /> <span>{log.operatingSystem} ({log.device})</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] mt-0.5">
                              <Globe size={10} /> <span>{log.browser}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.status && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              log.success 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>
                              {log.success ? 'Success' : 'Failed'}
                            </span>
                          </td>
                        )}
                      </tr>

                      {/* Expandable old vs new values block */}
                      {isExpanded && hasValues && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              
                              {/* Before state */}
                              <div className="bg-white p-3 rounded-xl border border-gray-150">
                                <h4 className="text-[10px] font-black text-rose-600 uppercase mb-2 flex items-center gap-1">
                                  ❌ Before Update / State
                                </h4>
                                {log.oldValue ? (
                                  <pre className="text-[10px] font-mono bg-gray-50 p-2.5 rounded-lg overflow-x-auto text-gray-600 max-h-48">
                                    {JSON.stringify(log.oldValue, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">No record existed before this action.</span>
                                )}
                              </div>

                              {/* After state */}
                              <div className="bg-white p-3 rounded-xl border border-gray-150">
                                <h4 className="text-[10px] font-black text-emerald-600 uppercase mb-2 flex items-center gap-1">
                                  ✅ After Update / State
                                </h4>
                                {log.newValue ? (
                                  <pre className="text-[10px] font-mono bg-gray-50 p-2.5 rounded-lg overflow-x-auto text-gray-700 max-h-48">
                                    {JSON.stringify(log.newValue, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">Record deleted or no new state produced.</span>
                                )}
                              </div>

                            </div>

                            {/* Changed Fields list */}
                            {log.changedFields && log.changedFields.length > 0 && (
                              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-black text-[#4A5E38] uppercase">Modified Fields:</span>
                                {log.changedFields.map(field => (
                                  <span key={field} className="px-2 py-0.5 bg-[#84A63C]/10 text-[#4A5E38] font-bold rounded text-[9px]">
                                    {field}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-white">
            <div className="text-xs text-[#7A8A6A] font-bold">
              Showing {logs.length} of {totalItems} log records
            </div>
            
            <div className="flex gap-1">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              
              <div className="px-3 py-1.5 text-xs font-black text-[#1A2E05]">
                Page {page} of {totalPages}
              </div>

              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Retention Pruning Cleanup Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-6 max-w-md w-full space-y-4">
            <div>
              <h3 className="text-lg font-black text-rose-600 uppercase tracking-wider">Purge Audit Log Retention</h3>
              <p className="text-xs text-[#7A8A6A] mt-1">
                Removes older activity logs to optimize database performance. This action is irreversible.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#4A5E38] uppercase block">Delete logs older than:</label>
              <select 
                value={cleanupDays} 
                onChange={(e) => setCleanupDays(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-[#1A2E05]"
              >
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="180">180 Days</option>
                <option value="365">365 Days</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setShowCleanupModal(false)}
                className="flex-1 py-2.5 border border-gray-200 text-[#7A8A6A] hover:bg-gray-50 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleCleanup}
                disabled={purging}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                {purging ? 'Purging...' : 'Execute Purge'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ActivityLogs;
