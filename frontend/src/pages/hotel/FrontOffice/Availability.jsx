import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bed, AlertCircle, Clock, ChevronLeft, ChevronRight, X, Loader2, RefreshCw, Calendar, Users, Info, ChevronDown
} from 'lucide-react';
import api from '../../../services/api';

const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const min = minStr ? minStr.substring(0, 2) : '00';
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min} ${ampm}`;
};

const cleanRoomNumber = (val) => {
  if (!val) return '';
  return String(val).replace(/^(room|rm|r)\s*[-:]?\s*/i, '').trim();
};

const Availability = () => {
  const [data, setData] = useState({ rooms: [], bookings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Navigation & View State
  const [viewMode, setViewMode] = useState('month'); // 'day', 'week', 'month'
  const [viewDate, setViewDate] = useState(new Date()); // Default to current date
  const [selectedFloor, setSelectedFloor] = useState('All');
  const [selectedRoomType, setSelectedRoomType] = useState('All');
  const [selectedRoomForUpdate, setSelectedRoomForUpdate] = useState(null);

  // Tooltip/Popover state
  const [hoveredBooking, setHoveredBooking] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const scrollRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [viewDate, viewMode]);

  useEffect(() => {
    if (!loading && data.rooms.length > 0) {
      const timer = setTimeout(() => {
        const todayEl = document.querySelector('.today-col-header');
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loading, data]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Determine date range for query based on viewMode
      const startDate = new Date(viewDate);
      if (viewMode === 'week') {
        startDate.setDate(startDate.getDate() - 3);
      } else if (viewMode === 'month') {
        startDate.setDate(startDate.getDate() - 15);
      }

      const endDate = new Date(startDate);
      if (viewMode === 'day') {
        endDate.setDate(endDate.getDate() + 1);
      } else if (viewMode === 'week') {
        endDate.setDate(endDate.getDate() + 7);
      } else if (viewMode === 'month') {
        endDate.setDate(endDate.getDate() + 30);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const response = await api.get('/analytics/availability', {
        params: {
          startDate: startDateStr,
          endDate: endDateStr
        }
      });
      if (response.data && response.data.data) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
      setError('System Synchronizing: Could not connect to backend analytics service.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (roomId, newStatus) => {
    try {
      await api.put(`/rooms/${roomId}`, { status: newStatus.toLowerCase() });
      fetchData();
      setSelectedRoomForUpdate(null);
    } catch (error) {
      alert('Failed to update room status');
    }
  };

  // Helper: Get dates in range
  const getDatesInRange = () => {
    const dates = [];
    const count = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 30;
    const current = new Date(viewDate);
    if (viewMode === 'week') {
      current.setDate(current.getDate() - 3);
    } else if (viewMode === 'month') {
      current.setDate(current.getDate() - 15);
    }
    for (let i = 0; i < count; i++) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const activeDates = getDatesInRange();

  // Helper: Filter rooms
  const filteredRooms = data.rooms.filter(room => {
    const floorMatch = selectedFloor === 'All' || String(room.floor) === String(selectedFloor);
    const typeMatch = selectedRoomType === 'All' || room.type.toLowerCase() === selectedRoomType.toLowerCase();
    return floorMatch && typeMatch;
  });

  // Helper: Get unique floors and types for dropdown filters
  const uniqueFloors = ['All', ...new Set(data.rooms.map(r => String(r.floor)))].sort();
  const uniqueTypes = ['All', ...new Set(data.rooms.map(r => r.type))];

  // Helper: Date formatting
  const formatDateToLocal = (date) => {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  // Helper: Legend metrics
  const availableRoomsCount = data.rooms.filter(r => r.status === 'available').length;
  const occupiedRoomsCount = data.rooms.filter(r => r.status === 'occupied').length;
  const maintenanceRoomsCount = data.rooms.filter(r => r.status === 'maintenance').length;
  const checkoutDueCount = data.bookings.filter(b => {
    const todayStr = new Date().toISOString().split('T')[0];
    return b.checkOut === todayStr && b.status === 'Active';
  }).length;

  // Render Hour columns for Day & Week view
  const hourSubdivisions = [0, 6, 12, 18];

  // Grid sizing parameters
  const getGridConfig = () => {
    if (viewMode === 'day') {
      return { colWidth: 1440, subCols: 24, label: 'hours' };
    } else if (viewMode === 'week') {
      return { colWidth: 240, subCols: 4, label: 'days' };
    } else {
      return { colWidth: 100, subCols: 1, label: 'month' };
    }
  };

  const gridConfig = getGridConfig();

  // Calculate layout style for a booking bar
  const calculateBookingStyle = (booking) => {
    const checkInTimeStr = booking.checkInTime || '12:00';
    const checkOutTimeStr = booking.checkOutTime || '11:00';

    const checkInDateTime = new Date(`${booking.checkIn}T${checkInTimeStr}`);
    const checkOutDateTime = new Date(`${booking.checkOut}T${checkOutTimeStr}`);

    const timelineStart = new Date(activeDates[0]);
    timelineStart.setHours(0, 0, 0, 0);

    const timelineEnd = new Date(activeDates[activeDates.length - 1]);
    timelineEnd.setHours(23, 59, 59, 999);

    // Bound the dates inside timeline range for calculation
    const displayStart = checkInDateTime < timelineStart ? timelineStart : checkInDateTime;
    const displayEnd = checkOutDateTime > timelineEnd ? timelineEnd : checkOutDateTime;

    if (displayEnd < timelineStart || displayStart > timelineEnd) {
      return { display: 'none' };
    }

    const isMultiple = booking.groupBookingId && data.bookings.filter(b => b.groupBookingId === booking.groupBookingId).length > 1;

    let bg = booking.status === 'Active' ? '#E6F4EA' : '#FCE8E6';
    let text = booking.status === 'Active' ? '#137333' : '#C5221F';
    let border = booking.status === 'Active' ? '1px solid #A3CFBB' : '1px solid #F5C2C7';

    if (isMultiple && booking.status === 'Active') {
      bg = '#CCFBF1'; // Teal bg
      text = '#115E59'; // Teal text
      border = '1px solid #99F6E4'; // Teal border
    }

    if (viewMode === 'day') {
      const startOffsetHrs = (displayStart - timelineStart) / (1000 * 60 * 60);
      const durationHrs = (displayEnd - displayStart) / (1000 * 60 * 60);
      const hourWidth = 60; // 60px per hour
      return {
        left: `${startOffsetHrs * hourWidth}px`,
        width: `${durationHrs * hourWidth}px`,
        backgroundColor: bg,
        color: text,
        border: border
      };
    } else if (viewMode === 'week') {
      const startOffsetHrs = (displayStart - timelineStart) / (1000 * 60 * 60);
      const durationHrs = (displayEnd - displayStart) / (1000 * 60 * 60);
      const dayWidth = 240; // 240px per day
      const hourWidth = dayWidth / 24;
      return {
        left: `${startOffsetHrs * hourWidth}px`,
        width: `${durationHrs * hourWidth}px`,
        backgroundColor: bg,
        color: text,
        border: border
      };
    } else {
      // Month View
      const startOffsetDays = (displayStart - timelineStart) / (1000 * 60 * 60 * 24);
      const durationDays = (displayEnd - displayStart) / (1000 * 60 * 60 * 24);
      const dayWidth = 100; // 100px per day
      return {
        left: `${startOffsetDays * dayWidth}px`,
        width: `${durationDays * dayWidth}px`,
        backgroundColor: bg,
        color: text,
        border: border
      };
    }
  };

  const getBookingsForRoom = (roomId) => {
    return data.bookings.filter(b => b.roomId === roomId && b.status !== 'Cancelled');
  };

  // Assign vertical lanes to overlapping bookings so they don't overlap
  const getBookingLanes = (bookings) => {
    const lanes = []; // each lane is an array of bookings
    const booked = bookings.map(b => {
      const style = calculateBookingStyle(b);
      if (style.display === 'none') return { booking: b, skip: true };
      const left = parseFloat(style.left || '0');
      const width = parseFloat(style.width || '0');
      return { booking: b, left, right: left + width };
    });

    for (const item of booked) {
      if (item.skip) continue;
      let placed = false;
      for (let li = 0; li < lanes.length; li++) {
        const lane = lanes[li];
        const lastInLane = lane[lane.length - 1];
        // Check if this booking overlaps with the last booking in the lane
        if (item.left >= lastInLane.right - 1) {
          lane.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([item]);
    }
    return lanes;
  };

  const handleBookingMouseEnter = (e, booking, room) => {
    const rect = e.currentTarget.getBoundingClientRect();

    // Center tooltip on the hovered bar horizontally relative to the viewport
    const xPos = rect.left + (rect.width - 256) / 2;

    // Flip popover below the bar if it's too close to the top of the viewport, otherwise place above it
    const yPos = rect.top < 180 ? (rect.top + rect.height + 8) : (rect.top - 185);

    setTooltipPos({ x: xPos, y: yPos });
    setHoveredBooking({ ...booking, roomNumber: room.roomNumber });
  };

  // Navigation handlers
  const navigateTimeline = (direction) => {
    const newDate = new Date(viewDate);
    const step = viewMode === 'day' ? 3 : viewMode === 'week' ? 14 : 60;
    newDate.setDate(newDate.getDate() + direction * step);
    setViewDate(newDate);
  };

  const scrollColumns = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const canScroll = scrollWidth > clientWidth;
      
      // Logical navigation steps at boundaries
      const navigateStep = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 15;
      const triggerDateNavigation = (dir) => {
        const newDate = new Date(viewDate);
        newDate.setDate(newDate.getDate() + dir * navigateStep);
        setViewDate(newDate);
      };

      if (!canScroll) {
        triggerDateNavigation(direction);
        return;
      }

      if (direction === -1 && scrollLeft <= 10) {
        // Scrolled to start boundary: navigate by logical step
        triggerDateNavigation(-1);
      } else if (direction === 1 && scrollLeft + clientWidth >= scrollWidth - 10) {
        // Scrolled to end boundary: navigate by logical step
        triggerDateNavigation(1);
      } else {
        // Smooth scroll based on viewMode
        let scrollAmount = 0;
        if (viewMode === 'day') {
          scrollAmount = direction * 120; // Move exactly 2 hours (60px * 2)
        } else if (viewMode === 'week') {
          scrollAmount = direction * 240; // Move exactly 1 day (240px)
        } else {
          scrollAmount = direction * 200; // Move 2 days (100px * 2)
        }
        scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  const setToday = () => {
    setViewDate(new Date()); // Set to current date
  };

  if (loading && data.rooms.length === 0) return (
    <div className="flex flex-col justify-center items-center py-40 gap-4">
      <Loader2 size={48} className="animate-spin text-[#1C2B12]" />
      <p className="text-[10px] font-black text-[#7A8A6A] uppercase tracking-[0.3em] animate-pulse">Synchronizing Timeline Grid...</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-fade-in font-sans">

      {/* Top Bar: Stats Badges & Legend */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#DDE5D0] shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={setToday} className="px-5 py-2.5 bg-[#0D1505] text-white rounded-full text-xs font-bold shadow-sm transition-all hover:bg-black/90 active:scale-95">
            Current Date
          </button>
        </div>

        {/* Legend stats */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#4A5E38]">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#E6F4EA] text-[#137333] rounded-full border border-[#D1E7DD]">
            <span className="w-2 h-2 rounded-full bg-[#137333]"></span>
            Available <span className="text-[#1A2E05] font-black ml-1">{availableRoomsCount}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FCE8E6] text-[#C5221F] rounded-full border border-[#F8D7DA]">
            <span className="w-2 h-2 rounded-full bg-[#C5221F]"></span>
            Occupied <span className="text-[#1A2E05] font-black ml-1">{occupiedRoomsCount}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#CCFBF1] text-[#115E59] rounded-full border border-[#99F6E4]">
            <span className="w-2 h-2 rounded-full bg-[#115E59]"></span>
            Multiple Rooms
          </div>

          {/* <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FEF7E0] text-[#B06000] rounded-full border border-[#FFF3CD]">
            <span className="w-2 h-2 rounded-full bg-[#B06000]"></span>
            Checkout Due <span className="text-[#1A2E05] font-black ml-1">{checkoutDueCount}</span>
          </div> */}

          {/* <div className="flex items-center gap-2 px-3 py-1.5 bg-[#E8F0FE] text-[#1A73E8] rounded-full border border-[#D2E3FC]">
            <span className="w-2 h-2 rounded-full bg-[#1A73E8]"></span>
            Housekeeping <span className="text-[#1A2E05] font-black ml-1">0</span>
          </div> */}

          {/* <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F1F3F4] text-[#3C4043] rounded-full border border-[#E2E3E5]">
            <span className="w-2 h-2 rounded-full bg-[#3C4043]"></span>
            Maintenance <span className="text-[#1A2E05] font-black ml-1">{maintenanceRoomsCount}</span>
          </div> */}
        </div>
      </div>

      {/* Sub-Header: Filters, Timeline Range & View modes */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#DDE5D0] shadow-sm">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C] cursor-pointer shadow-sm"
            >
              <option value="All">All Floors</option>
              {uniqueFloors.filter(f => f !== 'All').map(floor => (
                <option key={floor} value={floor}>Floor {floor}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3.5 top-3.5 text-[#7A8A6A] pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={selectedRoomType}
              onChange={(e) => setSelectedRoomType(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-[#DDE5D0] rounded-xl text-xs font-bold text-[#1A2E05] focus:outline-none focus:border-[#84A63C] cursor-pointer shadow-sm"
            >
              <option value="All">All Room Types</option>
              {uniqueTypes.filter(t => t !== 'All').map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3.5 top-3.5 text-[#7A8A6A] pointer-events-none" />
          </div>
        </div>

        {/* Date Range Navigation Label */}
        <div className="flex items-center justify-center gap-3 bg-[#F0F3E8] p-1.5 rounded-xl border border-[#DDE5D0] shadow-inner">
          <button onClick={() => navigateTimeline(-1)} className="p-1.5 hover:bg-white rounded-lg text-[#7A8A6A] hover:text-[#1C2B12] transition-all">
            <ChevronLeft size={16} />
          </button>

          <span className="text-xs font-extrabold text-[#1C2B12] px-4 uppercase tracking-[0.1em] min-w-[220px] text-center">
            {activeDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            <span className="mx-2 text-[#7A8A6A]">➔</span>
            {activeDates[activeDates.length - 1].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </span>

          <button onClick={() => navigateTimeline(1)} className="p-1.5 hover:bg-white rounded-lg text-[#7A8A6A] hover:text-[#1C2B12] transition-all">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex bg-[#F0F3E8]/80 p-1 rounded-xl border border-[#DDE5D0] self-start lg:self-center shadow-sm">
          {[
            { id: 'day', label: 'Day View' },
            { id: 'week', label: 'Week View' },
            { id: 'month', label: 'Month View' }
          ].map(view => (
            <button
              key={view.id}
              onClick={() => setViewMode(view.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${viewMode === view.id
                  ? 'bg-white text-[#1C2B12] shadow-sm'
                  : 'text-[#7A8A6A] hover:text-[#1C2B12]'
                }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid View Container */}
      <div className="bg-white rounded-2xl border border-[#DDE5D0] shadow-md overflow-hidden relative" id="scheduler-grid-container">

        <div ref={scrollRef} className="overflow-auto custom-scrollbar relative max-h-[calc(100vh-280px)]">
          <div className="min-w-max flex flex-col">

            {/* Table Header */}
            <div className="flex shrink-0 sticky top-0 z-40 bg-white rounded-t-2xl">
              {/* Sticky Top-Left Corner Header */}
              <div className={`sticky left-0 top-0 z-50 bg-[#F0F3E8] border-r border-b border-[#DDE5D0] w-24 sm:w-28 shrink-0 flex items-center px-4 rounded-tl-2xl shadow-[5px_0_10px_rgba(0,0,0,0.05)] ${viewMode === 'month' ? 'h-10' : 'h-16'
                }`}>
                <span className="text-[10px] font-black text-[#5C7A1F] uppercase tracking-widest">Rooms</span>
              </div>

              {/* Timeline Dates and Sub-Interval Headers */}
              <div className="flex-1 flex flex-col">
                {/* Date Labels Row */}
                <div className="flex h-10 border-b border-[#DDE5D0] bg-[#F9FAF7] relative">
                  {/* Navigation Overlay (does not push headers layout flow) */}
                  <div className="absolute inset-y-0 left-0 right-0 pointer-events-none z-30 flex justify-between">
                    <button
                      onClick={() => scrollColumns(-1)}
                      className="sticky left-24 sm:left-28 pointer-events-auto h-full px-2.5 bg-[#0D1505] hover:bg-black border-r border-[#DDE5D0] text-white flex items-center justify-center transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.15)] shrink-0"
                      title="Move columns left"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => scrollColumns(1)}
                      className="sticky right-0 pointer-events-auto h-full px-2.5 bg-[#0D1505] hover:bg-black border-l border-[#DDE5D0] text-white flex items-center justify-center transition-colors shadow-[-2px_0_5px_rgba(0,0,0,0.15)] shrink-0"
                      title="Move columns right"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {activeDates.map((date, index) => {
                    const isToday = date.toDateString() === new Date().toDateString();
                    return (
                      <div
                        key={index}
                        className={`border-r border-[#DDE5D0] shrink-0 text-center flex flex-col justify-center relative ${isToday ? 'bg-[#1C2B12]/5 today-col-header' : ''
                          }`}
                        style={{ width: `${gridConfig.colWidth}px` }}
                      >
                        <span className="text-[9px] font-black text-[#1A2E05] uppercase tracking-wider">
                          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                        </span>
                        <span className="text-[8px] font-bold text-[#7A8A6A] uppercase mt-0.5">
                          {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Subdivisions Row (Hours in Day/Week View) */}
                {viewMode !== 'month' && (
                  <div className="flex h-6 bg-[#F9FAF7] border-b border-[#DDE5D0] text-[8px] font-bold text-[#7A8A6A] uppercase select-none">
                    {activeDates.map((date, dIdx) => (
                      <div
                        key={dIdx}
                        className="flex border-r border-[#DDE5D0] shrink-0 h-full justify-between items-center"
                        style={{ width: `${gridConfig.colWidth}px` }}
                      >
                        {viewMode === 'day' ? (
                          // Render 24 Hours subdivisions
                          Array.from({ length: 24 }).map((_, h) => (
                            <span key={h} className="w-[60px] text-center border-r border-[#DDE5D0]/30 last:border-r-0 py-0.5">
                              {String(h).padStart(2, '0')}:00
                            </span>
                          ))
                        ) : (
                          // Render 0, 6, 12, 18 Hours subdivisions for Week View
                          hourSubdivisions.map(h => (
                            <span key={h} className="w-1/4 text-center border-r border-[#DDE5D0]/30 last:border-r-0 py-0.5">
                              {h}
                            </span>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Room Rows Grid */}
            <div id="scheduler-rows-container" className="flex flex-col relative">
              {/* Dynamic Hover Tooltip Popover */}
              {hoveredBooking && createPortal((() => {
                const groupBookings = hoveredBooking.groupBookingId
                  ? data.bookings.filter(b => b.groupBookingId === hoveredBooking.groupBookingId)
                  : [];
                const isMultiple = groupBookings.length > 1;
                const roomNumbers = isMultiple
                  ? groupBookings.map(gb => {
                      const r = data.rooms.find(room => room.id === gb.roomId);
                      return r ? r.roomNumber : null;
                    }).filter(Boolean)
                  : [];
                const totalAmount = isMultiple
                  ? groupBookings.reduce((sum, gb) => sum + Number(gb.totalAmount || 0), 0)
                  : Number(hoveredBooking.totalAmount || 0);

                return (
                  <div
                    className="fixed bg-white rounded-xl shadow-2xl p-4 border border-[#DDE5D0] text-[#1A2E05] w-64 z-[999] transition-all animate-fade-in text-xs space-y-3 pointer-events-none"
                    style={{
                      left: `${tooltipPos.x}px`,
                      top: `${tooltipPos.y}px`,
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div className="border-b border-[#DDE5D0] pb-2">
                      <span className="text-[9px] font-black text-[#7A8A6A] uppercase tracking-wider block">Details As On</span>
                      <div className="flex items-center justify-between">
                        <h5 className="font-extrabold text-sm text-[#1C2B12] mt-0.5">
                          Room {isMultiple ? roomNumbers.join(', ') : hoveredBooking.roomNumber}
                        </h5>
                        {isMultiple && (
                          <span className="px-1.5 py-0.5 bg-[#115E59]/10 text-[#115E59] text-[8px] font-black rounded uppercase border border-[#115E59]/20">
                            Multiple
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between border-b border-[#F0F3E8] pb-1.5 mb-1.5">
                        <span className="text-[#7A8A6A] font-semibold">Guest:</span>
                        <span className="font-bold text-[#1C2B12] text-right truncate max-w-[150px]" title={hoveredBooking.guestName}>
                          {hoveredBooking.guestName}
                        </span>
                      </div>
                      
                      {isMultiple && (
                        <div className="flex justify-between border-b border-[#F0F3E8] pb-1.5 mb-1.5">
                          <span className="text-[#7A8A6A] font-semibold">Rooms Blocked:</span>
                          <span className="font-extrabold text-[#115E59] text-right">
                            {roomNumbers.join(', ')}
                          </span>
                        </div>
                      )}

                      {hoveredBooking.previousRoomNumber && (
                        <div className="flex justify-between border-b border-[#F0F3E8] pb-1.5 mb-1.5">
                          <span className="text-[#7A8A6A] font-semibold">Room Shift:</span>
                          <span className="font-extrabold text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded text-[10px] text-right">
                            R-{cleanRoomNumber(hoveredBooking.previousRoomNumber)} → {hoveredBooking.roomNumber}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex justify-between">
                        <span className="text-[#7A8A6A] font-semibold">Guests:</span>
                        <span className="font-bold flex items-center gap-1">
                          <Users size={12} className="text-[#7A8A6A]" />
                          {(() => {
                            let extraList = [];
                            try {
                              if (hoveredBooking.extraGuests) {
                                extraList = typeof hoveredBooking.extraGuests === 'string'
                                  ? JSON.parse(hoveredBooking.extraGuests)
                                  : hoveredBooking.extraGuests;
                              }
                            } catch (e) {}
                            
                            let children = 0;
                            if (hoveredBooking.isChild) children += 1;
                            if (Array.isArray(extraList)) {
                              extraList.forEach(g => {
                                if (g.isChild) children += 1;
                              });
                            }
                            const total = hoveredBooking.numberOfGuests || 1;
                            const adults = Math.max(1, total - children);
                            
                            return (
                              <span>
                                {adults} {adults === 1 ? 'Adult' : 'Adults'} • {children} {children === 1 ? 'Child' : 'Children'}
                              </span>
                            );
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#7A8A6A] font-semibold">Check-in:</span>
                        <span className="font-bold text-[#1A2E05]">
                          {new Date(hoveredBooking.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                          {formatTime12hr(hoveredBooking.checkInTime)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#7A8A6A] font-semibold">Check-out:</span>
                        <span className="font-bold text-[#1A2E05]">
                          {new Date(hoveredBooking.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                          {formatTime12hr(hoveredBooking.checkOutTime)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-[#F0F3E8] pt-2 mt-1">
                        <span className="text-[#7A8A6A] font-semibold">Total Amount:</span>
                        <span className="font-black text-sm text-[#1C2B12]">
                          ₹{totalAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })(),
              document.body
            )}

              {/* Rows List */}
              {filteredRooms.length === 0 ? (
                <div className="py-20 text-center w-full text-[#7A8A6A] font-bold text-sm">
                  No rooms match your search filters.
                </div>
              ) : (
                filteredRooms.map((room, rowIndex) => (
                  <div key={room.id} className="flex border-b border-[#DDE5D0] relative group/row hover:bg-[#F9FAF7]/50"
                    style={{ minHeight: `${Math.max(1, getBookingLanes(getBookingsForRoom(room.id)).length) * 44}px` }}
                  >

                    {/* Sticky Room Label Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedRoomForUpdate(room)}
                      className="sticky left-0 z-30 bg-white border-r border-[#DDE5D0] w-24 sm:w-28 shrink-0 h-auto flex flex-col justify-center px-4 hover:bg-[#F0F3E8] transition-all text-left shadow-[5px_0_10px_rgba(0,0,0,0.03)] focus:outline-none self-stretch"
                    >
                      <span className="text-xs font-extrabold text-[#1A2E05] tracking-tight truncate leading-tight">
                        Room {room.roomNumber}
                      </span>
                      <span className="text-[9px] font-bold text-[#7A8A6A] uppercase tracking-wider truncate mt-0.5">
                        {room.type}
                      </span>
                    </button>

                    {/* Right timeline grid area (flex-1) */}
                    <div className="flex-1 relative" style={{ minHeight: 'inherit' }}>
                      {/* Timeline row segments grid background lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {activeDates.map((_, idx) => (
                          <div
                            key={idx}
                            className="h-full border-r border-[#DDE5D0]/60 relative"
                            style={{ width: `${gridConfig.colWidth}px` }}
                          >
                            {viewMode === 'day' && (
                              <div className="absolute inset-0 flex">
                                {Array.from({ length: 24 }).map((_, hIdx) => (
                                  <div key={hIdx} className="h-full border-r border-[#DDE5D0]/10 w-[60px] shrink-0" />
                                ))}
                              </div>
                            )}
                            {viewMode === 'week' && (
                              <div className="absolute inset-0 flex">
                                {Array.from({ length: 4 }).map((_, sIdx) => (
                                  <div key={sIdx} className="h-full border-r border-[#DDE5D0]/10 w-1/4 shrink-0" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Booking bars — lane-stacked */}
                      <div className="absolute inset-0 pointer-events-none">
                        {(() => {
                          const lanes = getBookingLanes(getBookingsForRoom(room.id));
                          const laneHeight = 44;
                          return lanes.map((lane, laneIdx) =>
                            lane.map(({ booking }) => {
                              const style = calculateBookingStyle(booking);
                              if (style.display === 'none') return null;
                              const isMultiple = booking.groupBookingId && data.bookings.filter(b => b.groupBookingId === booking.groupBookingId).length > 1;
                              const topOffset = laneIdx * laneHeight + (laneHeight - 32) / 2;
                              return (
                                <div
                                  key={booking.id}
                                  style={{ ...style, top: `${topOffset}px`, transform: 'none' }}
                                  onMouseEnter={(e) => handleBookingMouseEnter(e, booking, room)}
                                  onMouseLeave={() => setHoveredBooking(null)}
                                  className="absolute h-8 rounded-lg flex items-center justify-start px-3 shadow-sm border text-[10px] font-bold transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer pointer-events-auto select-none overflow-hidden"
                                >
                                  <span className="truncate capitalize flex items-center gap-1">
                                    {booking.guestName}
                                    {booking.previousRoomNumber && (
                                      <span className="px-1.5 py-0.5 bg-amber-100/90 text-amber-900 border border-amber-300 rounded-md text-[8px] font-black shrink-0">
                                        Shifted
                                      </span>
                                    )}
                                    {isMultiple && (
                                      <span className="text-[8px] font-black opacity-80 ml-1 select-none">[Multiple]</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Status Update Modal */}
      {selectedRoomForUpdate && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-slide-up border border-[#DDE5D0]">
            <div className="p-6 border-b border-[#DDE5D0] flex items-center justify-between bg-[#F5F7F2]">
              <div>
                <h3 className="text-lg font-bold text-[#1A2E05]">Update Room {selectedRoomForUpdate.roomNumber}</h3>
                <p className="text-[10px] font-bold text-[#7A8A6A] uppercase tracking-wider mt-0.5">{selectedRoomForUpdate.type} Status</p>
              </div>
              <button onClick={() => setSelectedRoomForUpdate(null)} className="p-1.5 hover:bg-[#E2E8DA] rounded-lg transition-all">
                <X size={20} className="text-[#4A5E38]" />
              </button>
            </div>

            <div className="p-6 space-y-2.5">
              {selectedRoomForUpdate.status?.toLowerCase() === 'occupied' ? (
                <div className="space-y-3">
                  <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-left text-rose-800 text-[10px] font-semibold space-y-1.5 leading-relaxed">
                    <p className="font-extrabold text-xs text-rose-900 flex items-center gap-1.5"><AlertCircle size={14} /> Room is Occupied</p>
                    <p>This room has an active guest. Status is managed via Front Office check-in / check-out. Manual status updates are locked.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {['Available', 'Maintenance', 'Cleaning'].map(statusOption => (
                    <button
                      key={statusOption}
                      type="button"
                      onClick={() => handleStatusUpdate(selectedRoomForUpdate.id, statusOption)}
                      className={`w-full text-left p-3.5 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-between group ${selectedRoomForUpdate.status?.toLowerCase() === statusOption.toLowerCase()
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                          : 'border-[#F0F3E8] hover:border-[#84A63C]/30 hover:bg-[#F9FAF7]'
                        }`}
                    >
                      {statusOption}
                      <ChevronRight size={14} className={`transition-transform ${selectedRoomForUpdate.status?.toLowerCase() === statusOption.toLowerCase()
                          ? 'translate-x-1'
                          : 'opacity-0 group-hover:opacity-100'
                        }`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styled Animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 0px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #F0F3E8; border-radius: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #C1C9B6; border-radius: 6px; border: 2px solid #F0F3E8; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9EA891; }
        .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #C1C9B6 #F0F3E8; }
      `}} />
    </div>
  );
};

export default Availability;