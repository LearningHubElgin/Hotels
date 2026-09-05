import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, ArrowUpRight, ArrowDownRight,
  CreditCard, DollarSign, Loader2, Download,
  Wallet, Globe, Layers, CalendarDays, CalendarRange, Building, ChevronDown, ChevronUp, X, Edit3, Lock,
  Plus, Landmark, Trash2
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { formatTime12hr } from '../../../utils/roomHelper';

// --- Timezone-safe date helpers (avoid UTC offset shifting the date by a day) ---
const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const Transactions = () => {
  const { activeHotel, refreshHotel } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [selectedBankTab, setSelectedBankTab] = useState('All');

  // Opening balance state & modal
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [openingBankInput, setOpeningBankInput] = useState('');
  const [bankBalancesState, setBankBalancesState] = useState({});
  const [customBankName, setCustomBankName] = useState('');
  const [showAddCustomBank, setShowAddCustomBank] = useState(false);
  const [savingOpening, setSavingOpening] = useState(false);

  const configuredBanks = useMemo(() => {
    const fromHotel = activeHotel?.onlinePaymentBanks
      ? activeHotel.onlinePaymentBanks.split(',').map(b => b.trim()).filter(Boolean)
      : ['Paytm', 'GPay', 'SBI', 'PhonePe', 'HDFC', 'ICICI'];
    let fromStored = [];
    try {
      if (activeHotel?.bankOpeningBalances) {
        const obj = typeof activeHotel.bankOpeningBalances === 'string' ? JSON.parse(activeHotel.bankOpeningBalances) : activeHotel.bankOpeningBalances;
        fromStored = Object.keys(obj || {});
      }
    } catch (e) {
      fromStored = [];
    }
    const set = new Set([...fromHotel, ...fromStored]);
    return Array.from(set);
  }, [activeHotel]);

  const bankOpeningMap = useMemo(() => {
    try {
      if (!activeHotel?.bankOpeningBalances) return {};
      if (typeof activeHotel.bankOpeningBalances === 'object') return activeHotel.bankOpeningBalances;
      return JSON.parse(activeHotel.bankOpeningBalances);
    } catch (e) {
      return {};
    }
  }, [activeHotel]);

  useEffect(() => {
    if (activeHotel) {
      setOpeningCashInput(activeHotel.openingCashBalance !== undefined && activeHotel.openingCashBalance !== null ? String(activeHotel.openingCashBalance) : '0');

      let parsedMap = {};
      try {
        if (activeHotel.bankOpeningBalances) {
          parsedMap = typeof activeHotel.bankOpeningBalances === 'string' ? JSON.parse(activeHotel.bankOpeningBalances) : activeHotel.bankOpeningBalances;
        }
      } catch (e) {
        parsedMap = {};
      }

      const initialMap = { ...parsedMap };
      configuredBanks.forEach(b => {
        if (initialMap[b] === undefined || initialMap[b] === null) {
          initialMap[b] = '';
        } else {
          initialMap[b] = String(initialMap[b]);
        }
      });
      setBankBalancesState(initialMap);

      let totalB = 0;
      Object.values(initialMap).forEach(v => {
        const n = parseFloat(v) || 0;
        totalB += n;
      });
      if (totalB === 0 && activeHotel.openingBankBalance) {
        totalB = Number(activeHotel.openingBankBalance);
      }
      setOpeningBankInput(String(totalB));
    }
  }, [activeHotel, configuredBanks, isOpeningModalOpen]);

  const handleBankBalanceChange = (bankName, val) => {
    setBankBalancesState(prev => {
      const updated = { ...prev, [bankName]: val };
      let sum = 0;
      Object.values(updated).forEach(v => {
        sum += (parseFloat(v) || 0);
      });
      setOpeningBankInput(String(sum));
      return updated;
    });
  };

  const handleAddCustomBank = () => {
    const trimmed = (customBankName || '').trim();
    if (!trimmed) return;
    setBankBalancesState(prev => ({
      ...prev,
      [trimmed]: ''
    }));
    setCustomBankName('');
    setShowAddCustomBank(false);
  };

  const hasOpeningBalance = activeHotel?.hasOpeningBalance !== false;
  const isOpeningBalanceLocked = activeHotel?.lockOpeningBalance === true;
  const openingCash = hasOpeningBalance ? Number(activeHotel?.openingCashBalance || 0) : 0;
  const openingBank = hasOpeningBalance ? Number(activeHotel?.openingBankBalance || 0) : 0;
  const openingTotal = openingCash + openingBank;

  const saveOpeningBalances = async () => {
    try {
      setSavingOpening(true);
      let sumBank = 0;
      const cleanBankMap = {};
      Object.entries(bankBalancesState).forEach(([bank, val]) => {
        const num = parseFloat(val) || 0;
        if (num > 0 || val !== '') {
          cleanBankMap[bank] = num;
        }
        sumBank += num;
      });
      if (sumBank === 0 && parseFloat(openingBankInput) > 0) {
        sumBank = parseFloat(openingBankInput);
      }

      const res = await api.put(`/hotels/${activeHotel.id}`, {
        openingCashBalance: Number(openingCashInput || 0),
        openingBankBalance: sumBank,
        bankOpeningBalances: JSON.stringify(cleanBankMap)
      });
      if (res.data?.success) {
        if (refreshHotel) {
          await refreshHotel(activeHotel.id);
        }
        setIsOpeningModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to update opening balances:", err);
      alert("Failed to update opening balances. Please try again.");
    } finally {
      setSavingOpening(false);
    }
  };

  // Section tab: 'all' | 'online' | 'cash'
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    setSelectedBankTab('All');
  }, [activeTab]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All'); // only relevant on 'all' tab
  const [startDate, setStartDate] = useState(toYMD(new Date()));
  const [endDate, setEndDate] = useState(toYMD(new Date()));

  // Date range preset: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'total' | 'custom'
  const [periodPreset, setPeriodPreset] = useState('daily');
  const [selectedMonth, setSelectedMonth] = useState(toYMD(new Date()).substring(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedWeekAnchor, setSelectedWeekAnchor] = useState(toYMD(new Date()));

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const formatDisplay = (ymd) => {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const RANGE_PRESETS = [
    { key: 'daily', label: 'Daily', icon: CalendarDays },
    { key: 'weekly', label: 'Weekly', icon: CalendarDays },
    { key: 'monthly', label: 'Monthly', icon: CalendarDays },
    { key: 'yearly', label: 'Yearly', icon: CalendarDays },
    { key: 'total', label: 'Total', icon: Layers },
    { key: 'custom', label: 'Custom Range', icon: CalendarRange },
  ];

  const applyWeekAnchor = (anchorYMD) => {
    if (!anchorYMD) return;
    setSelectedWeekAnchor(anchorYMD);
    const [y, m, d] = anchorYMD.split('-').map(Number);
    const anchorDate = new Date(y, m - 1, d);
    const day = anchorDate.getDay(); // 0 = Sun, 1 = Mon...
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(anchorDate);
    monday.setDate(anchorDate.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setStartDate(toYMD(monday));
    setEndDate(toYMD(sunday));
  };

  const shiftWeek = (deltaWeeks) => {
    const [y, m, d] = (selectedWeekAnchor || toYMD(new Date())).split('-').map(Number);
    const anchorDate = new Date(y, m - 1, d);
    anchorDate.setDate(anchorDate.getDate() + (deltaWeeks * 7));
    applyWeekAnchor(toYMD(anchorDate));
  };

  const applyMonthString = (ymString) => {
    if (!ymString) return;
    setSelectedMonth(ymString);
    const [y, m] = ymString.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    setStartDate(toYMD(firstDay));
    setEndDate(toYMD(lastDay));
  };

  const applyYearString = (yearNum) => {
    if (!yearNum) return;
    setSelectedYear(String(yearNum));
    const y = Number(yearNum);
    const firstDay = new Date(y, 0, 1);
    const lastDay = new Date(y, 11, 31);
    setStartDate(toYMD(firstDay));
    setEndDate(toYMD(lastDay));
  };

  const applyPreset = (preset) => {
    setPeriodPreset(preset);
    const now = new Date();

    if (preset === 'daily') {
      const ymd = toYMD(now);
      setStartDate(ymd);
      setEndDate(ymd);
    } else if (preset === 'weekly') {
      applyWeekAnchor(selectedWeekAnchor || toYMD(now));
    } else if (preset === 'monthly') {
      applyMonthString(selectedMonth || toYMD(now).substring(0, 7));
    } else if (preset === 'yearly') {
      applyYearString(selectedYear || now.getFullYear().toString());
    } else if (preset === 'total') {
      setStartDate('');
      setEndDate('');
    }
  };

  const rangeLabel = periodPreset === 'total'
    ? 'All Time'
    : (startDate && endDate)
      ? (startDate === endDate ? formatDisplay(startDate) : `${formatDisplay(startDate)} – ${formatDisplay(endDate)}`)
      : 'Select a range';

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const queryParams = {};
      if (startDate) queryParams.startDate = startDate;
      if (endDate) queryParams.endDate = endDate;

      const res = await api.get('/analytics/transactions', { params: queryParams });
      if (res.data?.success) {
        setTransactions(res.data.data);
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [startDate, endDate]);

  // --- Split full (date-filtered) dataset by payment mode, independent of active tab ---
  const onlineTx = useMemo(
    () => transactions.filter(t => (t.paymentMode || '').toLowerCase() === 'online'),
    [transactions]
  );
  const cardTx = useMemo(
    () => transactions.filter(t => (t.paymentMode || '').toLowerCase() === 'card'),
    [transactions]
  );
  const cashTx = useMemo(
    () => transactions.filter(t => (t.paymentMode || '').toLowerCase() === 'cash'),
    [transactions]
  );
  const otherTx = useMemo(
    () => transactions.filter(t => {
      const m = (t.paymentMode || '').toLowerCase();
      return m !== 'online' && m !== 'cash' && m !== 'card';
    }),
    [transactions]
  );

  const summarize = (list) => {
    const income = list.filter(t => t.type === 'Income').reduce((a, c) => a + c.amount, 0);
    const expense = list.filter(t => t.type === 'Expense').reduce((a, c) => a + c.amount, 0);
    return { count: list.length, income, expense, net: income - expense };
  };

  const allSummary = useMemo(() => summarize(transactions), [transactions]);
  const onlineSummary = useMemo(() => summarize(onlineTx), [onlineTx]);
  const cardSummary = useMemo(() => summarize(cardTx), [cardTx]);
  const cashSummary = useMemo(() => summarize(cashTx), [cashTx]);

  // Group online income transactions by bank for detailed view
  const bankWiseTxMap = useMemo(() => {
    const map = {};
    onlineTx.forEach(t => {
      if (t.type === 'Income') {
        const bank = t.paymentBank || 'Other / Direct Online';
        if (!map[bank]) map[bank] = [];
        map[bank].push(t);
      }
    });
    // Sort each bank's transactions by date desc
    Object.values(map).forEach(list => list.sort((a, b) => new Date(b.date) - new Date(a.date)));
    return map;
  }, [onlineTx]);

  // --- Base list for the currently active section/tab ---
  const sectionBase = activeTab === 'online' ? onlineTx
    : activeTab === 'card' ? cardTx
    : activeTab === 'cash' ? cashTx
    : transactions;

  // --- Apply search / type / source (+ modeFilter only on 'all' tab) ---
  const filteredTransactions = useMemo(() => {
    let result = [...sectionBase];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.source && t.source.toLowerCase().includes(q)) ||
        (t.paymentMode && t.paymentMode.toLowerCase().includes(q)) ||
        (t.serialNumber && String(t.serialNumber).toLowerCase().includes(q)) ||
        (t.invoiceNumber && String(t.invoiceNumber).toLowerCase().includes(q))
      );
    }

    if (typeFilter !== 'All') {
      result = result.filter(t => t.type === typeFilter);
    }

    if (sourceFilter !== 'All') {
      result = result.filter(t => t.source === sourceFilter);
    }

    if (activeTab === 'all' && modeFilter !== 'All') {
      result = result.filter(t => t.paymentMode.toLowerCase() === modeFilter.toLowerCase());
    }

    if (activeTab === 'online' && selectedBankTab !== 'All') {
      result = result.filter(t => {
        const bank = t.paymentBank || 'Other / Direct Online';
        return bank === selectedBankTab;
      });
    }

    const getTxMs = (tx) => {
      let dateStr = tx.date || '';
      if (dateStr.includes('-') && dateStr.split('-')[0].length === 2) {
        const [d, m, y] = dateStr.split('-');
        dateStr = `${y}-${m}-${d}`;
      }
      let timeStr = tx.time || '00:00';
      let h = 0, min = 0;
      if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
        const parts = timeStr.trim().split(/\s+/);
        const timeParts = (parts[0] || '0:0').split(':');
        h = parseInt(timeParts[0], 10) || 0;
        min = parseInt(timeParts[1], 10) || 0;
        const ampm = (parts[1] || '').toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
      } else if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        h = parseInt(parts[0], 10) || 0;
        min = parseInt(parts[1], 10) || 0;
      }
      const pad = (n) => String(n).padStart(2, '0');
      const parsed = new Date(`${dateStr}T${pad(h)}:${pad(min)}:00`).getTime();
      if (!isNaN(parsed)) return parsed;
      return new Date(tx.createdAt || tx.date).getTime() || 0;
    };

    result.sort((a, b) => getTxMs(b) - getTxMs(a));

    return result;
  }, [sectionBase, searchQuery, typeFilter, sourceFilter, modeFilter, activeTab, selectedBankTab]);

  // Reset page whenever the effective filtered set changes
  useEffect(() => {
    setCurrentPage(1);
  }, [transactions, searchQuery, typeFilter, sourceFilter, modeFilter, activeTab, selectedBankTab]);

  // Aggregate metrics for whatever is currently visible (tab + filters applied)
  const totalIncome = filteredTransactions
    .filter(t => t.type === 'Income')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = filteredTransactions
    .filter(t => t.type === 'Expense')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const netBalance = totalIncome - totalExpense;

  // Pagination bounds
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredTransactions.slice(startIndex, startIndex + itemsPerPage);

  const tabLabel = activeTab === 'online' ? 'Online' : activeTab === 'card' ? 'Card' : activeTab === 'cash' ? 'Cash' : 'All';

  const handleExport = () => {
    const showSerial = activeHotel?.enablePaymentSerialNumber === true;
    const headers = [
      ...(showSerial ? ['Serial No'] : []),
      'Date', 'Type', 'Source', 'Description', 'Payment Mode', 'Amount (Rs)'
    ];
    const rows = filteredTransactions.map(t => {
      const row = [
        ...(showSerial ? [t.serialNumber ? `"${t.serialNumber}"` : '""'] : []),
        t.date,
        t.type,
        t.source,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.paymentMode,
        t.type === 'Expense' ? -t.amount : t.amount
      ];
      return row;
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Transactions_${tabLabel}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const TABS = [
    { key: 'all', label: 'All Transactions', icon: Layers, count: transactions.length },
    { key: 'online', label: 'Online Transactions', icon: Globe, count: onlineTx.length },
    { key: 'card', label: 'Card Collection', icon: CreditCard, count: cardTx.length },
    { key: 'cash', label: 'Cash Collection', icon: Wallet, count: cashTx.length },
  ];

  return (
    <div className="space-y-3.5 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#1A2E05]">Transaction History</h1>
          <p className="text-xs sm:text-sm text-[#7A8A6A] font-bold">Unified audit of incoming guest payments and outgoing expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasOpeningBalance && (
            <button
              onClick={() => setIsOpeningModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#1A2E05] border border-[#DDE5D0] rounded-lg text-xs font-bold hover:bg-[#F5F7F0] transition-all shadow-sm active:scale-95 shrink-0"
            >
              {isOpeningBalanceLocked ? <Lock size={14} className="text-amber-600" /> : <Wallet size={14} className="text-[#84A63C]" />}
              Opening Balance {isOpeningBalanceLocked ? '(Locked)' : ''}
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#84A63C] text-white rounded-lg text-xs font-bold hover:bg-[#84A63C]/95 transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Download size={14} /> Export {tabLabel} to CSV
          </button>
        </div>
      </div>

      {/* Date Range Selector - governs everything below (breakdown cards, tabs, table) */}
      <div className="bg-white p-4 rounded-xl border border-[#DDE5D0] shadow-sm space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <CalendarRange size={14} className="text-[#84A63C]" />
            <span className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">Date Range</span>
          </div>
          <span className="text-xs font-bold text-[#7A8A6A]">
            Showing: <span className="text-[#1A2E05]">{rangeLabel}</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                periodPreset === key
                  ? 'bg-[#84A63C] text-white shadow-sm'
                  : 'bg-[#F5F7F0] text-[#4A5E38] border border-[#DDE5D0] hover:bg-[#EAF0DE]'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {periodPreset === 'daily' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const val = e.target.value;
                setStartDate(val);
                setEndDate(val);
              }}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
            />
          </div>
        )}

        {periodPreset === 'weekly' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Week:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                className="px-2.5 py-1.5 bg-[#F5F7F0] hover:bg-[#EAF0DE] border border-[#DDE5D0] rounded-lg text-xs font-black text-[#4A5E38] transition-all"
                title="Previous Week"
              >
                ◀ Prev
              </button>
              <input
                type="date"
                value={selectedWeekAnchor}
                onChange={(e) => applyWeekAnchor(e.target.value)}
                className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                className="px-2.5 py-1.5 bg-[#F5F7F0] hover:bg-[#EAF0DE] border border-[#DDE5D0] rounded-lg text-xs font-black text-[#4A5E38] transition-all"
                title="Next Week"
              >
                Next ▶
              </button>
            </div>
          </div>
        )}

        {periodPreset === 'monthly' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => applyMonthString(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
            />
          </div>
        )}

        {periodPreset === 'yearly' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">Select Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => applyYearString(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05] cursor-pointer"
            >
              {[2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020].map(yr => (
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
          </div>
        )}

        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-bold text-[#7A8A6A]">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05]"
            />
            <span className="text-xs font-bold text-[#7A8A6A]">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-xs font-bold focus:outline-none focus:border-[#84A63C] text-[#1A2E05]"
            />
          </div>
        )}
      </div>

      {/* Payment Mode Breakdown - always visible regardless of active tab */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`text-left bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all ${
            activeTab === 'all' ? 'border-[#84A63C] ring-2 ring-[#84A63C]/30' : 'border-[#DDE5D0] hover:border-[#84A63C]/50'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#7A8A6A]">
              <Layers size={13} className="text-[#84A63C]" /> Total Transactions ({allSummary.count})
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm sm:text-base font-black text-emerald-600">+₹{allSummary.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-sm sm:text-base font-black text-rose-600">-₹{allSummary.expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className={`text-xs font-bold ${allSummary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Net: ₹{allSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            {hasOpeningBalance && (
              <div className="text-[10px] font-extrabold text-[#4A5E38] pt-0.5 border-t border-[#DDE5D0]/60">
                Opening: ₹{openingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Total: <span className="text-[#1A2E05]">₹{(openingTotal + allSummary.net).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
          <div className="p-2.5 bg-[#F0F3E8] text-[#84A63C] rounded-xl">
            <Layers size={18} />
          </div>
        </button>

        <button
          onClick={() => setActiveTab('online')}
          className={`text-left bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all ${
            activeTab === 'online' ? 'border-[#84A63C] ring-2 ring-[#84A63C]/30' : 'border-[#DDE5D0] hover:border-[#84A63C]/50'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#7A8A6A]">
              <Globe size={13} className="text-blue-500" /> Online Transactions ({onlineSummary.count})
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm sm:text-base font-black text-emerald-600">+₹{onlineSummary.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-sm sm:text-base font-black text-rose-600">-₹{onlineSummary.expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className={`text-xs font-bold ${onlineSummary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Net: ₹{onlineSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            {hasOpeningBalance && (
              <div className="text-[10px] font-extrabold text-blue-700 pt-0.5 border-t border-[#DDE5D0]/60">
                Opening Bank: ₹{openingBank.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Bank Net: <span className="text-blue-950">₹{(openingBank + onlineSummary.net).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-500 rounded-xl">
            <Globe size={18} />
          </div>
        </button>

        <button
          onClick={() => setActiveTab('card')}
          className={`text-left bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all ${
            activeTab === 'card' ? 'border-[#84A63C] ring-2 ring-[#84A63C]/30' : 'border-[#DDE5D0] hover:border-[#84A63C]/50'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#7A8A6A]">
              <CreditCard size={13} className="text-purple-600" /> Card Collection ({cardSummary.count})
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm sm:text-base font-black text-emerald-600">+₹{cardSummary.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-sm sm:text-base font-black text-rose-600">-₹{cardSummary.expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className={`text-xs font-bold ${cardSummary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Net: ₹{cardSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
            <CreditCard size={18} />
          </div>
        </button>

        <button
          onClick={() => setActiveTab('cash')}
          className={`text-left bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all ${
            activeTab === 'cash' ? 'border-[#84A63C] ring-2 ring-[#84A63C]/30' : 'border-[#DDE5D0] hover:border-[#84A63C]/50'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#7A8A6A]">
              <Wallet size={13} className="text-amber-500" /> Cash Collection ({cashSummary.count})
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm sm:text-base font-black text-emerald-600">+₹{cashSummary.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-sm sm:text-base font-black text-rose-600">-₹{cashSummary.expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className={`text-xs font-bold ${cashSummary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Net: ₹{cashSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            {hasOpeningBalance && (
              <div className="text-[10px] font-extrabold text-amber-700 pt-0.5 border-t border-[#DDE5D0]/60">
                Opening Cash: ₹{openingCash.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Cash Net: <span className="text-amber-950">₹{(openingCash + cashSummary.net).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
            <Wallet size={18} />
          </div>
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-[#DDE5D0] shadow-sm">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === key
                ? 'bg-[#84A63C] text-white shadow-sm'
                : 'text-[#4A5E38] hover:bg-[#F5F7F0]'
            }`}
          >
            <Icon size={13} /> {label}
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === key ? 'bg-white/20' : 'bg-[#F0F3E8]'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Bank Name Sub-Tabs (rendered below the main Section Tabs when Online Transactions is active) */}
      {activeTab === 'online' && !loading && Object.keys(bankWiseTxMap).length > 0 && !(Object.keys(bankWiseTxMap).length === 1 && Object.keys(bankWiseTxMap)[0] === 'Other / Direct Online') && (
        <div className="flex flex-wrap gap-2 bg-[#F5F7F0]/60 p-2 rounded-xl border border-[#DDE5D0]/80">
          <button
            onClick={() => setSelectedBankTab('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
              selectedBankTab === 'All'
                ? 'bg-[#84A63C] text-white shadow-md'
                : 'bg-white text-[#4A5E38] border border-[#DDE5D0] hover:bg-[#EAF0DE]'
            }`}
          >
            All Online (₹{onlineSummary.income.toLocaleString(undefined, { minimumFractionDigits: 2 })})
          </button>
          {Object.entries(bankWiseTxMap).sort(([a], [b]) => a.localeCompare(b)).map(([bank, txList]) => {
            const total = txList.reduce((s, t) => s + t.amount, 0);
            const bOpen = Number(bankOpeningMap[bank] || 0);
            return (
              <button
                key={bank}
                onClick={() => setSelectedBankTab(bank)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-1.5 ${
                  selectedBankTab === bank
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-[#4A5E38] border border-[#DDE5D0] hover:bg-[#EAF0DE]'
                }`}
              >
                <span>{bank} (₹{total.toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                {bOpen > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${selectedBankTab === bank ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>
                    Open: ₹{bOpen.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Aggregate Cards for current section */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 min-w-0">
            <span className="text-[9.5px] sm:text-xs font-bold text-[#7A8A6A] block truncate">{tabLabel} Income</span>
            <div className="text-sm sm:text-lg font-black text-emerald-600 truncate">₹{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <ArrowUpRight size={16} className="sm:w-4 sm:h-4" />
          </div>
        </div>

        <div className="bg-white p-2.5 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 min-w-0">
            <span className="text-[9.5px] sm:text-xs font-bold text-[#7A8A6A] block truncate">{tabLabel} Outflow</span>
            <div className="text-sm sm:text-lg font-black text-rose-600 truncate">₹{totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-xl shrink-0">
            <ArrowDownRight size={16} className="sm:w-4 sm:h-4" />
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 bg-white p-2.5 sm:p-4 rounded-xl border border-[#DDE5D0] shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 min-w-0">
            <span className="text-[9.5px] sm:text-xs font-bold text-[#7A8A6A] block truncate">
              {activeTab === 'online' && selectedBankTab !== 'All' ? `${selectedBankTab} Balance` : `${tabLabel} Net Balance`}
            </span>
            {(() => {
              let curOpening = 0;
              if (activeTab === 'cash') {
                curOpening = openingCash;
              } else if (activeTab === 'online') {
                if (selectedBankTab !== 'All') {
                  curOpening = Number(bankOpeningMap[selectedBankTab] || 0);
                } else {
                  curOpening = openingBank;
                }
              } else {
                curOpening = openingTotal;
              }
              const grandNet = curOpening + netBalance;
              return (
                <div>
                  <div className={`text-sm sm:text-lg font-black ${grandNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ₹{grandNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  {hasOpeningBalance && curOpening > 0 && (
                    <span className="text-[8.5px] sm:text-[10px] font-bold text-[#7A8A6A] block truncate">
                      (Opening: ₹{curOpening.toLocaleString(undefined, { minimumFractionDigits: 2 })} + Net: ₹{netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
          <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${netBalance >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            <DollarSign size={16} className="sm:w-4 sm:h-4" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#DDE5D0] shadow-sm space-y-2.5">
        <div className="flex items-center gap-1.5 border-b border-[#DDE5D0]/30 pb-1.5">
          <Filter size={14} className="text-[#84A63C]" />
          <span className="text-xs font-black text-[#1A2E05] uppercase tracking-wider">
            Search & Filter — {tabLabel}
          </span>
        </div>

        <div className={`grid grid-cols-2 gap-2 sm:gap-2.5 ${
          activeTab === 'all' ? 'md:grid-cols-4' : 'md:grid-cols-3'
        }`}>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 sm:pl-8 pr-2.5 py-1.5 sm:py-2 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] sm:text-xs font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05]"
            />
            <Search className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 text-[#7A8A6A]" size={13} />
          </div>

          {/* Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] sm:text-xs font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
          >
            <option value="All">All Types</option>
            <option value="Income">Income (+)</option>
            <option value="Expense">Expense (-)</option>
          </select>

          {/* Source */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] sm:text-xs font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
          >
            <option value="All">All Sources</option>
            <option value="Booking Payment">Booking Payment</option>
            <option value="Food Sale">Food Sale</option>
            <option value="Hotel Expense">Hotel Expense</option>
          </select>

          {/* Payment Mode - only relevant when viewing "All" */}
          {activeTab === 'all' && (
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="w-full px-2 sm:px-2.5 py-1.5 sm:py-2 bg-[#F5F7F0] border border-[#DDE5D0] rounded-lg text-[10px] sm:text-xs font-bold focus:outline-none focus:border-[#84A63C] focus:bg-white text-[#1A2E05] cursor-pointer"
            >
              <option value="All">All Modes</option>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          )}
        </div>
      </div>

      {/* Transactions Table Card */}
      <div className="bg-white border border-[#DDE5D0] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-[#7A8A6A]">
            <Loader2 className="animate-spin text-[#84A63C]" size={24} />
            <span className="text-xs sm:text-sm font-bold">Fetching transaction list...</span>
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="text-center py-12 text-[#7A8A6A] font-bold text-xs sm:text-sm space-y-1.5">
            <p>No {tabLabel.toLowerCase()} transactions found matching the selected filters.</p>
            <p className="text-xs opacity-70">Adjust the filters or record payments to see them here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F7F0] border-b border-[#DDE5D0] text-[#4A5E38] text-xs sm:text-sm font-extrabold uppercase tracking-wider select-none">
                  {activeHotel?.enablePaymentSerialNumber === true && (
                    <th className="px-4 py-3">Serial No.</th>
                  )}
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Payment Mode</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE5D0]/30 text-xs sm:text-sm text-[#1A2E05] font-bold">
                {paginatedItems.map((tx) => {
                  const isIncome = tx.type === 'Income';
                  const modeLower = (tx.paymentMode || '').toLowerCase();
                  return (
                    <tr key={tx.id} className="hover:bg-[#F5F7F0]/30 transition-colors">
                      {activeHotel?.enablePaymentSerialNumber === true && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          {tx.serialNumber ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black bg-[#EEF4E3] border border-[#D3E2BD] text-[#1A2E05]">
                              #{tx.serialNumber}
                            </span>
                          ) : (
                            <span className="text-[#7A8A6A] text-xs font-semibold">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[#4A5E38] font-black">{tx.date.split('-').reverse().join('-')}</div>
                        {tx.time && (
                          <div className="text-[10px] text-[#7A8A6A] font-bold mt-0.5">{formatTime12hr(tx.time)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {isIncome ? 'Income' : 'Expense'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[#84A63C]">{tx.source}</div>
                        {(() => {
                          const currentPrefix = activeHotel?.invoicePrefix || 'INV-';
                          if (tx.invoiceNumber) {
                            const match = String(tx.invoiceNumber).match(/^(.*?)(\d+)$/);
                            const numPart = match ? match[2] : tx.invoiceNumber;
                            return (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#F5F7F0] border border-[#DDE5D0] text-[10px] font-bold shadow-sm">
                                  <span className="text-[#7A8A6A] font-semibold">{currentPrefix}</span>
                                  <span className="text-[#1A2E05] ml-0.5 font-black">{numPart}</span>
                                </span>
                              </div>
                            );
                          } else if (tx.source === 'Booking Payment') {
                            return (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-600 shadow-sm">
                                  Not Assigned
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                          modeLower === 'online'
                            ? 'text-blue-600 bg-blue-50 border-blue-100'
                            : modeLower === 'cash'
                            ? 'text-amber-600 bg-amber-50 border-amber-100'
                            : 'text-[#4A5E38] bg-[#F0F3E8] border-[#DDE5D0]'
                        }`}>
                          {modeLower === 'online' ? <Globe size={11} /> : modeLower === 'cash' ? <Wallet size={11} /> : <CreditCard size={11} />}
                          {tx.paymentMode}
                        </span>
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right font-black ${
                        isIncome ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {isIncome ? '+' : '-'}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Pagination */}
        {!loading && filteredTransactions.length > 0 && (
          <div className="flex justify-between items-center px-4 py-3.5 bg-[#F5F7F0] border-t border-[#DDE5D0] text-xs sm:text-sm font-bold text-[#7A8A6A]">
            <div>
              Showing {startIndex + 1} - {Math.min(startIndex + itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} items
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-[#DDE5D0] bg-white hover:bg-[#F5F7F0] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs"
              >
                Previous
              </button>
              <span className="text-[#1A2E05]">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#DDE5D0] bg-white hover:bg-[#F5F7F0] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Opening Balance Setup Modal */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE5D0] w-full max-w-lg overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            <div className="py-3.5 px-5 border-b border-[#DDE5D0] flex items-center justify-between bg-[#F5F7F0] shrink-0">
              <div className="flex items-center gap-2">
                <Wallet className="text-[#84A63C]" size={18} />
                <div>
                  <h3 className="text-sm font-bold text-[#1A2E05]">Set Opening Balances</h3>
                  <p className="text-[11px] text-[#7A8A6A] font-semibold">Specify starting balances for cash drawer and individual bank/UPI accounts.</p>
                </div>
              </div>
              <button onClick={() => setIsOpeningModalOpen(false)} className="text-[#7A8A6A] hover:text-[#1A2E05] transition-colors p-1"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {isOpeningBalanceLocked && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5 text-amber-800 text-xs font-bold">
                  <Lock size={16} className="text-amber-600 shrink-0" />
                  <span>Opening balances are locked by SuperAdmin. Contact support to unlock and edit.</span>
                </div>
              )}

              {/* Cash Section */}
              <div className="bg-[#F0F3E8]/50 p-3.5 rounded-xl border border-[#DDE5D0]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Wallet size={15} className="text-amber-600" />
                  <label className="text-xs font-black text-[#4A5E38] uppercase tracking-wider">Cash Opening Balance (₹)</label>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#7A8A6A]">₹</span>
                  <input
                    type="number"
                    step="any"
                    disabled={isOpeningBalanceLocked}
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    className={`w-full pl-7 pr-3 py-2 border rounded-xl text-sm font-bold focus:outline-none ${
                      isOpeningBalanceLocked
                        ? 'bg-[#F5F7F0] text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                        : 'bg-white border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                    }`}
                    placeholder="0.00"
                  />
                </div>
                <span className="text-[10px] text-[#7A8A6A] font-semibold mt-1 block">Starting cash in till / register drawer</span>
              </div>

              {/* Bank Accounts Section */}
              <div className="bg-blue-50/40 p-3.5 rounded-xl border border-blue-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark size={15} className="text-blue-600" />
                    <span className="text-xs font-black text-blue-950 uppercase tracking-wider">Bank & Online Accounts</span>
                  </div>
                  <span className="text-xs font-extrabold text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">
                    Total Bank: ₹{Number(openingBankInput || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {Object.keys(bankBalancesState).length === 0 ? (
                    <p className="text-xs text-gray-500 italic py-2 text-center">No online payment banks configured.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {Object.entries(bankBalancesState).map(([bank, val]) => (
                        <div key={bank} className="bg-white p-2.5 rounded-lg border border-[#DDE5D0] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-[#1A2E05] truncate">{bank}</span>
                            {!configuredBanks.includes(bank) && !isOpeningBalanceLocked && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBankBalancesState(prev => {
                                    const copy = { ...prev };
                                    delete copy[bank];
                                    let sum = 0;
                                    Object.values(copy).forEach(v => { sum += (parseFloat(v) || 0); });
                                    setOpeningBankInput(String(sum));
                                    return copy;
                                  });
                                }}
                                className="text-rose-400 hover:text-rose-600 p-0.5"
                                title="Remove bank"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-[#7A8A6A]">₹</span>
                            <input
                              type="number"
                              step="any"
                              disabled={isOpeningBalanceLocked}
                              value={val}
                              onChange={(e) => handleBankBalanceChange(bank, e.target.value)}
                              className={`w-full pl-6 pr-2.5 py-1.5 border rounded-lg text-xs font-bold focus:outline-none ${
                                isOpeningBalanceLocked
                                  ? 'bg-[#F5F7F0] text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                                  : 'bg-white border-[#DDE5D0] text-[#1A2E05] focus:border-blue-500'
                              }`}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isOpeningBalanceLocked && (
                    <div className="pt-1">
                      {showAddCustomBank ? (
                        <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-blue-200">
                          <input
                            type="text"
                            value={customBankName}
                            onChange={(e) => setCustomBankName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomBank(); } }}
                            placeholder="e.g. Bank of Baroda, Axis, Razorpay"
                            className="flex-1 px-2.5 py-1 text-xs border rounded-md font-bold focus:outline-none focus:border-blue-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomBank}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 transition-colors"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowAddCustomBank(false); setCustomBankName(''); }}
                            className="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddCustomBank(true)}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline pt-0.5"
                        >
                          <Plus size={13} /> Add another bank / account
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Grand Total Preview */}
              <div className="bg-[#F5F7F0] p-3 rounded-xl border border-[#DDE5D0] flex items-center justify-between text-xs">
                <span className="font-bold text-[#4A5E38]">Combined Total Opening Balance:</span>
                <span className="font-black text-sm text-[#1A2E05]">
                  ₹{(Number(openingCashInput || 0) + Number(openingBankInput || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE5D0]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 py-2 bg-[#F5F7F0] text-[#4A5E38] rounded-xl text-xs font-bold hover:bg-[#EAF0DE] transition-colors"
                >
                  {isOpeningBalanceLocked ? 'Close' : 'Cancel'}
                </button>
                {!isOpeningBalanceLocked && (
                  <button
                    type="button"
                    onClick={saveOpeningBalances}
                    disabled={savingOpening}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#84A63C] text-white rounded-xl text-xs font-bold hover:bg-[#84A63C]/90 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  >
                    {savingOpening && <Loader2 size={14} className="animate-spin" />}
                    Save Balances
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;