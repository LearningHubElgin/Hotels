import React, { useState, useEffect } from 'react';
import { Bell, Menu, Maximize2, Minimize2 } from 'lucide-react'
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const Header = ({ title, onMenuClick }) => {
  const { user, activeHotel, switchHotel } = useAuth();
  const [hotels, setHotels] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error entering fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error('Error exiting fullscreen:', err);
      });
    }
  };

  useEffect(() => {
    if (user?.role === 'superadmin') {
      const fetchHotels = async () => {
        try {
          const res = await api.get('/hotels');
          if (res.data.success) {
            setHotels(res.data.data);
          }
        } catch (err) {
          console.error('Error fetching hotels for switcher:', err);
        }
      };
      fetchHotels();
    }
  }, [user]);

  return (
    <header className="h-14 bg-white border-b border-[#DDE5D0] px-3 md:px-5 lg:px-6 flex items-center justify-between sticky top-0 z-40 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 hover:bg-[#F0F3E8] rounded-lg lg:hidden transition-colors text-[#4A5E38]"
        >
          <Menu size={22} />
        </button>
        <div>
          <h2 className="text-[15px] font-bold text-[#1A2E05]">{title}</h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Fullscreen Button */}
          <button 
            type="button" 
            onClick={handleFullscreenToggle} 
            className="w-8 h-8 flex items-center justify-center bg-[#F0F3E8] text-[#5C7A1F] hover:bg-[#84A63C] hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          
          <div className="h-7 w-px bg-[#DDE5D0] mx-1 hidden sm:block"></div>

          <button className="flex items-center gap-2.5 pl-2 pr-1.5 py-1 rounded-xl hover:bg-[#F0F3E8] transition-all group">
            <div className="text-right hidden sm:block">
              <p className="text-[13px] font-semibold text-[#1A2E05] leading-tight capitalize">
                {user?.username || 'Admin'}
              </p>
              <p className="text-xs text-[#7A8A6A] font-medium leading-tight capitalize">
                {user?.role || 'Administrator'}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#84A63C] to-[#5C7A1F] flex items-center justify-center text-white text-xs font-bold shadow-md shadow-[#84A63C]/20 uppercase">
              {(user?.username || 'A')[0]}
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header;
