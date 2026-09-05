import React, { useState, useEffect } from 'react';
import { Building, Phone, Mail, MapPin, Loader2, AlertCircle, CheckCircle, Upload, ShieldAlert } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/logo.png';

const isTruthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

const convertTo24Hour = (timeStr) => {
  if (!timeStr) return "11:00";
  if (!timeStr.includes("AM") && !timeStr.includes("PM")) {
    return timeStr.substring(0, 5);
  }
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return "11:00";
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const SettingsPage = () => {
  const { activeHotel, refreshHotel } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    logoUrl: '',
    gstin: '',
    city: '',
    state: '',
    hotelType: 'Hotel',
    allowHotelEdit: false,
    checkoutTime: '11:00',
    invoicePrefix: 'INV-',
    since: '',
    defaultGstRate: 12,
    defaultHsnCode: '996311',
    hasRoomType: false,
    roomTypes: '',
    bookingPlatforms: '',
    onlinePaymentBanks: '',
    enableRegistrationNumber: false
  });

  useEffect(() => {
    if (activeHotel) {
      setFormData({
        name: activeHotel.name || '',
        address: activeHotel.address || '',
        phone: activeHotel.phone || '',
        email: activeHotel.email || '',
        logoUrl: activeHotel.logoUrl || '',
        gstin: activeHotel.gstin || '',
        city: activeHotel.city || '',
        state: activeHotel.state || '',
        hotelType: activeHotel.hotelType || 'Hotel',
        allowHotelEdit: isTruthy(activeHotel.allowHotelEdit),
        checkoutTime: convertTo24Hour(activeHotel.checkoutTime),
        invoicePrefix: (activeHotel.invoicePrefix !== undefined && activeHotel.invoicePrefix !== null) ? activeHotel.invoicePrefix : 'INV-',
        since: activeHotel.since || '',
        defaultGstRate: activeHotel.defaultGstRate !== undefined ? activeHotel.defaultGstRate : 12,
        defaultHsnCode: activeHotel.defaultHsnCode || '996311',
        hasRoomType: activeHotel.hasRoomType !== false,
        roomTypes: Array.isArray(activeHotel.roomTypes) ? activeHotel.roomTypes.map(rt => rt.name).join(', ') : (activeHotel.roomTypes || ''),
        bookingPlatforms: activeHotel.bookingPlatforms || '',
        onlinePaymentBanks: activeHotel.onlinePaymentBanks || '',
        enableAutoExtendCheckout: isTruthy(activeHotel.enableAutoExtendCheckout),
        autoExtendCutoffTime: convertTo24Hour(activeHotel.autoExtendCutoffTime || '11:30 AM'),
        enableRegistrationNumber: isTruthy(activeHotel.enableRegistrationNumber)
      });
    }
  }, [activeHotel]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Logo size must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, logoUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleLogoRemove = () => {
    setFormData(prev => ({ ...prev, logoUrl: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      setError('Hotel Name is required.');
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await api.put(`/hotels/${activeHotel.id}`, formData);
      if (res.data.success) {
        setSuccess('Hotel profile updated successfully!');
        if (refreshHotel) {
          await refreshHotel(activeHotel.id);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to update hotel profile.');
    } finally {
      setSaving(false);
    }
  };

  const isEditable = formData.allowHotelEdit;

  return (
    <div className="space-y-6">
      {/* Edit Authorization Notice */}
      {!isEditable && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex gap-3.5 items-start text-orange-800">
          <div className="p-1 bg-orange-100 rounded-lg text-orange-700 shrink-0">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h4 className="font-bold text-sm leading-normal">Hotel Profile Settings Locked</h4>
            <p className="text-xs text-orange-700 font-semibold mt-0.5 leading-relaxed">
              Profile editing is disabled by the SuperAdmin. You can view details, but modifications are restricted. Please contact support if you need to update logo or billing records.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3.5 rounded-2xl flex items-center gap-2 text-xs font-semibold">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3.5 rounded-2xl flex items-center gap-2 text-xs font-semibold">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Logo management */}
        <div className="bg-white border border-[#DDE5D0] shadow-md shadow-[#84A63C]/5 rounded-3xl p-6 sm:p-7 flex flex-col items-center text-center space-y-6">
          <div className="space-y-1">
            <h3 className="font-bold text-[#1A2E05] text-sm">Hotel Brand Logo</h3>
            <p className="text-[10px] text-[#7A8A6A] font-semibold">Used on print invoices and dashboard headers</p>
          </div>

          <div className="relative group">
            <div className="w-36 h-36 rounded-full bg-[#F5F7F0] border-2 border-[#DDE5D0] flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:border-[#84A63C]/40">
              <img src={formData.logoUrl || logo} alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          {isEditable ? (
            <div className="flex gap-2">
              <label className="cursor-pointer bg-[#84A63C] hover:bg-[#729231] text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-[#84A63C]/10">
                <Upload size={13} />
                Upload Logo
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              {formData.logoUrl && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  className="bg-white border border-red-200 hover:bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <span className="text-[10px] bg-[#F5F7F0] text-[#7A8A6A] border border-[#DDE5D0] px-3.5 py-1.5 rounded-full font-bold">
              Logo Editing Locked
            </span>
          )}
        </div>

        {/* Right Column: Hotel Configuration details */}
        <div className="lg:col-span-2 bg-white border border-[#DDE5D0] shadow-md shadow-[#84A63C]/5 rounded-3xl p-6 sm:p-7 space-y-6">
          <div className="border-b border-[#F0F3E8] pb-4 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-[#1A2E05] text-sm">Hotel General Details</h3>
              <p className="text-[10px] text-[#7A8A6A] font-semibold mt-0.5">Profile identifiers and legal tax settings</p>
            </div>
            {activeHotel && (
              <span className="text-[10px] bg-[#84A63C]/10 text-[#5C7A1F] border border-[#84A63C]/20 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                ID: {activeHotel.id}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="name">Hotel Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                disabled={!isEditable}
                value={formData.name}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Hotel Name"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="hotelType">Property Type *</label>
              <select
                id="hotelType"
                name="hotelType"
                disabled={!isEditable}
                value={formData.hotelType}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="Hotel">Hotel</option>
                <option value="Guest House">Guest House</option>
                <option value="Hotel & Banquet">Hotel & Banquet</option>
                <option value="Lodge">Lodge</option>
                <option value="Resort">Resort</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="phone">Contact Phone Number</label>
              <input
                id="phone"
                name="phone"
                type="text"
                disabled={!isEditable}
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Phone Number"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                disabled={!isEditable}
                value={formData.email}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Email Address"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="city">City *</label>
              <input
                id="city"
                name="city"
                type="text"
                disabled={!isEditable}
                value={formData.city}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="City"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="state">State *</label>
              <input
                id="state"
                name="state"
                type="text"
                disabled={!isEditable}
                value={formData.state}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="State"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="gstin">GSTIN Number</label>
              <input
                id="gstin"
                name="gstin"
                type="text"
                disabled={!isEditable}
                value={formData.gstin}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. 22AAAAA0000A1Z5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="checkoutTime">Checkout Time *</label>
              <input
                id="checkoutTime"
                name="checkoutTime"
                type="time"
                disabled={!isEditable}
                required
                value={formData.checkoutTime || '11:00'}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#4A5E38]">Auto-Extend Overdue Checkouts & Charges</label>
              <div className="p-3 bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A2E05]">Automatically extend overdue stays (+1 day rate)</span>
                  <input
                    type="checkbox"
                    disabled={!isEditable}
                    checked={formData.enableAutoExtendCheckout}
                    onChange={(e) => setFormData(prev => ({ ...prev, enableAutoExtendCheckout: e.target.checked }))}
                    className="w-4 h-4 text-[#84A63C] accent-[#84A63C] rounded cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
                {formData.enableAutoExtendCheckout && (
                  <div className="pt-2 border-t border-[#DDE5D0]/60 space-y-1">
                    <label className="text-[9px] font-extrabold text-[#4A5E38] uppercase tracking-wider block">Cutoff Time</label>
                    <input
                      type="time"
                      disabled={!isEditable}
                      value={formData.autoExtendCutoffTime || '11:30'}
                      onChange={(e) => setFormData(prev => ({ ...prev, autoExtendCutoffTime: e.target.value }))}
                      className="w-full bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3 py-1.5 text-xs font-bold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="invoicePrefix">Invoice No. Prefix</label>
              <input
                id="invoicePrefix"
                name="invoicePrefix"
                type="text"
                disabled={!isEditable}
                value={formData.invoicePrefix}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. INV-"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="defaultGstRate">Default GST Rate (%) *</label>
              <input
                id="defaultGstRate"
                name="defaultGstRate"
                type="number"
                disabled={!isEditable}
                required
                min="0"
                max="100"
                value={formData.defaultGstRate}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. 12"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="defaultHsnCode">Default HSN/SAC Code *</label>
              <input
                id="defaultHsnCode"
                name="defaultHsnCode"
                type="text"
                disabled={!isEditable}
                required
                value={formData.defaultHsnCode}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. 996311"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="since">Since (Establishment Year)</label>
              <input
                id="since"
                name="since"
                type="text"
                disabled={!isEditable}
                value={formData.since}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. 1995"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="bookingPlatforms">
                Online Booking Platforms List (Comma-Separated)
              </label>
              <input
                id="bookingPlatforms"
                name="bookingPlatforms"
                type="text"
                disabled={!isEditable}
                value={formData.bookingPlatforms || ''}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. Booking.com, Agoda, MakeMyTrip, Goibibo"
              />
              <p className="text-[9px] text-[#7A8A6A] font-medium mt-0.5">
                Receptionists can select these platforms when creating online reservations.
              </p>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="onlinePaymentBanks">
                Online Payment Banks & Wallets (Comma-Separated)
              </label>
              <input
                id="onlinePaymentBanks"
                name="onlinePaymentBanks"
                type="text"
                disabled={!isEditable}
                value={formData.onlinePaymentBanks || ''}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. Paytm, Google Pay, ICICI Bank, SBI Bank"
              />
              <p className="text-[9px] text-[#7A8A6A] font-medium mt-0.5">
                Options for receptionists to choose payment destinations.
              </p>
            </div>

            {/* Room Type Privilege toggle */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-xs font-bold text-[#1A2E05]">Room Type Privilege</p>
                  <p className="text-[9px] text-[#7A8A6A] font-medium mt-0.5">
                    Enable room categories (Deluxe, Suite, Single, etc.) for floor configurations and stay dashboard filters.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => setFormData(prev => ({ ...prev, hasRoomType: !prev.hasRoomType }))}
                  className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${formData.hasRoomType ? 'bg-[#84A63C]' : 'bg-[#DDE5D0]'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${formData.hasRoomType ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            </div>

            {/* Registration Number Privilege toggle */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between bg-[#F5F7F0] border border-[#DDE5D0] rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-xs font-bold text-[#1A2E05]">Guest Registration Numbers (Reg No)</p>
                  <p className="text-[9px] text-[#7A8A6A] font-medium mt-0.5">
                    Show auto-incrementing serial Registration Numbers (e.g. REG-001, REG-002) in the Guest Registry and reports.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => setFormData(prev => ({ ...prev, enableRegistrationNumber: !prev.enableRegistrationNumber }))}
                  className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${formData.enableRegistrationNumber ? 'bg-[#84A63C]' : 'bg-[#DDE5D0]'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${formData.enableRegistrationNumber ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            </div>

            {/* Room types input — only shown when privilege is ON */}
            {formData.hasRoomType && (
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="roomTypes">Configured Room Types (Comma-Separated List)</label>
                <input
                  id="roomTypes"
                  name="roomTypes"
                  type="text"
                  disabled={!isEditable}
                  value={formData.roomTypes || ''}
                  onChange={handleInputChange}
                  className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="e.g. Deluxe Room, Single Room, Double Room, Suite"
                />
                <p className="text-[9px] text-[#7A8A6A] font-medium mt-0.5">
                  The room type options that this hotel can assign to its rooms.
                </p>
              </div>
            )}

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-[#4A5E38]" htmlFor="address">Physical Location Address</label>
              <textarea
                id="address"
                name="address"
                rows="3"
                disabled={!isEditable}
                value={formData.address}
                onChange={handleInputChange}
                className="w-full bg-[#F5F7F0] border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#1A2E05] resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Street address details..."
              />
            </div>
          </div>

          {isEditable && (
            <div className="pt-4 border-t border-[#F0F3E8] flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#84A63C] hover:bg-[#729231] text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-[#84A63C]/10 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Saving Changes...
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
