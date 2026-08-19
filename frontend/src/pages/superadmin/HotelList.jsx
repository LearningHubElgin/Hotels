import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, Phone, Mail, MapPin, Eye, Edit, Plus, ArrowRight, Loader2, AlertCircle, X, Users, Calendar, FileText, ShieldCheck } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const HotelList = () => {
  const navigate = useNavigate();
  
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // View Details Modal State
  const [viewingHotel, setViewingHotel] = useState(null);
  const [viewingUsers, setViewingUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const fetchHotels = async () => {
    try {
      setLoading(true);
      const res = await api.get('/hotels');
      if (res.data.success) {
        setHotels(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch hotels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHotels();
  }, []);

  const openViewModal = async (hotel) => {
    setViewingHotel(hotel);
    setIsViewOpen(true);
    setLoadingUsers(true);
    setViewingUsers([]);
    try {
      const res = await api.get(`/hotels/${hotel.id}/users`);
      if (res.data.success) {
        setViewingUsers(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#84A63C]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header with Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#1A2E05] tracking-tight">Hotel Directory</h2>
          <p className="text-xs text-[#7A8A6A] font-semibold mt-0.5">Manage and switch between property workspaces</p>
        </div>
        <button
          onClick={() => navigate('/superadmin/hotels/add')}
          className="bg-[#84A63C] hover:bg-[#729231] text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-[#84A63C]/10 flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus size={14} /> Add New Hotel
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm font-semibold max-w-md mx-auto shadow-sm">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Hotel Cards Grid */}
      {hotels.length === 0 ? (
        <div className="py-20 text-center text-[#7A8A6A] font-semibold bg-white border border-[#DDE5D0] rounded-3xl p-8">
          No properties registered yet. Click "Add New Hotel" to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hotels.map((h) => {
            return (
              <div 
                key={h.id} 
                className="bg-white border border-[#DDE5D0] shadow-sm rounded-3xl p-5 hover:shadow-md transition-shadow duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#F0F3E8] border border-[#DDE5D0] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {h.logoUrl ? (
                          <img src={h.logoUrl} alt={h.name} className="w-full h-full object-cover" />
                        ) : (
                          <Building size={20} className="text-[#84A63C]" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#1A2E05] leading-snug">{h.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-[#7A8A6A] font-bold uppercase tracking-wider">
                            {h.hotelType || 'Hotel'}
                          </span>
                          <span className="text-[9px] text-[#DDE5D0]">•</span>
                          <span className="text-[10px] text-[#84A63C] font-extrabold uppercase tracking-wider">
                            ID: {h.id}
                          </span>
                          <span className="text-[9px] text-[#DDE5D0]">•</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            h.status === 'Inactive' ? 'text-red-500' : 'text-emerald-600'
                          }`}>
                            {h.status || 'Active'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/superadmin/hotels/edit/${h.id}`)}
                        title="Edit Hotel Profile"
                        className="p-2 hover:bg-[#F0F3E8] rounded-xl text-[#7A8A6A] hover:text-[#84A63C] transition-colors"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => openViewModal(h)}
                        title="View Details"
                        className="p-2 hover:bg-[#F0F3E8] rounded-xl text-[#7A8A6A] hover:text-blue-500 transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-[#4A5E38] font-medium border-t border-[#F0F3E8] pt-3 mt-3">
                    {h.address && (
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="text-[#7A8A6A] mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{h.address}</span>
                      </div>
                    )}
                    {h.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-[#7A8A6A] flex-shrink-0" />
                        <span>{h.phone}</span>
                      </div>
                    )}
                    {h.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="text-[#7A8A6A] flex-shrink-0 text-ellipsis overflow-hidden" />
                        <span>{h.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View Modal */}
      {isViewOpen && viewingHotel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white border border-[#DDE5D0] shadow-2xl rounded-3xl max-w-2xl w-full p-6 sm:p-8 animate-scale-up relative max-h-[85vh] overflow-y-auto no-scrollbar">
            <button
              onClick={() => { setIsViewOpen(false); setViewingHotel(null); }}
              className="absolute top-5 right-5 p-1.5 hover:bg-[#F0F3E8] rounded-xl text-[#7A8A6A] hover:text-[#1A2E05] transition-all"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[#F0F3E8]">
              <div className="w-16 h-16 rounded-2xl bg-[#F0F3E8] border border-[#DDE5D0] flex items-center justify-center overflow-hidden">
                {viewingHotel.logoUrl ? (
                  <img src={viewingHotel.logoUrl} alt={viewingHotel.name} className="w-full h-full object-cover" />
                ) : (
                  <Building size={28} className="text-[#84A63C]" />
                )}
              </div>
              <div>
                <h3 className="font-black text-[#1A2E05] text-lg tracking-tight leading-snug">{viewingHotel.name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[10px] text-[#84A63C] font-bold uppercase tracking-wider">Hotel Profile Details</p>
                  <span className="text-[9px] text-[#DDE5D0]">•</span>
                  <span className="text-[10px] bg-[#84A63C]/10 text-[#5C7A1F] px-1.5 py-0.5 rounded font-black">
                    ID: {viewingHotel.id}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Card 1: Contact & Location details */}
              <div className="bg-[#F5F7F0] border border-[#DDE5D0] rounded-2xl p-4 space-y-3.5 shadow-sm">
                <div className="flex items-start gap-3 text-sm">
                  <MapPin size={16} className="text-[#84A63C] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">Address Location</p>
                    <p className="font-semibold text-[#1A2E05] mt-0.5 leading-snug">{viewingHotel.address || 'Not specified'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm pt-2.5 border-t border-[#DDE5D0]/40">
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="text-[#84A63C] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">Contact Phone</p>
                      <p className="font-semibold text-[#1A2E05] mt-0.5">{viewingHotel.phone || 'Not specified'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail size={16} className="text-[#84A63C] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">Email Address</p>
                      <p className="font-semibold text-[#1A2E05] mt-0.5 break-all leading-normal">{viewingHotel.email || 'Not specified'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-sm pt-2.5 border-t border-[#DDE5D0]/40">
                  <Calendar size={16} className="text-[#84A63C] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">Registered Since</p>
                    <p className="font-semibold text-[#1A2E05] mt-0.5">{new Date(viewingHotel.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Billing & System Configurations */}
              <div className="bg-[#F5F7F0] border border-[#DDE5D0] rounded-2xl p-4 space-y-3.5 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">GSTIN Number</p>
                    <p className="font-semibold text-[#1A2E05] mt-0.5 flex items-center gap-1.5">
                      <Building size={14} className="text-[#84A63C] shrink-0" />
                      {viewingHotel.gstin || 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">Invoice / Billing Template</p>
                    <p className="font-semibold text-[#1A2E05] mt-0.5 flex items-center gap-1.5 capitalize">
                      <FileText size={14} className="text-[#84A63C] shrink-0" />
                      {viewingHotel.billingTemplateId === 'template_1'
                        ? 'Template 1'
                        : viewingHotel.billingTemplateId === 'template_2'
                        ? 'Template 2'
                        : viewingHotel.billingTemplateId || 'Template 1'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: Feature Toggles / Privileges */}
              <div className="bg-[#F5F7F0] border border-[#DDE5D0] rounded-2xl p-4 space-y-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#84A63C]" />
                  <p className="text-[9px] text-[#7A8A6A] font-bold uppercase tracking-wider">Hotel Privileges & Modules</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.hasKot !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">KOT Module</span>
                    <span className="text-xs font-bold">{viewingHotel.hasKot !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.hasAccounts !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Accounts Module</span>
                    <span className="text-xs font-bold">{viewingHotel.hasAccounts !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.hasActivityLogs !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Activity Logs</span>
                    <span className="text-xs font-bold">{viewingHotel.hasActivityLogs !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.hasOpeningBalance !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Opening Balance</span>
                    <span className="text-xs font-bold">{viewingHotel.hasOpeningBalance !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.allowHotelEdit
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Profile Edit</span>
                    <span className="text-xs font-bold">{viewingHotel.allowHotelEdit ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.allowBillingEdit !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Billing Edit</span>
                    <span className="text-xs font-bold">{viewingHotel.allowBillingEdit !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.allowPaymentEdit !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Old Payment Edit</span>
                    <span className="text-xs font-bold">{viewingHotel.allowPaymentEdit !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
                    viewingHotel.hasAssets !== false
                      ? 'bg-green-50/50 border-green-200 text-green-700'
                      : 'bg-red-50/50 border-red-200 text-red-600'
                  }`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">Assets Module</span>
                    <span className="text-xs font-bold">{viewingHotel.hasAssets !== false ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 bg-blue-50/50 border-blue-200 text-blue-700`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">GST Rate</span>
                    <span className="text-xs font-bold">{viewingHotel.defaultGstRate !== undefined ? viewingHotel.defaultGstRate : 12}%</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 bg-blue-50/50 border-blue-200 text-blue-700`}>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider opacity-85">HSN/SAC Code</span>
                    <span className="text-xs font-bold">{viewingHotel.defaultHsnCode || '996311'}</span>
                  </div>
                </div>
              </div>

              {/* Associated Users */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-[#1A2E05] font-black tracking-tight">
                  <Users size={16} className="text-[#84A63C]" />
                  <span>Authorized Staff Accounts ({viewingUsers.length})</span>
                </div>

                {loadingUsers ? (
                  <div className="py-8 flex justify-center items-center">
                    <Loader2 size={24} className="animate-spin text-[#84A63C]" />
                  </div>
                ) : viewingUsers.length === 0 ? (
                  <div className="text-center p-6 bg-[#F5F7F0]/50 border border-dashed border-[#DDE5D0] rounded-2xl text-[#7A8A6A] text-xs font-semibold">
                    No staff accounts provisioned for this hotel.
                  </div>
                ) : (
                  <div className="border border-[#DDE5D0] rounded-2xl divide-y divide-[#DDE5D0] overflow-hidden max-h-40 overflow-y-auto no-scrollbar">
                    {viewingUsers.map((u) => (
                      <div key={u.id} className="p-3 flex items-center justify-between hover:bg-[#F5F7F0]/30 transition-colors">
                        <div>
                          <p className="text-xs font-bold text-[#1A2E05]">{u.username}</p>
                          <p className="text-[9px] text-[#7A8A6A] font-bold uppercase mt-0.5">Created {new Date(u.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full capitalize ${
                          u.role === 'superadmin' 
                            ? 'bg-purple-100 text-purple-700' 
                            : u.role === 'admin' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#F0F3E8] flex justify-end">
              <button
                type="button"
                onClick={() => { setIsViewOpen(false); setViewingHotel(null); }}
                className="bg-[#1C2B12] hover:bg-[#2c3d21] text-white text-xs font-bold px-5 py-2 rounded-xl transition-colors"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HotelList;
