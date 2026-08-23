import React from 'react';

const GstCalculator = ({
  gstOption,
  gstRate,
  isCustomGst,
  handleGstOptionChange,
  handleGstRateChange,
  setIsCustomGst,
  subTotal,
  gstAmount,
  grandTotal,
  guestGst,
  companyName,
  companyAddress,
  onFieldChange,
  className = "bg-white p-2.5 sm:p-3 rounded-xl border border-[#DDE5D0] space-y-2 mt-2 hover:shadow-sm transition-all duration-300",
  disabled = false,
  corporateFieldsDisabled = false,
  extraCharges = 0,
  roomCalculationDetails = [],
  onRoomRateChange,
  chargePreviousDay = false,
  earlyCheckInCharge = 0,
  onEarlyCheckInChargeChange,
  showCorporateDetails = true,
  discount = 0,
  discountReason = ''
}) => {
  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b border-[#DDE5D0]/40 pb-1.5">
        <span className="text-xs font-bold text-[#1A2E05]">GST Calculator & Summary</span>
      </div>

      {/* GST Option Section */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-[#1A2E05] block uppercase tracking-wider">GST Option</label>
        <div className="flex gap-2">
          {[
            { value: 'none', label: 'No GST' },
            { value: 'inclusive', label: 'Including GST' },
            { value: 'exclusive', label: 'Excluding GST' }
          ].map(opt => {
            const isActive = gstOption === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => handleGstOptionChange(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all bg-white flex-1 justify-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isActive
                  ? 'border-[#84A63C] text-[#5C7A1F] bg-[#84A63C]/5 ring-1 ring-[#84A63C] shadow-sm'
                  : 'border-[#DDE5D0] text-[#7A8A6A] hover:bg-[#F5F7F0]'
                  }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center shrink-0 ${isActive ? 'border-[#84A63C] bg-white' : 'border-gray-300'}`}>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#84A63C]" />}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* GST Rate (%) Section */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-[#1A2E05] block uppercase tracking-wider">GST Rate (%)</label>
        <div className="flex flex-wrap items-center gap-2">
          {[5, 12, 18, 28].map(rate => {
            const isSelected = gstOption !== 'none' && Number(gstRate) === rate && !isCustomGst;
            return (
              <button
                key={rate}
                type="button"
                disabled={disabled || gstOption === 'none'}
                onClick={() => {
                  setIsCustomGst(false);
                  handleGstRateChange(rate);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${disabled || gstOption === 'none'
                  ? 'opacity-40 cursor-not-allowed border-[#DDE5D0] text-[#7A8A6A] bg-white/40'
                  : isSelected
                    ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-sm'
                    : 'bg-white border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F5F7F0]'
                  }`}
              >
                {rate}%
              </button>
            );
          })}

          {/* Custom Selector */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || gstOption === 'none'}
              onClick={() => {
                setIsCustomGst(true);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${disabled || gstOption === 'none'
                ? 'opacity-40 cursor-not-allowed border-[#DDE5D0] bg-white/40'
                : isCustomGst
                  ? 'bg-[#84A63C] border-[#84A63C] text-white shadow-sm'
                  : 'bg-white border-[#DDE5D0] text-[#4A5E38] hover:bg-[#F5F7F0]'
                }`}
            >
              Custom
            </button>
            {isCustomGst && gstOption !== 'none' && (
              <div className="flex items-center gap-1.5 animate-fade-in shrink-0">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  disabled={disabled}
                  value={gstRate}
                  onChange={(e) => handleGstRateChange(e.target.value)}
                  className="w-14 px-2 py-1 bg-white border border-[#DDE5D0] focus:border-[#84A63C] focus:outline-none rounded-lg text-xs font-bold text-center disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="%"
                />
                <span className="text-xs font-bold text-[#4A5E38]">%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calculations Box */}
      <div className="bg-[#84A63C]/5 border border-[#84A63C]/10 rounded-xl p-3.5 space-y-2">
        {roomCalculationDetails && roomCalculationDetails.length > 0 && (
          <div className="border-b border-[#DDE5D0]/60 pb-2 mb-2 space-y-1.5 text-left">
            {roomCalculationDetails.map((room, idx) => {
              if (room.isShiftedPrevious && room.days === 0) {
                return (
                  <div key={idx} className="flex justify-between items-center text-[10px] text-[#7A8A6A]">
                    <span className="font-semibold text-[#4A5E38]">
                      Room {room.roomNumber} ({room.type || 'Deluxe'}):
                    </span>
                    <div className="flex items-center gap-1 font-bold text-gray-500">
                      <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded border border-amber-200">Same-Day Shift</span>
                      <span className="ml-1 font-extrabold text-[#1A2E05]">
                        {Number(room.total || 0) > 0
                          ? `₹${Number(room.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '₹0.00 (No Charge)'}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="flex justify-between items-center text-[10px] text-[#7A8A6A] flex-wrap gap-1">
                  <div className="flex flex-col">
                    <span className="font-semibold text-[#4A5E38] inline-flex items-center gap-1">
                      Room {room.roomNumber} ({room.type || 'Deluxe'}):
                      {room.status === 'Completed' && (
                        <span className="text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1 py-0.2 rounded">
                          Checked Out
                        </span>
                      )}
                    </span>
                    {room.checkInDate && room.checkOutDate && (
                      <span className="text-[9px] text-[#5C7A1F] font-bold">
                        {room.checkInDate.split('T')[0].split('-').reverse().join('-')} to {room.checkOutDate.split('T')[0].split('-').reverse().join('-')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-extrabold text-[#1A2E05]">
                    <span>₹</span>
                    {onRoomRateChange && !disabled ? (
                      <input
                        type="number"
                        value={room.rate}
                        min="0"
                        step="any"
                        onChange={(e) => onRoomRateChange(room.roomId, e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        className="w-20 px-1 py-0.5 bg-white border border-[#DDE5D0] rounded focus:outline-none focus:border-[#84A63C] text-[10px] font-bold text-center text-[#1A2E05] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    ) : (
                      <span>{room.rate.toLocaleString()}</span>
                    )}
                    <span className="text-[#7A8A6A] font-normal ml-1">
                      × {room.days} {room.days === 1 ? 'Day' : 'Days'} =
                    </span>
                    <span className="ml-1 text-[#1A2E05]">
                      ₹{room.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })}
            {chargePreviousDay && Number(earlyCheckInCharge) > 0 && (
              <div className="flex justify-between items-center text-[10px] text-[#7A8A6A] border-t border-dashed border-[#DDE5D0]/40 pt-1.5 mt-1.5">
                <span className="font-semibold text-amber-800">
                  Early Check-in Charge:
                </span>
                <div className="flex items-center gap-1 font-extrabold text-[#1A2E05]">
                  <span>₹</span>
                  {onEarlyCheckInChargeChange && !disabled ? (
                    <input
                      type="number"
                      value={earlyCheckInCharge}
                      min="0"
                      step="any"
                      onChange={(e) => onEarlyCheckInChargeChange(e.target.value === '' ? '' : (parseFloat(e.target.value) || 0))}
                      onWheel={(e) => e.target.blur()}
                      className="w-20 px-1 py-0.5 bg-white border border-[#DDE5D0] rounded focus:outline-none focus:border-[#84A63C] text-[10px] font-bold text-center text-[#1A2E05] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  ) : (
                    <span>{earlyCheckInCharge.toLocaleString()}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {Number(discount) > 0 ? (
          <>
            <div className="flex justify-between items-center text-xs">
              <span className="font-black text-[#2D3E1E]">Base Amount:</span>
              <span className="font-black text-[#1A2E05]">₹{(subTotal + Number(discount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-rose-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-black">Discount:</span>
                {discountReason && <span className="text-[9.5px] font-bold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">({discountReason})</span>}
              </div>
              <span className="font-black">- ₹{Number(discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center text-xs border-t border-dashed border-[#DDE5D0]/60 pt-1">
              <span className="font-black text-[#1A2E05]">Net Base Amount:</span>
              <span className="font-black text-[#1A2E05]">₹{subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-center text-xs">
            <span className="font-black text-[#2D3E1E]">Base Amount:</span>
            <span className="font-black text-[#1A2E05]">₹{subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="flex justify-between items-center text-xs">
          <span className="font-black text-[#2D3E1E]">GST ({gstOption === 'none' ? '0' : gstRate}%):</span>
          <span className="font-black text-[#456113]">₹{gstAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {extraCharges > 0 && (
          <div className="flex justify-between items-center text-xs">
            <span className="font-black text-[#2D3E1E]">Service Orders / Extras:</span>
            <span className="font-black text-amber-800">₹{extraCharges.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="border-t border-[#C8D6B0] pt-2 flex justify-between items-center text-xs">
          <span className="font-black text-[#1A2E05]">Total Amount:</span>
          <span className="font-black text-[#1A2E05] text-sm">₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Corporate Billing Section */}
      {showCorporateDetails && gstOption !== 'none' && (
        <div className="border-t border-[#DDE5D0]/40 pt-3.5 space-y-3 animate-fade-in text-left">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-[#4A5E38] block tracking-wider uppercase">Customer GST Number</label>
            <input
              type="text"
              name="guestGst"
              disabled={corporateFieldsDisabled}
              value={guestGst || ''}
              onChange={onFieldChange}
              placeholder="e.g. 27AAAAA1111A1Z1"
              autoComplete="one-time-code"
              className="w-full px-3 py-2 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-[#84A63C] transition-all text-[#1A2E05] disabled:bg-[#F5F7F0] disabled:text-[#7A8A6A] disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-[#4A5E38] block uppercase tracking-wider">Company Name</label>
              <input
                type="text"
                name="companyName"
                disabled={corporateFieldsDisabled}
                value={companyName || ''}
                onChange={onFieldChange}
                placeholder="e.g. ABC Pvt Ltd"
                autoComplete="one-time-code"
                className="w-full px-3 py-2 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-[#84A63C] transition-all text-[#1A2E05] disabled:bg-[#F5F7F0] disabled:text-[#7A8A6A] disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-[#4A5E38] block tracking-wider uppercase">Company Address</label>
              <input
                type="text"
                name="companyAddress"
                disabled={corporateFieldsDisabled}
                value={companyAddress || ''}
                onChange={onFieldChange}
                placeholder="e.g. Mumbai, India"
                autoComplete="one-time-code"
                className="w-full px-3 py-2 bg-[#FBFDF8] border border-[#DDE5D0] rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-[#84A63C] transition-all text-[#1A2E05] disabled:bg-[#F5F7F0] disabled:text-[#7A8A6A] disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GstCalculator;
