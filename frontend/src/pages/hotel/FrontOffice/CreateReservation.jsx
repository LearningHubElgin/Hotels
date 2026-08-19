import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import AddGuestModal from '../../../components/AddGuestModal';
import api from '../../../services/api';

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

const CreateReservation = () => {
  const navigate = useNavigate();
  const [conflictData, setConflictData] = useState(null);
  const [isConflictOpen, setIsConflictOpen] = useState(false);

  const handleConfirm = async (bookingData) => {
    try {
      await api.post('/bookings', bookingData);
      alert('Reservation successfully created!');
      navigate('/dashboard/front-office/stay');
    } catch (error) {
      if (error.response?.status === 409) {
        setConflictData(error.response.data.conflict);
        setIsConflictOpen(true);
      } else {
        console.error('Error creating reservation:', error);
        alert(error.response?.data?.message || 'Failed to create reservation');
      }
      // Throw error to let AddGuestModal reset its loading state
      throw error;
    }
  };

  return (
    <div className="animate-fade-in">
      <AddGuestModal
        isOpen={true}
        inline={true}
        onlyReservation={true}
        onClose={() => navigate('/dashboard/front-office/stay')}
        onConfirm={handleConfirm}
      />

      <ConflictModal
        isOpen={isConflictOpen}
        onClose={() => setIsConflictOpen(false)}
        conflict={conflictData}
      />
    </div>
  );
};

export default CreateReservation;
