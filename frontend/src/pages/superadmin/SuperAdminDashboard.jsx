import React, { useState, useEffect } from 'react';
import { Building, Phone, Mail, MapPin, Loader2, AlertCircle, CheckCircle, XCircle, Power, PlayCircle } from 'lucide-react';
import api from '../../services/api';

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, hotelId: null, currentStatus: '' });

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/analytics/superadmin/dashboard');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError('Failed to load global statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleToggleStatus = (hotelId, currentStatus) => {
    setConfirmModal({
      isOpen: true,
      hotelId,
      currentStatus
    });
  };

  const executeToggleStatus = async (hotelId, currentStatus) => {
    setTogglingId(hotelId);
    try {
      const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
      const res = await api.put(`/hotels/${hotelId}`, { status: newStatus });
      if (res.data.success) {
        // Refresh local stats
        await fetchStats();
      }
    } catch (err) {
      console.error('Error toggling hotel status:', err);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 size={40} className="animate-spin text-[#84A63C]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm font-semibold max-w-md mx-auto mt-12 shadow-sm">
        <AlertCircle size={18} className="flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const activeHotelsList = stats.hotels.filter(h => h.status === 'Active' || !h.status);
  const inactiveHotelsList = stats.hotels.filter(h => h.status === 'Inactive');

  const kpis = [
    { title: 'Total Registered Hotels', value: stats.totalHotels, sub: 'Combined hotels count', icon: Building, color: 'text-blue-600 bg-blue-50 border-blue-100' },
    { title: 'Active Hotels', value: stats.activeHotels, sub: 'Hotels currently online', icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    { title: 'Inactive Hotels', value: stats.inactiveHotels, sub: 'Hotels currently offline', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-100' }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#1A2E05] tracking-tight">Global Management Console</h2>
        <p className="text-xs text-[#7A8A6A] font-semibold mt-0.5">Control center for hotel activation states</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {kpis.map((k, idx) => {
          const Icon = k.icon;
          return (
            <div key={idx} className="bg-white border border-[#DDE5D0] shadow-sm rounded-3xl p-5 hover:shadow-md transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#7A8A6A] uppercase tracking-wider">{k.title}</span>
                <div className={`p-2 rounded-xl border ${k.color}`}>
                  <Icon size={18} />
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-[#1A2E05] tracking-tight">{k.value}</h3>
                <p className="text-[10px] text-[#4A5E38] font-semibold mt-1">{k.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Active vs Inactive Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Active Hotels Column */}
        <div className="bg-white border border-[#DDE5D0] shadow-sm rounded-3xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between border-b border-[#F0F3E8] pb-3 mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="text-emerald-600" size={18} />
              <div>
                <h4 className="font-bold text-[#1A2E05] text-sm">Active Hotels</h4>
                <p className="text-[10px] text-[#7A8A6A] font-semibold mt-0.5">Hotels with active user sessions</p>
              </div>
            </div>
            <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
              {activeHotelsList.length} Online
            </span>
          </div>

          {activeHotelsList.length === 0 ? (
            <div className="py-12 text-center text-[#7A8A6A] text-xs font-semibold">
              No active hotels registered in the system.
            </div>
          ) : (
            <div className="space-y-4">
              {activeHotelsList.map((h) => (
                <div 
                  key={h.id} 
                  className="border border-[#DDE5D0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-[#84A63C] transition-all bg-white"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#F0F3E8] border border-[#DDE5D0] flex items-center justify-center overflow-hidden flex-shrink-0">
                      {h.logoUrl ? (
                        <img src={h.logoUrl} alt={h.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building size={20} className="text-[#84A63C]" />
                      )}
                    </div>
                    <div>
                      <h5 className="font-bold text-[#1A2E05] leading-snug">{h.name}</h5>
                      <div className="flex flex-col gap-0.5 mt-1 text-[10px] text-[#7A8A6A] font-semibold">
                        {h.phone && <span className="flex items-center gap-1"><Phone size={10} /> {h.phone}</span>}
                        {h.address && <span className="flex items-center gap-1"><MapPin size={10} className="flex-shrink-0" /> {h.address}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleStatus(h.id, 'Active')}
                    disabled={togglingId === h.id}
                    className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 text-[10px] font-bold px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto disabled:opacity-50"
                  >
                    {togglingId === h.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <Power size={12} /> Deactivate
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inactive Hotels Column */}
        <div className="bg-white border border-[#DDE5D0] shadow-sm rounded-3xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between border-b border-[#F0F3E8] pb-3 mb-2">
            <div className="flex items-center gap-2">
              <XCircle className="text-red-500" size={18} />
              <div>
                <h4 className="font-bold text-[#1A2E05] text-sm">Inactive Hotels</h4>
                <p className="text-[10px] text-[#7A8A6A] font-semibold mt-0.5">Hotels currently deactivated</p>
              </div>
            </div>
            <span className="bg-red-50 border border-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
              {inactiveHotelsList.length} Offline
            </span>
          </div>

          {inactiveHotelsList.length === 0 ? (
            <div className="py-12 text-center text-[#7A8A6A] text-xs font-semibold">
              No suspended or inactive hotels.
            </div>
          ) : (
            <div className="space-y-4">
              {inactiveHotelsList.map((h) => (
                <div 
                  key={h.id} 
                  className="border border-[#DDE5D0] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-red-400 transition-all bg-[#F5F7F0]/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 border border-[#DDE5D0] flex items-center justify-center overflow-hidden flex-shrink-0 grayscale">
                      {h.logoUrl ? (
                        <img src={h.logoUrl} alt={h.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building size={20} className="text-gray-400" />
                      )}
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-500 leading-snug">{h.name}</h5>
                      <div className="flex flex-col gap-0.5 mt-1 text-[10px] text-gray-400 font-semibold">
                        {h.phone && <span className="flex items-center gap-1"><Phone size={10} /> {h.phone}</span>}
                        {h.address && <span className="flex items-center gap-1"><MapPin size={10} className="flex-shrink-0" /> {h.address}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleStatus(h.id, 'Inactive')}
                    disabled={togglingId === h.id}
                    className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-600 text-[10px] font-bold px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto disabled:opacity-50"
                  >
                    {togglingId === h.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <PlayCircle size={12} /> Activate
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-[#DDE5D0] shadow-2xl rounded-3xl p-6 max-w-sm w-full animate-slide-up space-y-4">
            <div className="flex items-center gap-2.5 border-b border-[#F0F3E8] pb-3">
              <div className={`p-2 rounded-xl ${confirmModal.currentStatus === 'Active' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                <AlertCircle size={18} />
              </div>
              <div>
                <h3 className="font-bold text-[#1A2E05] text-sm capitalize">
                  {confirmModal.currentStatus === 'Active' ? 'Deactivate Hotel' : 'Activate Hotel'}
                </h3>
                <p className="text-[10px] text-[#7A8A6A] font-semibold mt-0.5">Please confirm your action</p>
              </div>
            </div>

            <p className="text-xs text-[#4A5E38] leading-relaxed">
              Are you sure you want to <strong>{confirmModal.currentStatus === 'Active' ? 'deactivate' : 'activate'}</strong> {stats?.hotels.find(h => h.id === confirmModal.hotelId)?.name}? 
              {confirmModal.currentStatus === 'Active' 
                ? ' This hotel\'s login accounts will be temporarily suspended.' 
                : ' This hotel\'s login accounts will be immediately reactivated.'}
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setConfirmModal({ isOpen: false, hotelId: null, currentStatus: '' })}
                className="flex-1 py-2 bg-white border border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F5F7F0] hover:text-[#1A2E05] font-bold text-xs rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { hotelId, currentStatus } = confirmModal;
                  setConfirmModal({ isOpen: false, hotelId: null, currentStatus: '' });
                  await executeToggleStatus(hotelId, currentStatus);
                }}
                className={`flex-1 py-2 text-white font-bold text-xs rounded-xl transition-all shadow-md ${
                  confirmModal.currentStatus === 'Active' 
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/10' 
                    : 'bg-[#84A63C] hover:bg-[#729231] shadow-[#84A63C]/10'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SuperAdminDashboard;
