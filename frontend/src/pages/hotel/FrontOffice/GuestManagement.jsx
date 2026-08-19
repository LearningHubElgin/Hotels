import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, UserPlus, Calendar, MapPin, CreditCard, Search, Filter, X,
  CheckCircle2, Clock, ChevronRight, ChevronLeft, MoreVertical, Mail, Phone, Globe, DoorOpen, Loader2, Camera, Upload, Trash2, Printer, FileText, Edit2, Eye, Info, Download, Edit
} from 'lucide-react';
import api from '../../../services/api';
import WebcamCapture from '../../../components/WebcamCapture';
import ImageCropper from '../../../components/ImageCropper';
import { generateCheckInVoucher } from '../../../utils/pdfGenerator';
import { generateBookingConfirmationVoucher } from '../../../utils/bookingConfirmationGenerator';
import { compressImage } from '../../../utils/imageCompressor';
import { useLocation } from 'react-router-dom';
import { cleanRoomNumber } from '../../../utils/roomHelper';
import AddGuestModal from '../../../components/AddGuestModal';
import CheckoutConfirmModal from '../../../components/CheckoutConfirmModal';
import GuestDetailModal from '../../../components/GuestDetailModal';
import EarlyCheckinWarningModal from '../../../components/EarlyCheckinWarningModal';
import CancelBookingModal from '../../../components/CancelBookingModal';
import QuickCheckInModal from '../../../components/QuickCheckInModal';





const StatCard = ({ label, value, subtext, icon: Icon, color, bgClass }) => (
  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DDE5D0] shadow-md shadow-[#84A63C]/5 flex items-center gap-4 group hover:shadow-md transition-all duration-500">
    <div className={`p-3 ${bgClass} rounded-xl ${color} group-hover:scale-110 transition-transform`}>
      <Icon size={20} className="w-5 h-5" strokeWidth={2.5} />
    </div>
    <div>
      <p className="text-[10px] sm:text-xs font-bold text-[#4A5E38] uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <p className="text-lg sm:text-xl font-black text-[#1A2E05] tracking-tight">{value}</p>
        <span className="text-[9px] font-bold text-[#7A8A6A] ml-1">{subtext}</span>
      </div>
    </div>
  </div>
);

// Using shared GuestDetailModal for profile details view

const ConflictModal = ({ isOpen, onClose, conflict }) => {
  if (!isOpen || !conflict) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-slide-up p-8 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Calendar size={32} className="text-orange-600" />
        </div>
        <h3 className="text-xl font-bold text-[#1A2E05] mb-2">Room Already Reserved!</h3>
        <p className="text-sm text-[#7A8A6A] mb-8">This room is already booked during your selected dates.</p>
        <button onClick={onClose} className="w-full py-4 bg-[#1A2E05] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all">Select Other Room/Dates</button>
      </div>
    </div>,
    document.body
  );
};

