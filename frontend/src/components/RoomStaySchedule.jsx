import React, { useState, useMemo } from 'react';
import { CheckCircle2, ArrowLeftRight, Calendar, Clock } from 'lucide-react';
import ShiftRoomModal from './ShiftRoomModal';
import { useAuth } from '../context/AuthContext';

// Helpers
const defaultCleanRoomNumber = (rm) => {
  if (!rm) return '';
  return String(rm).replace(/^[rR][- ]?/, '').trim();
};

const defaultHasValidShift = (prevRm) => {
  if (!prevRm) return false;
  const str = String(prevRm).trim().toLowerCase();
  return str !== '' && str !== 'null' && str !== 'undefined' && str !== 'n/a' && str !== 'na' && str !== 'none';
};

const defaultFormatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  const str = String(timeStr).trim();
  const match = str.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
  if (!match) return str;
  let hours = parseInt(match[1], 10);
  const minutes = match[2].padStart(2, '0');
  let ampm = match[3] ? match[3].toUpperCase() : null;
  if (!ampm) {
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
  }
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

const defaultConvert12hrTo24hr = (time12) => {
  if (!time12) return '12:00';
  const str = String(time12).trim();
  const match = str.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
  if (!match) {
    if (str.includes(':')) return str.substring(0, 5);
    return '12:00';
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2].padStart(2, '0');
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const defaultCalculateBookingStayDays = (booking, checkIn, checkOut, checkInTime, checkOutTime) => {
  if (!checkIn || !checkOut) return 1;
  const d1 = new Date(String(checkIn).split('T')[0]);
  const d2 = new Date(String(checkOut).split('T')[0]);
  const diffDays = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));

  const parseTimeHours = (tStr) => {
    if (!tStr) return 12;
    const str = String(tStr).trim();
    const match = str.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
    if (!match) return 12;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) || 0;
    const ampm = match[3] ? match[3].toUpperCase() : null;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h + m / 60;
  };

  const inHrs = parseTimeHours(checkInTime || booking?.checkInTime);
  const outHrs = parseTimeHours(checkOutTime || booking?.checkOutTime);

  let stayDays = diffDays;
  if (inHrs < 12.0) stayDays += 1;
  if (outHrs > 12.0) stayDays += 1;
  return Math.max(1, stayDays);
};

