import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [activeHotel, setActiveHotel] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHotelDetails = async (hotelId) => {
    try {
      const response = await api.get(`/hotels/${hotelId}`);
      if (response.data.success) {
        setActiveHotel(response.data.data);
        localStorage.setItem('activeHotel', JSON.stringify(response.data.data));
      }
    } catch (error) {
      console.error('Error fetching hotel details:', error);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      const storedHotel = localStorage.getItem('activeHotel');

      if (token && storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        
        const activeHotelId = localStorage.getItem('activeHotelId') || parsedUser.hotelId;
        if (activeHotelId) {
          localStorage.setItem('activeHotelId', activeHotelId);
          if (storedHotel) {
            try {
              setActiveHotel(JSON.parse(storedHotel));
              fetchHotelDetails(activeHotelId); // Background refresh to sync any admin changes
            } catch (e) {
              await fetchHotelDetails(activeHotelId);
            }
          } else {
            await fetchHotelDetails(activeHotelId);
          }
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { token, user: loggedUser, hotel } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(loggedUser));
      
      const hotelId = loggedUser.hotelId;
      if (hotelId) {
        localStorage.setItem('activeHotelId', hotelId);
        if (hotel) {
          setActiveHotel(hotel);
          localStorage.setItem('activeHotel', JSON.stringify(hotel));
        } else {
          fetchHotelDetails(hotelId); // Background fetch if hotel missing
        }
      }
      
      setUser(loggedUser);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed. Please try again.'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('activeHotelId');
    localStorage.removeItem('activeHotel');
    setUser(null);
    setActiveHotel(null);
  };

  const switchHotel = async (hotelId) => {
    if (user?.role === 'superadmin') {
      localStorage.setItem('activeHotelId', hotelId);
      // Fetch details and reload page to apply tenant header everywhere
      try {
        const response = await api.get(`/hotels/${hotelId}`);
        if (response.data.success) {
          localStorage.setItem('activeHotel', JSON.stringify(response.data.data));
        }
      } catch (err) {
        console.error('Error switching hotel details:', err);
      }
      window.location.reload();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user, activeHotel, switchHotel, refreshHotel: fetchHotelDetails }}>
      {children}
    </AuthContext.Provider>
  );
};