// Format a "HH:MM" 24-hr string to "HH:MM AM/PM"
const formatTime12hr = (timeStr, fallback = '12:00 PM') => {
  if (!timeStr) return fallback;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return fallback;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ampm}`;
};

// Format a DATEONLY string "YYYY-MM-DD" to "DD-MM-YYYY" safely (no UTC conversion)
const formatDateDMY = (dateStr) => {
  if (!dateStr) return '';
  const plain = dateStr.split('T')[0]; // strip any time part
  const [y, mo, d] = plain.split('-');
  return `${d}-${mo}-${y}`;
};

const GuestManagement = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingGuest, setViewingGuest] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [conflictData, setConflictData] = useState(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [earlyWarningBooking, setEarlyWarningBooking] = useState(null);
  const [isEarlyWarningOpen, setIsEarlyWarningOpen] = useState(false);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [guests, setGuests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [checkoutData, setCheckoutData] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery]);

  // Fetch when page, filter, search, or route navigation changes
  useEffect(() => {
    fetchData();
    if (location.state?.openNewRegistration) {
      setIsModalOpen(true);
    }
  }, [currentPage, activeFilter, searchQuery, location.state]);

  useEffect(() => {
    if (isModalOpen || isConflictOpen || isViewModalOpen || !!checkoutData) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isConflictOpen, isViewModalOpen, checkoutData]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const guestsParams = {
        page: currentPage,
        limit: 10,
        search: searchQuery
      };
      if (activeFilter !== 'All') {
        guestsParams.status = activeFilter;
      }

      const [guestsRes, roomsRes] = await Promise.all([
        api.get('/bookings/active', { params: guestsParams }),
        api.get('/rooms')
      ]);
      setGuests(guestsRes.data.data);
      setTotalPages(guestsRes.data.totalPages || 1);
      setTotalRecords(guestsRes.data.totalRecords || guestsRes.data.data.length);
      setRooms(roomsRes.data.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: rooms.length,
    occupied: rooms.filter(r => r.status === 'occupied').length,
    available: rooms.filter(r => r.status === 'available').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length
  };

  const handleConfirm = async (bookingData) => {
    try {
      if (selectedGuest) {
        await api.put(`/bookings/${selectedGuest.id}`, bookingData);
      } else {
        await api.post('/bookings', bookingData);
      }
      fetchData();
      setIsModalOpen(false);
      setSelectedGuest(null);
    } catch (error) {
      if (error.response?.status === 409) {
        setConflictData(error.response.data.conflict);
        setIsConflictOpen(true);
      } else {
        alert(error.response?.data?.message || 'Failed to save guest');
      }
    }
  };

  const [quickCheckInBooking, setQuickCheckInBooking] = useState(null);
  const [isQuickCheckInOpen, setIsQuickCheckInOpen] = useState(false);

  const executeQuickCheckIn = async (bookingId, checkInDate, checkInTime) => {
    try {
      await api.put(`/bookings/${bookingId}/checkin`, { checkInDate, checkInTime });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to check in guest');
      throw error;
    }
  };

  const handleCheckIn = async (bookingId) => {
    const booking = guests.find(g => g.id === bookingId);
    if (!booking) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayYMD = `${yyyy}-${mm}-${dd}`;
    const checkInYMD = booking.checkInDate ? booking.checkInDate.split('T')[0] : '';

    if (checkInYMD && checkInYMD > todayYMD) {
      setEarlyWarningBooking(booking);
      setIsEarlyWarningOpen(true);
      return;
    }

    setQuickCheckInBooking(booking);
    setIsQuickCheckInOpen(true);
  };

  const executeCheckout = async (checkOutDate, checkOutTime) => {
    if (!checkoutData || !checkoutData.booking) return;
    try {
      await api.put(`/bookings/${checkoutData.booking.id}/checkout`, { checkOutDate, checkOutTime });
      setCheckoutData(null);
      fetchData();
    } catch (error) {
      console.error('Error checking out:', error);
      alert('Failed to check out guest');
    }
  };

  const handleCheckOut = async (bookingId) => {
    const booking = guests.find(g => g.id === bookingId);
    if (booking) {
      setCheckoutData({
        booking,
        room: { roomNumber: booking.Room?.roomNumber || booking.roomNumber || 'N/A' }
      });
    } else {
      if (window.confirm('Are you sure?')) {
        try {
          await api.put(`/bookings/${bookingId}/checkout`);
          fetchData();
        } catch (error) {
          alert('Failed to check out guest');
        }
      }
    }
  };

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    const dOnly = dateStr.split('T')[0];
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return dOnly === `${yyyy}-${mm}-${dd}`;
  };

  const handleCancelCheckin = (bookingId) => {
    const booking = guests.find(g => g.id === bookingId);
    if (booking) {
      setCancelModalBooking(booking);
      setIsCancelModalOpen(true);
    }
  };

  const handleExecuteCancel = async (cancellationData) => {
    if (!cancelModalBooking) return;
    try {
      await api.delete(`/bookings/${cancelModalBooking.id}`, { data: cancellationData });
      setIsCancelModalOpen(false);
      setCancelModalBooking(null);
      fetchData();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert(error.response?.data?.message || 'Failed to cancel check-in');
    }
  };

  const uniqueGuests = [];
  const seenGroups = new Set();

  guests.forEach(guest => {
    if (guest.groupBookingId) {
      if (!seenGroups.has(guest.groupBookingId)) {
        seenGroups.add(guest.groupBookingId);
        uniqueGuests.push(guest);
      }
    } else {
      uniqueGuests.push(guest);
    }
  });

  const filteredGuests = uniqueGuests;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2E05] tracking-tight">Guest Registry</h1>
          <p className="text-[10px] font-bold text-[#4A5E38] mt-1 flex items-center gap-2">
            Onboarding & Occupancy Control <span className="w-1.5 h-1.5 rounded-full bg-[#84A63C] animate-pulse"></span>
          </p>
        </div>
        <button onClick={() => { setSelectedGuest(null); setIsModalOpen(true); }} className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-[#1C2B12] text-white rounded-2xl text-[10px] font-black shadow-2xl hover:opacity-90 transition-all active:scale-95">
          <UserPlus size={18} /> New Registration
        </button>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        <StatCard 
          label="Total Rooms" 
          value={stats.total} 
          subtext="Units" 
          icon={DoorOpen} 
          color="text-blue-600" 
          bgClass="bg-blue-50" 
        />
        <StatCard 
          label="Occupied Today" 
          value={stats.occupied} 
          subtext="Booked" 
          icon={Clock} 
          color="text-red-600" 
          bgClass="bg-red-50" 
        />
        <StatCard 
          label="Available" 
          value={stats.available} 
          subtext="Vacant" 
          icon={CheckCircle2} 
          color="text-[#5C7A1F]" 
          bgClass="bg-[#F0F3E8]" 
        />
        <StatCard 
          label="Maintenance" 
          value={stats.maintenance} 
          subtext="Pending" 
          icon={Trash2} 
          color="text-orange-600" 
          bgClass="bg-orange-50" 
        />
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#F0F3E8] rounded-xl w-full lg:w-auto border border-[#DDE5D0]">
          {['All', 'Confirmed', 'Active'].map(filter => (
            <button key={filter} onClick={() => setActiveFilter(filter)} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeFilter === filter ? 'bg-white text-[#5C7A1F] shadow-sm' : 'text-[#7A8A6A]'}`}>{filter}</button>
          ))}
        </div>
        <div className="relative group w-full lg:w-96">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A8A6A]" />
          <input type="text" placeholder="Search guests, rooms..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-[#DDE5D0] rounded-xl text-sm font-bold focus:outline-none focus:border-[#84A63C] shadow-sm transition-all" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 size={40} className="animate-spin text-[#84A63C]" /></div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-3xl border border-[#DDE5D0] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F0F3E8]/50 border-b border-[#DDE5D0]">
                    <th className="px-6 py-5 text-[10px] font-bold text-[#4A5E38]">Room</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-[#4A5E38]">Guest Details</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-[#4A5E38]">Stay Period</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-[#4A5E38]">Status</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-[#4A5E38] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F3E8]">
                  {filteredGuests.length > 0 ? (
                    filteredGuests.map((guest) => {
                      let roomDisplay = cleanRoomNumber(guest.Room?.roomNumber);
                      let typeDisplay = guest.Room?.type;
                      let isGroup = guest.groupBookings && guest.groupBookings.length > 1;

                      if (isGroup) {
                        roomDisplay = guest.groupBookings.map(b => cleanRoomNumber(b.Room?.roomNumber || b.roomId)).join(', ');
                        typeDisplay = "Multiple Rooms";
                      }
                      
                      return (
                      <tr key={guest.id} className="hover:bg-[#F0F3E8]/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 bg-[#F0F3E8] rounded-xl flex items-center justify-center text-[#1A2E05] border border-[#DDE5D0] font-bold text-sm px-2 ${isGroup ? 'w-auto min-w-[40px]' : 'w-10'}`}>
                              {roomDisplay}
                            </div>
                            <p className="text-[10px] font-bold text-[#4A5E38] max-w-[120px] truncate" title={typeDisplay}>{typeDisplay}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <h3 className="text-sm font-bold text-[#1A2E05]">{guest.guestName}</h3>
                          {/* <p className="text-[10px] font-bold text-[#4A5E38]">{guest.phone}</p> */}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-[#1A2E05]">
                            <Calendar size={14} className="text-[#84A63C] shrink-0" />
                            <div className="flex items-center gap-2">
                              {/* Check-in */}
                              <div className="flex flex-col leading-tight">
                                <span className="text-xs font-bold text-[#1A2E05]">{formatDateDMY(guest.checkInDate)}</span>
                                <span className="text-[10px] font-semibold text-[#7A8A6A]">{guest.checkInTime ? formatTime12hr(guest.checkInTime) : new Date(guest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                              </div>
                              <span className="text-[#84A63C] font-black text-sm">→</span>
                              {/* Check-out */}
                              <div className="flex flex-col leading-tight">
                                <span className="text-xs font-bold text-[#1A2E05]">{formatDateDMY(guest.checkOutDate)}</span>
                                <span className="text-[10px] font-semibold text-[#7A8A6A]">{guest.checkOutTime ? formatTime12hr(guest.checkOutTime) : '11:00 AM'}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-bold ${guest.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                            {guest.status === 'Confirmed' ? 'Reserved' : guest.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {guest.status === 'Confirmed' && (
                              <button onClick={() => handleCheckIn(guest.id)} className="px-4 py-2 bg-[#84A63C] text-white rounded-xl text-[10px] font-bold hover:opacity-90 transition-all">Check-In</button>
                            )}
                            {guest.status === 'Active' && (
                              <button onClick={() => handleCheckOut(guest.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 hover:bg-red-100 transition-all">Check-Out</button>
                            )}
                            <div className="flex gap-1">
                              <button onClick={() => { setViewingGuest(guest); setIsViewModalOpen(true); }} title="View Guest Details" className="p-2 bg-[#F0F3E8] text-[#5C7A1F] rounded-lg hover:bg-[#DDE5D0] transition-all"><Eye size={14} /></button>
                              <button onClick={() => generateCheckInVoucher(guest)} title="Download Voucher" className="p-2 bg-[#F0F3E8] text-[#5C7A1F] rounded-lg hover:bg-[#DDE5D0] transition-all"><Download size={14} /></button>
                              <button onClick={() => { setSelectedGuest(guest); setIsModalOpen(true); }} title="Edit Guest Details" className="p-2 bg-[#F0F3E8] text-[#1A2E05] rounded-lg hover:bg-[#DDE5D0] transition-all"><Edit size={14} /></button>
                              {(guest.status === 'Confirmed' || (guest.status === 'Active' && isToday(guest.checkInDate))) && (
                                <button onClick={() => handleCancelCheckin(guest.id)} title={guest.status === 'Confirmed' ? 'Cancel Reservation' : 'Cancel Check-in'} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all border border-red-100"><Trash2 size={14} /></button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )})
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-20 text-center text-[#4A5E38] font-bold text-[11px]">
                        No active registrations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Desktop Pagination */}
            <div className="bg-[#F9FAFA] px-6 py-6 flex items-center justify-between border-t border-[#DDE5D0]">
              <p className="text-[10px] font-black text-[#4A5E38]">
                Page <span className="text-[#1A2E05]">{currentPage}</span> / <span className="text-[#1A2E05]">{totalPages}</span> (Total: {totalRecords})
              </p>
              <div className="flex gap-3">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronLeft size={18} /></button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronRight size={18} /></button>
              </div>
            </div>
          </div>

          {/* Mobile Stacked View */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredGuests.length > 0 ? (
              filteredGuests.map((guest) => {
                let roomDisplay = cleanRoomNumber(guest.Room?.roomNumber);
                let typeDisplay = guest.Room?.type;
                let isGroup = guest.groupBookings && guest.groupBookings.length > 1;

                if (isGroup) {
                  roomDisplay = guest.groupBookings.map(b => cleanRoomNumber(b.Room?.roomNumber || b.roomId)).join(', ');
                  typeDisplay = "Multiple Rooms";
                }
                
                return (
                <div key={guest.id} className="bg-white p-5 rounded-3xl border border-[#DDE5D0] shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className={`h-10 bg-[#F0F3E8] rounded-xl flex items-center justify-center text-[#1A2E05] border border-[#DDE5D0] font-bold text-sm shrink-0 px-2 ${isGroup ? 'w-auto min-w-[40px]' : 'w-10'}`}>
                        {roomDisplay}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#1A2E05] leading-tight">{guest.guestName}</h3>
                        <p className="text-[10px] font-bold text-[#4A5E38] mt-0.5 max-w-[150px] truncate" title={typeDisplay}>{typeDisplay}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-bold ${guest.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                      {guest.status === 'Confirmed' ? 'Reserved' : guest.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[#1A2E05] bg-[#F0F3E8]/50 p-2 rounded-xl border border-[#F0F3E8]">
                    <Calendar size={14} className="text-[#84A63C]" />
                    <span className="text-[10px] font-bold">
                      {formatDateDMY(guest.checkInDate)} {guest.checkInTime ? formatTime12hr(guest.checkInTime) : new Date(guest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} → {formatDateDMY(guest.checkOutDate)} {guest.checkOutTime ? formatTime12hr(guest.checkOutTime) : '11:00 AM'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {guest.status === 'Confirmed' && (
                      <button onClick={() => handleCheckIn(guest.id)} className="flex-1 py-3 bg-[#84A63C] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all">Check-In</button>
                    )}
                    {guest.status === 'Active' && (
                      <button onClick={() => handleCheckOut(guest.id)} className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100">Check-Out</button>
                    )}
                    <div className="flex gap-1">
                      <button onClick={() => { setViewingGuest(guest); setIsViewModalOpen(true); }} className="p-3 bg-[#F0F3E8] text-[#5C7A1F] rounded-xl"><Eye size={16} /></button>
                      <button onClick={() => generateCheckInVoucher(guest)} className="p-3 bg-[#F0F3E8] text-[#5C7A1F] rounded-xl"><Download size={16} /></button>
                      <button onClick={() => { setSelectedGuest(guest); setIsModalOpen(true); }} className="p-3 bg-[#F0F3E8] text-[#1A2E05] rounded-xl"><Edit size={16} /></button>
                    </div>
                  </div>
                </div>
              )})
            ) : (
              <div className="bg-white p-8 rounded-3xl border border-[#DDE5D0] text-center text-[#4A5E38] font-bold text-[11px]">
                No active registrations found.
              </div>
            )}

            {/* Mobile Pagination */}
            <div className="bg-white p-6 rounded-3xl border border-[#DDE5D0] flex items-center justify-between shadow-sm">
              <p className="text-[10px] font-black text-[#4A5E38]">
                Page <span className="text-[#1A2E05]">{currentPage}</span> / <span className="text-[#1A2E05]">{totalPages}</span> (Total: {totalRecords})
              </p>
              <div className="flex gap-3">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronLeft size={18} /></button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#DDE5D0] bg-white text-[#1C2B12] disabled:opacity-30 shadow-sm active:scale-95 transition-all"><ChevronRight size={18} /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AddGuestModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={handleConfirm} initialData={selectedGuest} />
      <GuestDetailModal 
        isOpen={isViewModalOpen} 
        onClose={() => { setIsViewModalOpen(false); setViewingGuest(null); }} 
        booking={viewingGuest} 
        room={viewingGuest?.Room}
        loading={false}
        onCheckOut={() => {
          setIsViewModalOpen(false);
          handleCheckOut(viewingGuest?.id);
        }}
        onCheckIn={() => {
          setIsViewModalOpen(false);
          handleCheckIn(viewingGuest?.id);
        }}
        onEdit={() => {
          setIsViewModalOpen(false);
          setSelectedGuest(viewingGuest);
          setIsModalOpen(true);
        }}
        onDeleteSuccess={() => {
          setIsViewModalOpen(false);
          setViewingGuest(null);
          fetchData();
        }}
      />
      <ConflictModal isOpen={isConflictOpen} onClose={() => setIsConflictOpen(false)} conflict={conflictData} />
      <EarlyCheckinWarningModal
        isOpen={isEarlyWarningOpen}
        onClose={() => setIsEarlyWarningOpen(false)}
        booking={earlyWarningBooking}
        onEdit={(bookingToEdit) => {
          setSelectedGuest(bookingToEdit);
          setIsModalOpen(true);
        }}
      />
      <CancelBookingModal
        isOpen={isCancelModalOpen}
        onClose={() => {
          setIsCancelModalOpen(false);
          setCancelModalBooking(null);
        }}
        booking={cancelModalBooking}
        room={{ roomNumber: cancelModalBooking?.Room?.roomNumber || cancelModalBooking?.previousRoomNumber || 'N/A' }}
        onConfirm={handleExecuteCancel}
      />
      {checkoutData && (
        <CheckoutConfirmModal
          isOpen={!!checkoutData}
          onClose={() => setCheckoutData(null)}
          onConfirm={executeCheckout}
          booking={checkoutData.booking}
          room={checkoutData.room}
        />
      )}

      <QuickCheckInModal
        isOpen={isQuickCheckInOpen}
        onClose={() => { setIsQuickCheckInOpen(false); setQuickCheckInBooking(null); }}
        booking={quickCheckInBooking}
        onConfirm={executeQuickCheckIn}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
};

export default GuestManagement;