export default function RoomStaySchedule({
  isGroup = false,
  formData = {},
  setFormData,
  bill = {},
  allRooms = [],
  isFieldsEditable = true,
  handleGroupRoomDateChange,
  handleGroupRoomShift,
  handleDateChange,
  handleSingleRoomShift,
  calculateBookingStayDays = defaultCalculateBookingStayDays,
  hasValidShift = defaultHasValidShift,
  cleanRoomNumber = defaultCleanRoomNumber,
  formatTime12hr = defaultFormatTime12hr,
  onShiftSuccess
}) {
  const { activeHotel } = useAuth();
  const hasRoomType = activeHotel?.hasRoomType !== false;
  const [modalRoomToShift, setModalRoomToShift] = useState(null);

  const roomsByFloor = useMemo(() => {
    if (!allRooms || allRooms.length === 0) return [];
    const grouped = allRooms.reduce((acc, room) => {
      const floor = room.floor || '1';
      if (!acc[floor]) acc[floor] = [];
      acc[floor].push(room);
      return acc;
    }, {});

    return Object.keys(grouped).map(floor => ({
      floor,
      rooms: grouped[floor]
    })).sort((a, b) => {
      const aNum = Number(a.floor), bNum = Number(b.floor);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a.floor).localeCompare(String(b.floor), undefined, { numeric: true });
    });
  }, [allRooms]);

  const handleOpenShiftModal = (shiftOrBooking) => {
    const isGroupShiftItem = Boolean(shiftOrBooking?.bookingId);
    let currentRoomObj = null;
    let targetBookingObj = null;

    if (isGroupShiftItem) {
      currentRoomObj = allRooms.find(r => Number(r.id) === Number(shiftOrBooking.roomId || shiftOrBooking.originalRoomId)) || {
        id: shiftOrBooking.roomId || shiftOrBooking.originalRoomId || shiftOrBooking.Room?.id,
        roomNumber: shiftOrBooking.roomNumber || shiftOrBooking.Room?.roomNumber,
        type: shiftOrBooking.roomType || shiftOrBooking.Room?.type || 'Standard',
        pricePerNight: shiftOrBooking.pricePerNight || shiftOrBooking.Room?.pricePerNight || 0
      };

      const matchingGb = bill?.groupBookings?.find(gb => gb.id === shiftOrBooking.bookingId);
      targetBookingObj = matchingGb ? { ...matchingGb, Room: currentRoomObj } : {
        id: shiftOrBooking.bookingId,
        guestName: bill?.guestName || shiftOrBooking.guestName || 'Active Guest',
        checkInDate: shiftOrBooking.checkInDate || bill?.checkInDate,
        checkOutDate: shiftOrBooking.checkOutDate || bill?.checkOutDate,
        checkInTime: shiftOrBooking.checkInTime || bill?.checkInTime,
        checkOutTime: shiftOrBooking.checkOutTime || bill?.checkOutTime,
        previousRoomNumber: shiftOrBooking.previousRoomNumber,
        previousRoomRate: shiftOrBooking.previousRoomRate,
        shiftDate: shiftOrBooking.shiftDate,
        shiftTime: shiftOrBooking.shiftTime,
        sameDayChargeOption: shiftOrBooking.sameDayChargeOption,
        totalAmount: shiftOrBooking.totalAmount,
        discount: shiftOrBooking.discount,
        Room: currentRoomObj
      };
    } else {
      const targetRoomId = formData.roomId || bill?.Room?.id || bill?.roomId;
      const foundRoom = allRooms.find(r => Number(r.id) === Number(targetRoomId));
      currentRoomObj = foundRoom || {
        id: targetRoomId || bill?.Room?.id || bill?.roomId,
        roomNumber: formData.roomNumber || bill?.Room?.roomNumber || bill?.roomNumber || 'Current',
        type: formData.roomType || bill?.Room?.type || bill?.roomType || 'Standard',
        pricePerNight: formData.pricePerNight || bill?.Room?.pricePerNight || bill?.pricePerNight || 0
      };

      targetBookingObj = (bill && bill.id) ? {
        ...bill,
        Room: currentRoomObj
      } : {
        id: bill?.id || formData.bookingId,
        guestName: bill?.guestName || formData.guestName || 'Active Guest',
        checkInDate: formData.checkInDate || bill?.checkInDate,
        checkOutDate: formData.checkOutDate || bill?.checkOutDate,
        checkInTime: formData.checkInTime || bill?.checkInTime,
        checkOutTime: formData.checkOutTime || bill?.checkOutTime,
        previousRoomNumber: formData.previousRoomNumber || bill?.previousRoomNumber,
        previousRoomRate: formData.previousRoomRate || bill?.previousRoomRate,
        shiftDate: formData.shiftDate || bill?.shiftDate,
        shiftTime: formData.shiftTime || bill?.shiftTime,
        sameDayChargeOption: formData.sameDayChargeOption || bill?.sameDayChargeOption,
        totalAmount: bill?.totalAmount || formData.totalAmount,
        discount: bill?.discount || formData.discount,
        Room: currentRoomObj
      };
    }

    setModalRoomToShift({
      room: currentRoomObj,
      booking: targetBookingObj
    });
  };

  const fmtD = (dStr) => (dStr ? dStr.split('-').reverse().join('-') : '');

  return (
    <div className="bg-[#F5F7F0]/50 rounded-2xl p-2 sm:p-2.5 space-y-2.5">
      <div className="flex items-center gap-2 pb-0.5">
        <span className="text-[10px] font-black text-[#84A63C] uppercase tracking-wider">
          {isGroup ? '2. Room Assignment & Stay Schedule (Group)' : '2. Room Assignment'}
        </span>
      </div>

      <div className="space-y-0.5">
        {isGroup ? (
          <div className="space-y-3">
            {formData.groupRoomShifts?.map((shift) => {
              const rawPrevRoomStr = String(shift.previousRoomNumber || '');
              const prevRooms = (shift.previousRoomNumber && hasValidShift(shift.previousRoomNumber))
                ? rawPrevRoomStr.split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/).map(s => cleanRoomNumber(s.trim())).filter(s => defaultHasValidShift(s))
                : [];
              const isShifted = prevRooms.length > 0;
              const cInDate = shift.checkInDate ? String(shift.checkInDate).split('T')[0] : '';
              const cOutDate = shift.checkOutDate ? String(shift.checkOutDate).split('T')[0] : '';
              const cInTime = shift.checkInTime ? formatTime12hr(shift.checkInTime) : '12:00 PM';
              const cOutTime = shift.checkOutTime ? formatTime12hr(shift.checkOutTime) : '11:00 AM';
              const sDate = shift.shiftDate ? String(shift.shiftDate).split('T')[0] : '';
              const sTime = shift.shiftTime ? formatTime12hr(shift.shiftTime) : '12:00 PM';

              const rawShiftDates = shift.shiftDate !== undefined ? shift.shiftDate : (shift.updatedAt ? String(shift.updatedAt).split('T')[0] : '');
              const shiftDatesList = String(rawShiftDates || '').split(/→|->|,|>/).map(s => s.trim().split('T')[0]).filter(Boolean);

              const rawShiftTimes = shift.shiftTime || shift.roomShiftTimes || '';
              const shiftTimesList = String(rawShiftTimes).split(/→|->|,|>/).map(s => formatTime12hr(s.trim())).filter(Boolean);

              const totalDays = calculateBookingStayDays(shift, cInDate, cOutDate, cInTime, cOutTime);
              const sDateFirst = shiftDatesList[0] || sDate || cInDate;
              const sDateLast = shiftDatesList[shiftDatesList.length - 1] || sDateFirst || cInDate;
              let prevDays = 0;
              if (sDateFirst === cInDate) {
                prevDays = 0;
              } else if (sDateFirst > cInDate) {
                prevDays = Math.min(totalDays - 1, Math.ceil(Math.abs(new Date(sDateFirst) - new Date(cInDate)) / (1000 * 60 * 60 * 24)));
              }
              let curDays = 0;
              if (cOutDate && sDateLast) {
                if (cOutDate > sDateLast) {
                  curDays = Math.ceil(Math.abs(new Date(cOutDate) - new Date(sDateLast)) / (1000 * 60 * 60 * 24));
                } else {
                  curDays = 0;
                }
              }

              const rawGroupPrevRate = shift.previousRoomRate !== undefined && shift.previousRoomRate !== null
                ? shift.previousRoomRate
                : '';
              const prevRatesList = String(rawGroupPrevRate || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);

              const curRateVal = shift.pricePerNight !== undefined && shift.pricePerNight !== null ? shift.pricePerNight : '';
              const sameDayOpt = shift.sameDayChargeOption || 'no_charge';
              const sameDayOptList = String(sameDayOpt || 'no_charge').split(/→|->|,|>/).map(s => s.trim());

              const handleGroupPrevRoomNumberChange = (pIdx, newVal) => {
                const updated = [...prevRooms];
                updated[pIdx] = newVal;
                handleGroupRoomDateChange?.(shift.bookingId, 'previousRoomNumber', updated.join(' → '));
              };

              const handleGroupPrevRateChange = (pIdx, newVal) => {
                const updated = [...prevRatesList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || '0');
                }
                updated[pIdx] = newVal;
                handleGroupRoomDateChange?.(shift.bookingId, 'previousRoomRate', updated.join(' → '));
              };

              const handleGroupPrevShiftDateChange = (pIdx, newVal) => {
                const updated = [...shiftDatesList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || (shift.shiftDate ? String(shift.shiftDate).split('T')[0] : cInDate));
                }
                updated[pIdx] = newVal;
                handleGroupRoomDateChange?.(shift.bookingId, 'shiftDate', updated.join(' → '));
              };

              const handleGroupPrevShiftTimeChange = (pIdx, newVal) => {
                const updated = [...shiftTimesList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || shift.shiftTime || '12:00 PM');
                }
                updated[pIdx] = formatTime12hr(newVal);
                handleGroupRoomDateChange?.(shift.bookingId, 'shiftTime', updated.join(' → '));
              };

              const handleGroupPrevSameDayOptChange = (pIdx, newVal) => {
                const updated = [...sameDayOptList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || 'no_charge');
                }
                updated[pIdx] = newVal;
                handleGroupRoomDateChange?.(shift.bookingId, 'sameDayChargeOption', updated.join(' → '));
              };

              if (isShifted) {
                return (
                  <React.Fragment key={shift.bookingId}>
                    {/* Render a card for each step in prevRooms */}
                    {prevRooms.map((pRm, pIdx) => {
                      const isFirstStep = (pIdx === 0);
                      const isLastPrevStep = (pIdx === prevRooms.length - 1);
                      const pRoomObj = (allRooms || []).find(r => cleanRoomNumber(r.roomNumber) === cleanRoomNumber(pRm));
                      const stepRoomType = pRoomObj?.type || (isFirstStep ? (shift.previousRoomType || '') : '') || '';
                      const pRateNumeric = Number(prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] || 0)) || 0;
                      const pRateDisplay = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] || '');
                      const stepSameDayOpt = sameDayOptList[pIdx] || sameDayOptList[0] || 'no_charge';

                      const stepStartD = isFirstStep ? cInDate : (shiftDatesList[pIdx - 1] || shiftDatesList[0] || sDate || cInDate);
                      const stepEndD = shiftDatesList[pIdx] || (isFirstStep ? (shiftDatesList[0] || sDate || cInDate) : (shiftDatesList[pIdx - 1] || sDate || cInDate));
                      const stepStartT = isFirstStep ? cInTime : (shiftTimesList[pIdx - 1] || shiftTimesList[0] || sTime);
                      const stepEndT = shiftTimesList[pIdx] || (isFirstStep ? (shiftTimesList[0] || sTime) : (shiftTimesList[pIdx - 1] || sTime));

                      let stepDays = 0;
                      if (isFirstStep) {
                        stepDays = prevDays;
                      } else {
                        if (stepEndD && stepStartD && stepEndD > stepStartD) {
                          stepDays = Math.max(0, Math.ceil(Math.abs(new Date(stepEndD) - new Date(stepStartD)) / (1000 * 60 * 60 * 24)));
                        } else {
                          stepDays = 0;
                        }
                      }

                      const stepCost = (stepDays * pRateNumeric) + (stepSameDayOpt === 'charge_previous' ? pRateNumeric : 0);

                      const stepBadge = (stepDays === 0)
                        ? (stepSameDayOpt === 'charge_previous' ? '1 Shift Day' : '0 Nights (No Charge)')
                        : `${stepDays} ${stepDays === 1 ? 'Night' : 'Nights'}${stepSameDayOpt === 'charge_previous' ? ' + 1 Shift Day' : ''}`;

                      const stepTitleBadge = prevRooms.length === 1
                        ? 'Before Shift'
                        : `Step ${pIdx + 1}: ${isFirstStep ? 'Initial Room' : 'Shifted Room'}`;

                      return (
                        <div key={`group_prev_${shift.bookingId}_${pIdx}`} className="bg-white p-3 rounded-xl border border-amber-300/80 space-y-2.5 shadow-2xs">
                          <div className="flex items-center justify-between border-b border-amber-200/60 pb-1.5">
                            <span className="text-sm font-black text-amber-950">
                              Room {pRm}{stepRoomType ? ` (${stepRoomType})` : ''}{' '}
                              <span className="text-[10.5px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded ml-1 border border-amber-200">
                                {stepTitleBadge}
                              </span>
                            </span>
                            <span className="text-[11px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                              {stepBadge}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-amber-900 uppercase tracking-tight block truncate">
                                {prevRooms.length > 1 ? `Room (Step ${pIdx + 1})` : 'Previous Room No.'}
                              </label>
                              <input
                                type="text"
                                placeholder={`e.g. ${pRm}`}
                                value={pRm}
                                disabled={!isFieldsEditable}
                                onChange={(e) => handleGroupPrevRoomNumberChange(pIdx, e.target.value)}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-amber-900 uppercase tracking-tight block truncate">
                                {prevRooms.length > 1 ? `Rate (Step ${pIdx + 1})` : 'Prev Rate (₹/night)'}
                              </label>
                              <input
                                type="number"
                                placeholder="e.g. 840"
                                value={pRateDisplay}
                                disabled={!isFieldsEditable}
                                onWheel={(e) => e.target.blur()}
                                onChange={(e) => handleGroupPrevRateChange(pIdx, e.target.value)}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">
                                {isFirstStep ? 'Check-In Date' : 'Shift Date'}
                              </label>
                              <input
                                type="date"
                                value={stepStartD}
                                disabled={!isFieldsEditable || !isFirstStep}
                                onClick={(e) => isFirstStep && e.target.showPicker?.()}
                                onChange={(e) => isFirstStep && handleGroupRoomDateChange?.(shift.bookingId, 'checkInDate', e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable || !isFirstStep
                                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C] cursor-pointer'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">
                                {isFirstStep ? 'Arrive Time' : 'Start Time'}
                              </label>
                              <input
                                type="time"
                                value={defaultConvert12hrTo24hr(stepStartT)}
                                disabled={!isFieldsEditable || !isFirstStep}
                                onClick={(e) => isFirstStep && e.target.showPicker?.()}
                                onChange={(e) => isFirstStep && handleGroupRoomDateChange?.(shift.bookingId, 'checkInTime', e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable || !isFirstStep
                                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C] cursor-pointer'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-amber-800 block mb-0.5 truncate">
                                {isFirstStep ? 'Shift / Depart Date' : 'Depart Date'}
                              </label>
                              <input
                                type="date"
                                value={stepEndD}
                                disabled={!isFieldsEditable}
                                onClick={(e) => e.target.showPicker?.()}
                                onChange={(e) => handleGroupPrevShiftDateChange(pIdx, e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-amber-800 block mb-0.5 truncate">
                                {isFirstStep ? 'Shift / Depart Time' : 'Shift End Time'}
                              </label>
                              <input
                                type="time"
                                value={defaultConvert12hrTo24hr(stepEndT)}
                                disabled={!isFieldsEditable}
                                onClick={(e) => e.target.showPicker?.()}
                                onChange={(e) => handleGroupPrevShiftTimeChange(pIdx, e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                          </div>

                          {/* Shift Day Billing Option */}
                          <div className="space-y-1.5 pt-1">
                            <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                              {prevRooms.length > 1 ? `Room ${pRm} Billing Option (Shift Day) *` : 'Previous Room Billing Option (Shift Day) *'}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={!isFieldsEditable}
                                onClick={() => handleGroupPrevSameDayOptChange(pIdx, 'no_charge')}
                                className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 cursor-pointer ${
                                  stepSameDayOpt === 'no_charge' || !stepSameDayOpt
                                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30 text-emerald-950 font-bold shadow-xs'
                                    : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[11px] sm:text-xs text-emerald-900">🆓 No Charge</span>
                                  {(stepSameDayOpt === 'no_charge' || !stepSameDayOpt) && (
                                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  )}
                                </div>
                                <span className="text-[9px] sm:text-[9.5px] text-gray-500 font-semibold leading-tight">
                                  Room {pRm} is <strong>₹0.00</strong> for shift day.
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={!isFieldsEditable}
                                onClick={() => handleGroupPrevSameDayOptChange(pIdx, 'charge_previous')}
                                className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 cursor-pointer ${
                                  stepSameDayOpt === 'charge_previous'
                                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30 text-emerald-950 font-bold shadow-xs'
                                    : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[11px] sm:text-xs text-emerald-900">💵 Charge Rate</span>
                                  {stepSameDayOpt === 'charge_previous' && (
                                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  )}
                                </div>
                                <span className="text-[9px] sm:text-[9.5px] text-gray-500 font-semibold leading-tight">
                                  Charge Room {pRm} at rate (<strong>₹{pRateDisplay || '0'}/night</strong>).
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Room Stay Schedule Box */}
                          <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-2 sm:p-2.5 space-y-1.5 mt-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[11px] font-black text-amber-950">
                                Room {pRm}{stepRoomType ? ` (${stepRoomType})` : ''} Schedule
                              </span>
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md whitespace-nowrap">
                                {stepDays === 0
                                  ? (stepSameDayOpt === 'charge_previous'
                                      ? `1 Shift Day • ₹${stepCost.toFixed(2)}`
                                      : '0 Nights (No Charge)')
                                  : `${stepDays} ${stepDays === 1 ? 'Night' : 'Nights'}${stepSameDayOpt === 'charge_previous' ? ' + 1 Shift Day' : ''} • ₹${stepCost.toFixed(2)}`
                                }
                              </span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-amber-200/80 text-[10.5px] space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                                  <Calendar size={11} className="text-amber-700 shrink-0" /> Dates:
                                </span>
                                <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                                  {fmtD(stepStartD)} <span className="text-gray-400 font-normal">→</span> {fmtD(stepEndD)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 border-t border-amber-100/60 pt-1">
                                <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                                  <Clock size={11} className="text-amber-700 shrink-0" /> Timing:
                                </span>
                                <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                                  {stepStartT} <span className="text-gray-400 font-normal">→</span> {stepEndT}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* 2. Group Card After Shift (e.g. Room 212) */}
                    <div className="bg-white p-3 rounded-xl border border-emerald-300/80 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                        <span className="text-sm font-black text-emerald-950">
                          Room {cleanRoomNumber(shift.roomNumber)}{hasRoomType && shift.roomType ? ` (${shift.roomType})` : ''}{' '}
                          <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded ml-1 border border-emerald-200">
                            After Shift
                          </span>
                        </span>
                        <span className="text-[11px] font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                          {curDays === 0 ? '0 Nights (Same Day)' : `${curDays} ${curDays === 1 ? 'Night' : 'Nights'}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-[#4A5E38] uppercase">Shift Room</label>
                          <button
                            type="button"
                            disabled={!isFieldsEditable}
                            onClick={() => handleOpenShiftModal(shift)}
                            className={`w-full px-2.5 py-1.5 border rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between transition-all ${
                              !isFieldsEditable
                                ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                                : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] hover:border-[#84A63C] hover:bg-[#F0F3E8] cursor-pointer shadow-2xs'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="truncate">
                                Room {cleanRoomNumber(shift.roomNumber)}{hasRoomType && shift.roomType ? ` - ${shift.roomType}` : ''}
                              </span>
                            </span>
                            {isFieldsEditable && (
                              <span className="text-[10px] bg-[#84A63C]/15 text-[#4A5E38] px-2 py-0.5 rounded font-black border border-[#84A63C]/30 shrink-0 flex items-center gap-1">
                                <ArrowLeftRight size={10} /> Shift
                              </span>
                            )}
                          </button>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-emerald-900 uppercase tracking-tight block truncate">Shift Room Rate (₹/night)</label>
                          <input
                            type="number"
                            placeholder="e.g. 1365"
                            value={curRateVal}
                            disabled={!isFieldsEditable}
                            onWheel={(e) => e.target.blur()}
                            onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'pricePerNight', e.target.value)}
                            className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-emerald-300 text-emerald-950 focus:border-emerald-500'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[10px] font-bold text-emerald-800 block mb-0.5 truncate">Check-In (Shift) Date</label>
                          <input
                            type="date"
                            value={sDateLast}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handleGroupPrevShiftDateChange(shiftDatesList.length > 0 ? shiftDatesList.length - 1 : 0, e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-emerald-300 text-emerald-950 focus:border-emerald-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-emerald-800 block mb-0.5 truncate">Arrive (Shift) Time</label>
                          <input
                            type="time"
                            value={defaultConvert12hrTo24hr(shiftTimesList[shiftTimesList.length - 1] || sTime)}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handleGroupPrevShiftTimeChange(shiftTimesList.length > 0 ? shiftTimesList.length - 1 : 0, e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-emerald-300 text-emerald-950 focus:border-emerald-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">Check-Out Date</label>
                          <input
                            type="date"
                            value={cOutDate}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'checkOutDate', e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">Depart Time</label>
                          <input
                            type="time"
                            value={defaultConvert12hrTo24hr(shift.checkOutTime)}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'checkOutTime', e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Room Stay Schedule Box */}
                      <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-2 sm:p-2.5 space-y-1.5 mt-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px] font-black text-emerald-950">
                            Room {cleanRoomNumber(shift.roomNumber)} ({shift.roomType || 'Standard'}) Schedule
                          </span>
                          <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100/90 border border-emerald-300/80 px-2 py-0.5 rounded-md whitespace-nowrap">
                            {curDays === 0 ? '0 Nights (Same Day)' : `${curDays} ${curDays === 1 ? 'Night' : 'Nights'}`} {curRateVal ? `• ₹${curRateVal}/night` : ''}
                          </span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200/80 text-[10.5px] space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                              <Calendar size={11} className="text-emerald-700 shrink-0" /> Dates:
                            </span>
                            <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                              {fmtD(sDateLast)} <span className="text-gray-400 font-normal">→</span> {fmtD(cOutDate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-emerald-100/60 pt-1">
                            <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                              <Clock size={11} className="text-emerald-700 shrink-0" /> Timing:
                            </span>
                            <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                              {shiftTimesList[shiftTimesList.length - 1] || sTime} <span className="text-gray-400 font-normal">→</span> {cOutTime}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              /* Unshifted Room Card (e.g. Room 302) */
              return (
                <div key={shift.bookingId} className="bg-white p-3 rounded-xl border border-[#DDE5D0] space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[#DDE5D0]/50 pb-1.5">
                    <span className="text-sm font-black text-[#1A2E05]">
                      Room {cleanRoomNumber(shift.roomNumber)}{hasRoomType && shift.roomType ? ` (${shift.roomType})` : ''}
                    </span>
                    <span className="text-[11px] font-black text-[#84A63C] bg-[#F5F7F0] px-2 py-0.5 rounded border border-[#DDE5D0]">
                      {totalDays} {totalDays === 1 ? 'Night' : 'Nights'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-[#4A5E38] uppercase">Shift Room</label>
                    <button
                      type="button"
                      disabled={!isFieldsEditable}
                      onClick={() => handleOpenShiftModal(shift)}
                      className={`w-full px-2.5 py-1.5 border rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between transition-all ${
                        !isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] hover:border-[#84A63C] hover:bg-[#F0F3E8] cursor-pointer shadow-2xs'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                        <span className="truncate">
                          Room {cleanRoomNumber(shift.roomNumber)}{hasRoomType && shift.roomType ? ` - ${shift.roomType}` : ''}
                        </span>
                      </span>
                      {isFieldsEditable && (
                        <span className="text-[10px] bg-[#84A63C] text-white px-2 py-0.5 rounded font-black shrink-0 flex items-center gap-1 shadow-2xs hover:bg-[#6c8a2f]">
                          <ArrowLeftRight size={10} /> Shift Room
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Check-In Date</label>
                      <input
                        type="date"
                        value={cInDate}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'checkInDate', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Arrive Time</label>
                      <input
                        type="time"
                        value={defaultConvert12hrTo24hr(shift.checkInTime)}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'checkInTime', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Check-Out Date</label>
                      <input
                        type="date"
                        value={cOutDate}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'checkOutDate', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Depart Time</label>
                      <input
                        type="time"
                        value={defaultConvert12hrTo24hr(shift.checkOutTime)}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleGroupRoomDateChange?.(shift.bookingId, 'checkOutTime', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="bg-[#FAFBF7] border border-[#DDE5D0] rounded-xl p-2 sm:p-2.5 space-y-1.5 mt-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-[#1A2E05]">
                        Room {cleanRoomNumber(shift.roomNumber)} ({shift.roomType || 'Standard'}) Schedule
                      </span>
                      <span className="text-[10px] font-bold text-[#84A63C] bg-[#EEF4E3] border border-[#D3E2BD] px-2 py-0.5 rounded-md whitespace-nowrap">
                        {totalDays} {totalDays === 1 ? 'Night' : 'Nights'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-[#DDE5D0]/80 text-[10.5px] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                          <Calendar size={11} className="text-[#84A63C] shrink-0" /> Dates:
                        </span>
                        <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                          {fmtD(cInDate)} <span className="text-gray-400 font-normal">→</span> {fmtD(cOutDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-[#DDE5D0]/60 pt-1">
                        <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                          <Clock size={11} className="text-[#84A63C] shrink-0" /> Timing:
                        </span>
                        <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                          {cInTime} <span className="text-gray-400 font-normal">→</span> {cOutTime}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              const rawPrevRoomStr = String(formData.previousRoomNumber !== undefined ? formData.previousRoomNumber : (bill?.previousRoomNumber || ''));
              const prevRooms = hasValidShift(rawPrevRoomStr)
                ? rawPrevRoomStr.split(/\s*(?:→|->|─>|&rarr;|[,\->→])\s*/).map(s => cleanRoomNumber(s.trim())).filter(s => defaultHasValidShift(s))
                : [];
              const isShifted = prevRooms.length > 0;
              const cInDate = formData.checkInDate ? String(formData.checkInDate).split('T')[0] : '';
              const cOutDate = formData.checkOutDate ? String(formData.checkOutDate).split('T')[0] : '';
              const cInTime = formData.checkInTime ? formatTime12hr(formData.checkInTime) : '12:00 PM';
              const cOutTime = formData.checkOutTime ? formatTime12hr(formData.checkOutTime) : '11:00 AM';
              const sDate = formData.shiftDate ? String(formData.shiftDate).split('T')[0] : '';
              const sTime = formData.shiftTime ? formatTime12hr(formData.shiftTime) : '12:00 PM';

              const rawShiftDates = formData.shiftDate !== undefined ? formData.shiftDate : (bill?.shiftDate || (bill?.updatedAt ? String(bill.updatedAt).split('T')[0] : ''));
              const shiftDatesList = String(rawShiftDates || '').split(/→|->|,|>/).map(s => s.trim().split('T')[0]).filter(Boolean);

              const rawShiftTimes = formData.shiftTime || bill?.shiftTime || bill?.roomShiftTimes || '';
              const shiftTimesList = String(rawShiftTimes).split(/→|->|,|>/).map(s => formatTime12hr(s.trim())).filter(Boolean);

              const totalStayDays = calculateBookingStayDays(bill, cInDate, cOutDate, cInTime, cOutTime);
              const sDateFirst = shiftDatesList[0] || sDate || cInDate;
              const sDateLast = shiftDatesList[shiftDatesList.length - 1] || sDateFirst || cInDate;
              let prevDays = 0;
              if (sDateFirst === cInDate) {
                prevDays = 0;
              } else if (sDateFirst > cInDate) {
                prevDays = Math.min(totalStayDays - 1, Math.ceil(Math.abs(new Date(sDateFirst) - new Date(cInDate)) / (1000 * 60 * 60 * 24)));
              }
              let curDays = 0;
              if (cOutDate && sDateLast) {
                if (cOutDate > sDateLast) {
                  curDays = Math.ceil(Math.abs(new Date(cOutDate) - new Date(sDateLast)) / (1000 * 60 * 60 * 24));
                } else {
                  curDays = Math.max(0, totalStayDays - prevDays);
                }
              }

              const rawPrevRate = formData.previousRoomRate !== undefined && formData.previousRoomRate !== null
                ? formData.previousRoomRate
                : (bill?.previousRoomRate !== undefined && bill?.previousRoomRate !== null
                    ? bill.previousRoomRate
                    : '');
              const prevRatesList = String(rawPrevRate || '').split(/→|->|,|>/).map(s => s.trim()).filter(Boolean);

              const curRateVal = formData.pricePerNight !== undefined && formData.pricePerNight !== null
                ? formData.pricePerNight
                : (bill?.pricePerNight !== undefined && bill?.pricePerNight !== null ? bill.pricePerNight : (bill?.Room?.pricePerNight || ''));
              const sameDayOpt = formData.sameDayChargeOption || bill?.sameDayChargeOption || 'no_charge';
              const sameDayOptList = String(sameDayOpt || 'no_charge').split(/→|->|,|>/).map(s => s.trim());

              const handlePrevRoomNumberChange = (pIdx, newVal) => {
                const updated = [...prevRooms];
                updated[pIdx] = newVal;
                handleDateChange?.('previousRoomNumber', updated.join(' → '));
              };

              const handlePrevRateChange = (pIdx, newVal) => {
                const updated = [...prevRatesList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || '0');
                }
                updated[pIdx] = newVal;
                handleDateChange?.('previousRoomRate', updated.join(' → '));
              };

              const handlePrevShiftDateChange = (pIdx, newVal) => {
                const updated = [...shiftDatesList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || (formData.shiftDate ? String(formData.shiftDate).split('T')[0] : cInDate));
                }
                updated[pIdx] = newVal;
                handleDateChange?.('shiftDate', updated.join(' → '));
              };

              const handlePrevShiftTimeChange = (pIdx, newVal) => {
                const updated = [...shiftTimesList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || formData.shiftTime || '12:00 PM');
                }
                updated[pIdx] = formatTime12hr(newVal);
                handleDateChange?.('shiftTime', updated.join(' → '));
              };

              const handlePrevSameDayOptChange = (pIdx, newVal) => {
                const updated = [...sameDayOptList];
                while (updated.length <= pIdx) {
                  updated.push(updated[0] || 'no_charge');
                }
                updated[pIdx] = newVal;
                handleDateChange?.('sameDayChargeOption', updated.join(' → '));
              };

              if (isShifted) {
                return (
                  <div className="space-y-3">
                    {/* Render a card for each step in prevRooms */}
                    {prevRooms.map((pRm, pIdx) => {
                      const isFirstStep = (pIdx === 0);
                      const isLastPrevStep = (pIdx === prevRooms.length - 1);
                      const pRoomObj = (allRooms || []).find(r => cleanRoomNumber(r.roomNumber) === cleanRoomNumber(pRm));
                      const stepRoomType = pRoomObj?.type || (isFirstStep ? (formData.previousRoomType || '') : '') || '';
                      const pRateNumeric = Number(prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] || 0)) || 0;
                      const pRateDisplay = prevRatesList[pIdx] !== undefined ? prevRatesList[pIdx] : (prevRatesList[0] || '');
                      const stepSameDayOpt = sameDayOptList[pIdx] || sameDayOptList[0] || 'no_charge';

                      const stepStartD = isFirstStep ? cInDate : (shiftDatesList[pIdx - 1] || shiftDatesList[0] || sDate || cInDate);
                      const stepEndD = shiftDatesList[pIdx] || (isFirstStep ? (shiftDatesList[0] || sDate || cInDate) : (shiftDatesList[pIdx - 1] || sDate || cInDate));
                      const stepStartT = isFirstStep ? cInTime : (shiftTimesList[pIdx - 1] || shiftTimesList[0] || sTime);
                      const stepEndT = shiftTimesList[pIdx] || (isFirstStep ? (shiftTimesList[0] || sTime) : (shiftTimesList[pIdx - 1] || sTime));

                      let stepDays = 0;
                      if (isFirstStep) {
                        stepDays = prevDays;
                      } else {
                        if (stepEndD && stepStartD && stepEndD > stepStartD) {
                          stepDays = Math.max(0, Math.ceil(Math.abs(new Date(stepEndD) - new Date(stepStartD)) / (1000 * 60 * 60 * 24)));
                        } else {
                          stepDays = 0;
                        }
                      }

                      const stepCost = (stepDays * pRateNumeric) + (stepSameDayOpt === 'charge_previous' ? pRateNumeric : 0);

                      const stepBadge = (stepDays === 0)
                        ? (stepSameDayOpt === 'charge_previous' ? '1 Shift Day' : '0 Nights (No Charge)')
                        : `${stepDays} ${stepDays === 1 ? 'Night' : 'Nights'}${stepSameDayOpt === 'charge_previous' ? ' + 1 Shift Day' : ''}`;

                      const stepTitleBadge = prevRooms.length === 1
                        ? 'Before Shift'
                        : `Step ${pIdx + 1}: ${isFirstStep ? 'Initial Room' : 'Shifted Room'}`;

                      return (
                        <div key={`prev_room_${pIdx}`} className="bg-white p-3 rounded-xl border border-amber-300/80 space-y-2.5 shadow-2xs">
                          <div className="flex items-center justify-between border-b border-amber-200/60 pb-1.5">
                            <span className="text-xs font-black text-amber-950">
                              Room {pRm}{stepRoomType ? ` (${stepRoomType})` : ''} <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded ml-1 border border-amber-200">{stepTitleBadge}</span>
                            </span>
                            <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                              {stepBadge}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-amber-900 uppercase tracking-tight block truncate">
                                {prevRooms.length > 1 ? `Room (Step ${pIdx + 1})` : 'Previous Room No.'}
                              </label>
                              <input
                                type="text"
                                placeholder={`e.g. ${pRm}`}
                                value={pRm}
                                disabled={!isFieldsEditable}
                                onChange={(e) => handlePrevRoomNumberChange(pIdx, e.target.value)}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-amber-900 uppercase tracking-tight block truncate">
                                {prevRooms.length > 1 ? `Rate (Step ${pIdx + 1})` : 'Prev Rate (₹/night)'}
                              </label>
                              <input
                                type="number"
                                placeholder="e.g. 840"
                                value={pRateDisplay}
                                disabled={!isFieldsEditable}
                                onWheel={(e) => e.target.blur()}
                                onChange={(e) => handlePrevRateChange(pIdx, e.target.value)}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">
                                {isFirstStep ? 'Check-In Date' : 'Shift Date'}
                              </label>
                              <input
                                type="date"
                                value={stepStartD}
                                disabled={!isFieldsEditable || !isFirstStep}
                                onClick={(e) => isFirstStep && e.target.showPicker?.()}
                                onChange={(e) => isFirstStep && handleDateChange?.('checkInDate', e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable || !isFirstStep
                                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C] cursor-pointer'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">
                                {isFirstStep ? 'Arrive Time' : 'Start Time'}
                              </label>
                              <input
                                type="time"
                                value={defaultConvert12hrTo24hr(stepStartT)}
                                disabled={!isFieldsEditable || !isFirstStep}
                                onClick={(e) => isFirstStep && e.target.showPicker?.()}
                                onChange={(e) => isFirstStep && handleDateChange?.('checkInTime', e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold ${
                                  !isFieldsEditable || !isFirstStep
                                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C] cursor-pointer'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-amber-800 block mb-0.5 truncate">
                                {isFirstStep ? 'Shift / Depart Date' : 'Depart Date'}
                              </label>
                              <input
                                type="date"
                                value={stepEndD}
                                disabled={!isFieldsEditable}
                                onClick={(e) => e.target.showPicker?.()}
                                onChange={(e) => handlePrevShiftDateChange(pIdx, e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-amber-800 block mb-0.5 truncate">
                                {isFirstStep ? 'Shift / Depart Time' : 'Shift End Time'}
                              </label>
                              <input
                                type="time"
                                value={defaultConvert12hrTo24hr(stepEndT)}
                                disabled={!isFieldsEditable}
                                onClick={(e) => e.target.showPicker?.()}
                                onChange={(e) => handlePrevShiftTimeChange(pIdx, e.target.value)}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                                  !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-amber-300 text-amber-950 focus:border-amber-500'
                                }`}
                              />
                            </div>
                          </div>

                          {/* Shift Day Billing Option */}
                          <div className="space-y-1.5 pt-1">
                            <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                              {prevRooms.length > 1 ? `Room ${pRm} Billing Option (Shift Day) *` : 'Previous Room Billing Option (Shift Day) *'}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={!isFieldsEditable}
                                onClick={() => handlePrevSameDayOptChange(pIdx, 'no_charge')}
                                className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 cursor-pointer ${
                                  stepSameDayOpt === 'no_charge' || !stepSameDayOpt
                                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30 text-emerald-950 font-bold shadow-xs'
                                    : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[11px] sm:text-xs text-emerald-900">🆓 No Charge</span>
                                  {(stepSameDayOpt === 'no_charge' || !stepSameDayOpt) && (
                                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  )}
                                </div>
                                <span className="text-[9px] sm:text-[9.5px] text-gray-500 font-semibold leading-tight">
                                  Room {pRm} is <strong>₹0.00</strong> for shift day.
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={!isFieldsEditable}
                                onClick={() => handlePrevSameDayOptChange(pIdx, 'charge_previous')}
                                className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 cursor-pointer ${
                                  stepSameDayOpt === 'charge_previous'
                                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30 text-emerald-950 font-bold shadow-xs'
                                    : 'bg-white border-[#DDE5D0] text-gray-700 hover:bg-[#F5F7F0]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[11px] sm:text-xs text-emerald-900">💵 Charge Rate</span>
                                  {stepSameDayOpt === 'charge_previous' && (
                                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                  )}
                                </div>
                                <span className="text-[9px] sm:text-[9.5px] text-gray-500 font-semibold leading-tight">
                                  Charge Room {pRm} at rate (<strong>₹{pRateDisplay || '0'}/night</strong>).
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Room Stay Schedule Box */}
                          <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-2 sm:p-2.5 space-y-1.5 mt-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[11px] font-black text-amber-950">
                                Room {pRm}{stepRoomType ? ` (${stepRoomType})` : ''} Schedule
                              </span>
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md whitespace-nowrap">
                                {stepDays === 0
                                  ? (stepSameDayOpt === 'charge_previous'
                                      ? `1 Shift Day • ₹${stepCost.toFixed(2)}`
                                      : '0 Nights (No Charge)')
                                  : `${stepDays} ${stepDays === 1 ? 'Night' : 'Nights'}${stepSameDayOpt === 'charge_previous' ? ' + 1 Shift Day' : ''} • ₹${stepCost.toFixed(2)}`
                                }
                              </span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-amber-200/80 text-[10.5px] space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                                  <Calendar size={11} className="text-amber-700 shrink-0" /> Dates:
                                </span>
                                <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                                  {fmtD(stepStartD)} <span className="text-gray-400 font-normal">→</span> {fmtD(stepEndD)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 border-t border-amber-100/60 pt-1">
                                <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                                  <Clock size={11} className="text-amber-700 shrink-0" /> Timing:
                                </span>
                                <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                                  {stepStartT} <span className="text-gray-400 font-normal">→</span> {stepEndT}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="bg-white p-3 rounded-xl border border-emerald-300/80 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                        <span className="text-sm font-black text-emerald-950">
                          Room {cleanRoomNumber(bill?.Room?.roomNumber || bill?.roomNumber)}{hasRoomType && (bill?.Room?.type || bill?.roomType) ? ` (${bill?.Room?.type || bill?.roomType})` : ''}{' '}
                          <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded ml-1 border border-emerald-200">
                            After Shift
                          </span>
                        </span>
                        <span className="text-[11px] font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                          {curDays === 0 ? '0 Nights (Same Day)' : `${curDays} ${curDays === 1 ? (cOutDate === sDateLast ? 'Day (Day Stay)' : 'Night') : 'Nights'}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-[#4A5E38] uppercase">Shift Room</label>
                          <button
                            type="button"
                            disabled={!isFieldsEditable}
                            onClick={() => handleOpenShiftModal(formData)}
                            className={`w-full px-2.5 py-1.5 border rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between transition-all ${
                              !isFieldsEditable
                                ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                                : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] hover:border-[#84A63C] hover:bg-[#F0F3E8] cursor-pointer shadow-2xs'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="truncate">
                                Room {cleanRoomNumber(bill?.Room?.roomNumber || bill?.roomNumber)}{hasRoomType && (bill?.Room?.type || bill?.roomType) ? ` (${bill?.Room?.type || bill?.roomType})` : ''}
                              </span>
                            </span>
                            {isFieldsEditable && (
                              <span className="text-[10px] bg-[#84A63C]/15 text-[#4A5E38] px-2 py-0.5 rounded font-black border border-[#84A63C]/30 shrink-0 flex items-center gap-1">
                                <ArrowLeftRight size={10} /> Shift
                              </span>
                            )}
                          </button>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-emerald-900 uppercase tracking-tight block truncate">Shift Room Rate (₹/night)</label>
                          <input
                            type="number"
                            placeholder="e.g. 1365"
                            value={curRateVal}
                            disabled={!isFieldsEditable}
                            onWheel={(e) => e.target.blur()}
                            onChange={(e) => handleDateChange?.('pricePerNight', e.target.value)}
                            className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-emerald-300 text-emerald-950 focus:border-emerald-500'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[10px] font-bold text-emerald-800 block mb-0.5 truncate">Check-In (Shift) Date</label>
                          <input
                            type="date"
                            value={sDateLast}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handlePrevShiftDateChange(shiftDatesList.length > 0 ? shiftDatesList.length - 1 : 0, e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-emerald-300 text-emerald-950 focus:border-emerald-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-emerald-800 block mb-0.5 truncate">Arrive (Shift) Time</label>
                          <input
                            type="time"
                            value={defaultConvert12hrTo24hr(shiftTimesList[shiftTimesList.length - 1] || sTime)}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handlePrevShiftTimeChange(shiftDatesList.length > 0 ? shiftDatesList.length - 1 : 0, e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-emerald-300 text-emerald-950 focus:border-emerald-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">Check-Out Date</label>
                          <input
                            type="date"
                            value={cOutDate}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handleDateChange?.('checkOutDate', e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#4A5E38] block mb-0.5 truncate">Depart Time</label>
                          <input
                            type="time"
                            value={defaultConvert12hrTo24hr(formData.checkOutTime)}
                            disabled={!isFieldsEditable}
                            onClick={(e) => e.target.showPicker?.()}
                            onChange={(e) => handleDateChange?.('checkOutTime', e.target.value)}
                            className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                              !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Room Stay Schedule Box */}
                      <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-2 sm:p-2.5 space-y-1.5 mt-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px] font-black text-emerald-950">
                            Room {cleanRoomNumber(bill?.Room?.roomNumber || bill?.roomNumber)} ({bill?.Room?.type || bill?.roomType || 'Standard'}) Schedule
                          </span>
                          <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100/90 border border-emerald-300/80 px-2 py-0.5 rounded-md whitespace-nowrap">
                            {curDays === 0 ? '0 Nights (Same Day)' : `${curDays} ${curDays === 1 ? (cOutDate === sDateLast ? 'Day (Day Stay)' : 'Night') : 'Nights'}`} {curRateVal ? `• ₹${curRateVal}/night` : ''}
                          </span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200/80 text-[10.5px] space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                              <Calendar size={11} className="text-emerald-700 shrink-0" /> Dates:
                            </span>
                            <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                              {fmtD(sDateLast)} <span className="text-gray-400 font-normal">→</span> {fmtD(cOutDate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-emerald-100/60 pt-1">
                            <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                              <Clock size={11} className="text-emerald-700 shrink-0" /> Timing:
                            </span>
                            <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                              {shiftTimesList[shiftTimesList.length - 1] || sTime} <span className="text-gray-400 font-normal">→</span> {cOutTime}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              /* Single Unshifted Room */
              return (
                <div className="bg-white p-3 rounded-xl border border-[#DDE5D0] space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[#DDE5D0]/50 pb-1.5">
                    <span className="text-sm font-black text-[#1A2E05]">
                      Room {cleanRoomNumber(bill?.Room?.roomNumber || bill?.roomNumber)}{hasRoomType && (bill?.Room?.type || bill?.roomType) ? ` (${bill?.Room?.type || bill?.roomType})` : ''}
                    </span>
                    <span className="text-[11px] font-black text-[#84A63C] bg-[#F5F7F0] px-2 py-0.5 rounded border border-[#DDE5D0]">
                      {totalStayDays} {totalStayDays === 1 ? 'Night' : 'Nights'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-[#4A5E38] uppercase">Shift Room</label>
                    <button
                      type="button"
                      disabled={!isFieldsEditable}
                      onClick={() => handleOpenShiftModal(formData)}
                      className={`w-full px-2.5 py-1.5 border rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between transition-all ${
                        !isFieldsEditable
                          ? 'bg-[#F5F7F0]/40 text-[#7A8A6A] border-[#DDE5D0] cursor-not-allowed'
                          : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] hover:border-[#84A63C] hover:bg-[#F0F3E8] cursor-pointer shadow-2xs'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                        <span className="truncate">
                          Room {cleanRoomNumber(bill?.Room?.roomNumber || bill?.roomNumber)}{hasRoomType && (bill?.Room?.type || bill?.roomType) ? ` (${bill?.Room?.type || bill?.roomType})` : ''}
                        </span>
                      </span>
                      {isFieldsEditable && (
                        <span className="text-[10px] bg-[#84A63C]/15 text-[#4A5E38] px-2 py-0.5 rounded font-black border border-[#84A63C]/30 shrink-0 flex items-center gap-1">
                          <ArrowLeftRight size={10} /> Shift
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Check-In Date</label>
                      <input
                        type="date"
                        value={cInDate}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleDateChange?.('checkInDate', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Arrive Time</label>
                      <input
                        type="time"
                        value={defaultConvert12hrTo24hr(formData.checkInTime)}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleDateChange?.('checkInTime', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Check-Out Date</label>
                      <input
                        type="date"
                        value={cOutDate}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleDateChange?.('checkOutDate', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-[#4A5E38] block mb-0.5">Depart Time</label>
                      <input
                        type="time"
                        value={defaultConvert12hrTo24hr(formData.checkOutTime)}
                        disabled={!isFieldsEditable}
                        onClick={(e) => e.target.showPicker?.()}
                        onChange={(e) => handleDateChange?.('checkOutTime', e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${
                          !isFieldsEditable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-[#FBFDF8] border-[#DDE5D0] text-[#1A2E05] focus:border-[#84A63C]'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="bg-[#FAFBF7] border border-[#DDE5D0] rounded-xl p-2 sm:p-2.5 space-y-1.5 mt-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-[#1A2E05]">
                        Room {cleanRoomNumber(bill?.Room?.roomNumber || bill?.roomNumber)} ({bill?.Room?.type || bill?.roomType || 'Standard'}) Schedule
                      </span>
                      <span className="text-[10px] font-bold text-[#84A63C] bg-[#EEF4E3] border border-[#D3E2BD] px-2 py-0.5 rounded-md whitespace-nowrap">
                        {totalStayDays} {totalStayDays === 1 ? 'Night' : 'Nights'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-[#DDE5D0]/80 text-[10.5px] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                          <Calendar size={11} className="text-[#84A63C] shrink-0" /> Dates:
                        </span>
                        <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                          {fmtD(cInDate)} <span className="text-gray-400 font-normal">→</span> {fmtD(cOutDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-[#DDE5D0]/60 pt-1">
                        <span className="text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                          <Clock size={11} className="text-[#84A63C] shrink-0" /> Timing:
                        </span>
                        <span className="font-extrabold text-[#1A2E05] whitespace-nowrap text-right">
                          {cInTime} <span className="text-gray-400 font-normal">→</span> {cOutTime}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Shift Room Modal */}
      <ShiftRoomModal
        isOpen={Boolean(modalRoomToShift)}
        onClose={() => setModalRoomToShift(null)}
        roomToShift={modalRoomToShift}
        roomsByFloor={roomsByFloor}
        onShiftSuccess={async () => {
          if (onShiftSuccess) {
            await onShiftSuccess();
          }
          setModalRoomToShift(null);
        }}
      />
    </div>
  );
}
