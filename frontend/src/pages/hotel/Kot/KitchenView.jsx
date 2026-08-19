import React, { useState, useEffect } from 'react';
import { Play, Check, X, Clock, RefreshCw, AlertTriangle, ChefHat, Bell, Loader2 } from 'lucide-react';
import api from '../../../services/api';

const ElapsedTime = ({ createdAt }) => {
  const [elapsed, setElapsed] = useState('');
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    const calculate = () => {
      const diffMs = Date.now() - new Date(createdAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins >= 15) {
        setIsDelayed(true);
      } else {
        setIsDelayed(false);
      }

      if (diffMins < 1) {
        setElapsed('Just now');
      } else {
        setElapsed(`${diffMins} min${diffMins > 1 ? 's' : ''} ago`);
      }
    };

    calculate();
    const interval = setInterval(calculate, 30000); // update every 30s
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
      isDelayed ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-600'
    }`}>
      <Clock size={10} /> {elapsed}
    </span>
  );
};

const parseKotItems = (items) => {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

const KitchenView = () => {
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundAlert, setSoundAlert] = useState(true);
  const [previousCount, setPreviousCount] = useState(0);

  useEffect(() => {
    fetchKots();
    // Auto refresh kitchen display every 12 seconds
    const interval = setInterval(fetchKots, 12000);
    return () => clearInterval(interval);
  }, []);

  const fetchKots = async () => {
    try {
      const res = await api.get('/kots');
      if (res.data?.success) {
        const fetchedKots = res.data.data || [];
        
        // Filter out Cancelled KOTs, or only keep non-Served if desired
        // Standard kitchen view shows: Pending, In Progress, and recently Served orders
        const activeKots = fetchedKots.filter(k => k.status !== 'Cancelled');
        
        // Sound alert for new pending orders
        const pendingCount = activeKots.filter(k => k.status === 'Pending').length;
        if (soundAlert && pendingCount > previousCount) {
          playAlertSound();
        }
        setPreviousCount(pendingCount);
        setKots(activeKots);
      }
    } catch (err) {
      console.error('Failed to sync kitchen KOTs:', err);
    } finally {
      setLoading(false);
    }
  };

  const playAlertSound = () => {
    try {
      // Audio synthesis for simple notification sound without external asset dependencies
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      
      // Dual tone beep
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 note
        gain2.gain.setValueAtTime(0.15, ctx.currentTime);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.25);
      }, 150);
    } catch (e) {
      console.log('Audio Context block/error:', e);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const res = await api.put(`/kots/${id}/status`, { status });
      if (res.data?.success) {
        setKots(prev => prev.map(k => k.id === id ? { ...k, status } : k));
        // Recalculate previousCount to prevent alert sounding on status changes
        const pendingCount = kots.filter(k => k.id !== id ? k.status === 'Pending' : status === 'Pending').length;
        setPreviousCount(pendingCount);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  // Group KOTs by status
  const pendingOrders = kots.filter(k => k.status === 'Pending');
  const inProgressOrders = kots.filter(k => k.status === 'In Progress');
  const servedOrders = kots.filter(k => k.status === 'Served').slice(0, 8); // Only show last 8 served items

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2E05] tracking-tight flex items-center gap-2">
            <ChefHat className="text-[#84A63C]" /> Kitchen Display Board
          </h1>
          <p className="text-xs font-medium text-[#7A8A6A] mt-0.5">Real-time preparation, tracking, and kitchen alerts</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundAlert(!soundAlert)}
            className={`px-3 py-2 border rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              soundAlert 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            <Bell size={14} className={soundAlert ? 'animate-bounce' : ''} />
            Sound: {soundAlert ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={fetchKots}
            className="p-2.5 bg-white hover:bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-[#4A5E38] transition-all hover:rotate-45"
            title="Refresh Orders"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <Loader2 size={32} className="animate-spin text-[#84A63C] mx-auto" />
          <p className="text-xs font-bold text-[#7A8A6A] mt-2">Loading active tickets...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Pending Orders (New) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-yellow-50 border border-yellow-200 rounded-2xl">
              <span className="text-sm font-black text-yellow-800 uppercase tracking-wider">Pending Orders</span>
              <span className="text-xs font-black bg-yellow-200 text-yellow-800 px-2.5 py-0.5 rounded-full">
                {pendingOrders.length} New
              </span>
            </div>

            <div className="space-y-4 max-h-[650px] overflow-y-auto no-scrollbar">
              {pendingOrders.length === 0 ? (
                <div className="py-12 border border-dashed border-[#DDE5D0] rounded-3xl text-center text-xs font-bold text-[#7A8A6A] bg-white">
                  No pending kitchen tickets.
                </div>
              ) : (
                pendingOrders.map(kot => (
                  <div
                    key={kot.id}
                    className="bg-white border border-[#DDE5D0] rounded-3xl p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-400"></div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-black text-[#1A2E05]">{kot.kotNumber}</h4>
                        <span className="text-xs font-extrabold text-[#84A63C]">Room {kot.roomNumber}</span>
                      </div>
                      <ElapsedTime createdAt={kot.createdAt} />
                    </div>

                    <div className="text-[11px] font-bold text-[#4A5E38]">
                      <span className="text-[9px] text-[#7A8A6A] uppercase block">Guest Name</span>
                      <span className="text-[#1A2E05] uppercase">{kot.guestName}</span>
                    </div>

                    <div className="border-t border-dashed border-[#DDE5D0] pt-3">
                      <span className="text-[9px] text-[#7A8A6A] uppercase block mb-1">Dishes</span>
                      <ul className="space-y-1 text-xs font-bold text-[#1A2E05]">
                        {parseKotItems(kot.items).map((item, idx) => (
                          <li key={idx} className="flex justify-between items-center bg-[#F8FAF6] p-2 rounded-lg border border-[#DDE5D0]/30">
                            <span>{item.name}</span>
                            <span className="text-xs font-black bg-[#1C2B22] text-white px-2 py-0.5 rounded">x{item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {kot.notes && (
                      <div className="bg-yellow-50 border border-yellow-200/50 p-2.5 rounded-xl text-[10px] font-bold text-yellow-800 italic">
                        Notes: "{kot.notes}"
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'Cancelled')}
                        className="flex-1 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                      >
                        <X size={12} /> Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'In Progress')}
                        className="flex-[2] py-2 bg-[#84A63C] hover:bg-[#6C892E] text-white rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                      >
                        <Play size={10} fill="white" /> Start Cooking
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: In Progress Orders */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
              <span className="text-sm font-black text-blue-800 uppercase tracking-wider">In Preparation</span>
              <span className="text-xs font-black bg-blue-200 text-blue-800 px-2.5 py-0.5 rounded-full animate-pulse">
                {inProgressOrders.length} Cooking
              </span>
            </div>

            <div className="space-y-4 max-h-[650px] overflow-y-auto no-scrollbar">
              {inProgressOrders.length === 0 ? (
                <div className="py-12 border border-dashed border-[#DDE5D0] rounded-3xl text-center text-xs font-bold text-[#7A8A6A] bg-white">
                  No active cooking tickets.
                </div>
              ) : (
                inProgressOrders.map(kot => (
                  <div
                    key={kot.id}
                    className="bg-white border border-[#DDE5D0] rounded-3xl p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-400"></div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-black text-[#1A2E05]">{kot.kotNumber}</h4>
                        <span className="text-xs font-extrabold text-[#84A63C]">Room {kot.roomNumber}</span>
                      </div>
                      <ElapsedTime createdAt={kot.createdAt} />
                    </div>

                    <div className="text-[11px] font-bold text-[#4A5E38]">
                      <span className="text-[9px] text-[#7A8A6A] uppercase block">Guest Name</span>
                      <span className="text-[#1A2E05] uppercase">{kot.guestName}</span>
                    </div>

                    <div className="border-t border-dashed border-[#DDE5D0] pt-3">
                      <span className="text-[9px] text-[#7A8A6A] uppercase block mb-1">Dishes</span>
                      <ul className="space-y-1 text-xs font-bold text-[#1A2E05]">
                        {parseKotItems(kot.items).map((item, idx) => (
                          <li key={idx} className="flex justify-between items-center bg-[#F8FAF6] p-2 rounded-lg border border-[#DDE5D0]/30">
                            <span>{item.name}</span>
                            <span className="text-xs font-black bg-[#1C2B22] text-white px-2 py-0.5 rounded">x{item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {kot.notes && (
                      <div className="bg-yellow-50 border border-yellow-200/50 p-2.5 rounded-xl text-[10px] font-bold text-yellow-800 italic">
                        Notes: "{kot.notes}"
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'Pending')}
                        className="flex-1 py-2 border border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F0F3E8] rounded-xl text-[10px] font-bold transition-colors"
                      >
                        Reset to Pending
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'Served')}
                        className="flex-[2] py-2 bg-[#1C2B22] hover:bg-[#2A3E31] text-white rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                      >
                        <Check size={12} strokeWidth={2.5} /> Mark Served / Ready
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Recently Served */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-green-50 border border-green-200 rounded-2xl">
              <span className="text-sm font-black text-green-800 uppercase tracking-wider">Recently Served</span>
              <span className="text-xs font-black bg-green-200 text-green-800 px-2.5 py-0.5 rounded-full">
                {servedOrders.length} Completed
              </span>
            </div>

            <div className="space-y-4 max-h-[650px] overflow-y-auto no-scrollbar">
              {servedOrders.length === 0 ? (
                <div className="py-12 border border-dashed border-[#DDE5D0] rounded-3xl text-center text-xs font-bold text-[#7A8A6A] bg-white">
                  No served tickets yet.
                </div>
              ) : (
                servedOrders.map(kot => (
                  <div
                    key={kot.id}
                    className="bg-white/70 border border-[#DDE5D0] rounded-3xl p-5 space-y-3 opacity-80 hover:opacity-100 transition-opacity relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-green-400"></div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-black text-[#7A8A6A] line-through">{kot.kotNumber}</h4>
                        <span className="text-xs font-extrabold text-[#84A63C]">Room {kot.roomNumber}</span>
                      </div>
                      <span className="text-[10px] font-black text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <Check size={10} strokeWidth={3} /> Served
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-[#7A8A6A]">
                      <span>Guest: {kot.guestName.toUpperCase()}</span>
                    </div>

                    <div className="border-t border-[#DDE5D0]/60 pt-2 text-xs font-bold text-[#7A8A6A]">
                      <ul className="space-y-0.5">
                        {parseKotItems(kot.items).map((item, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>{item.name}</span>
                            <span>x{item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-1 flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(kot.id, 'In Progress')}
                        className="w-full py-1.5 border border-[#DDE5D0] hover:bg-[#F0F3E8] rounded-xl text-[9px] font-bold transition-all text-[#4A5E38]"
                      >
                        Recall to Kitchen
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KitchenView;
