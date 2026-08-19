import React, { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, Building, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, user } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false,
  });

  useEffect(() => {
    document.title = 'Login | HotelSoft';
    const faviconLink = document.querySelector("link[rel~='icon']");
    if (faviconLink) {
      faviconLink.href = '/favicon.png';
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const defaultRedirect = user?.role === 'superadmin' ? '/superadmin/dashboard' : '/dashboard';
      const from = location.state?.from?.pathname || defaultRedirect;
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setError('');
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(formData.username, formData.password);
    
    if (result.success) {
      // Login context stores the user in local storage. Let's retrieve it or wait for context state.
      const storedUser = localStorage.getItem('user');
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;
      const defaultRedirect = parsedUser?.role === 'superadmin' ? '/superadmin/dashboard' : '/dashboard';
      
      const from = location.state?.from?.pathname || defaultRedirect;
      navigate(from, { replace: true });
    } else {
      setError(result.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#F5F7F0] p-4 sm:p-8 relative overflow-hidden">
      {/* Background Glow Effects - Adjusted for Light Theme */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] bg-[#84A63C]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] bg-[#5C7A1F]/5 rounded-full blur-[150px]" />
      </div>

      <div className="w-full max-w-[420px] z-10 animate-fade-in-up">
        {/* Glass Card */}
        <div className="bg-white/[0.97] backdrop-blur-xl border border-white/60 shadow-2xl shadow-black/20 rounded-3xl p-6 sm:p-10 transition-all duration-500">
          
          {/* Header */}
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 sm:w-28 sm:h-28 rounded-[2rem] bg-white shadow-xl shadow-black/5 mb-4 sm:mb-6 overflow-hidden border border-[#DDE5D0]">
              <img src="/favicon.png" alt="Hotel Software Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#1A2E05] tracking-tight">
              Your Hotel Software
            </h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold animate-shake">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#4A5E38] ml-1" htmlFor="username">
                Username
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#7A8A6A]/40 group-focus-within:text-[#84A63C] transition-colors">
                  <User size={17} strokeWidth={1.5} />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  disabled={loading}
                  className="w-full pl-11 pr-4 py-3.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-[#1A2E05] text-sm placeholder-[#7A8A6A]/50 focus:outline-none focus:border-[#84A63C] focus:ring-2 focus:ring-[#84A63C]/15 focus:bg-white transition-all duration-200 disabled:opacity-50"
                  placeholder="admin_staff"
                  value={formData.username}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#4A5E38] ml-1" htmlFor="password">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#7A8A6A]/40 group-focus-within:text-[#84A63C] transition-colors">
                  <Lock size={17} strokeWidth={1.5} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={loading}
                  className="w-full pl-11 pr-12 py-3.5 bg-[#F0F3E8] border border-[#DDE5D0] rounded-xl text-[#1A2E05] text-sm placeholder-[#7A8A6A]/50 focus:outline-none focus:border-[#84A63C] focus:ring-2 focus:ring-[#84A63C]/15 focus:bg-white transition-all duration-200 disabled:opacity-50"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#7A8A6A]/40 hover:text-[#1A2E05] transition-colors"
                >
                  {showPassword ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center">
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  disabled={loading}
                  className="h-4 w-4 border-[#DDE5D0] rounded accent-[#84A63C]"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                />
                <label htmlFor="rememberMe" className="ml-2 block text-xs font-semibold text-[#7A8A6A] cursor-pointer select-none">
                  Keep me signed in
                </label>
              </div>
              <a href="#" className="text-xs font-semibold text-[#84A63C] hover:text-[#5C7A1F] transition-colors">
                Forgot?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3.5 px-4 bg-gradient-to-r from-[#84A63C] to-[#6B8C3E] text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-[#84A63C]/25 transition-all transform active:scale-[0.98] mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 text-[#4A5E38]/60 text-[11px] font-semibold z-10">
        © 2026 HotelSoft Solutions
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}} />
    </div>
  );
};

export default Login;
