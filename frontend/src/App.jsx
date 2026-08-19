import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './components/Layout/DashboardLayout';
import Overview from './pages/hotel/Overview';
import Availability from './pages/hotel/FrontOffice/Availability';
import Billing from './pages/hotel/FrontOffice/Billing';
import GuestManagement from './pages/hotel/FrontOffice/GuestManagement';
import StayOverview from './pages/hotel/FrontOffice/StayOverview';
import CreateReservation from './pages/hotel/FrontOffice/CreateReservation';
import GuestHistory from './pages/hotel/FrontOffice/GuestHistory';
import GstReport from './pages/hotel/FrontOffice/GstReport';
import Report from './pages/hotel/FrontOffice/Report';
import ServiceOrders from './pages/hotel/FrontOffice/ServiceOrders';
import GuestBillingDetails from './pages/hotel/FrontOffice/GuestBillingDetails';
import GenerateKot from './pages/hotel/Kot/GenerateKot';
import KotList from './pages/hotel/Kot/KotList';
import KitchenView from './pages/hotel/Kot/KitchenView';
import BillingTemplatePage from './pages/superadmin/BillingTemplatePage';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import HotelList from './pages/superadmin/HotelList';
import AddHotel from './pages/superadmin/AddHotel';
import SettingsPage from './pages/hotel/SettingsPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import Transactions from './pages/hotel/Accounts/Transactions';
import Expenses from './pages/hotel/Accounts/Expenses';
import AssetDashboard from './pages/hotel/Assets/AssetDashboard';
import AssetList from './pages/hotel/Assets/AssetList';
import AssetLogs from './pages/hotel/Assets/AssetLogs';
import ActivityLogs from './pages/hotel/Management/ActivityLogs';

const DashboardIndex = () => {
  const { user } = useAuth();
  if (user?.role === 'superadmin') {
    return <Navigate to="/superadmin/dashboard" replace />;
  }
  return <Navigate to="overview" replace />;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<Login />} />

      {/* Dashboard Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardIndex />} />
        <Route path="overview" element={<Overview />} />

        {/* Front Office Sub-routes */}
        <Route path="front-office">
          <Route path="user" element={<GuestManagement />} />
          <Route path="stay" element={<StayOverview />} />
          <Route path="reservation" element={<CreateReservation />} />

          <Route path="availability" element={<Availability />} />
          <Route path="billing" element={<Billing />} />
          <Route path="history" element={<GuestHistory />} />
          <Route path="gst" element={<GstReport />} />
          <Route path="report" element={<Report />} />
          <Route path="services" element={<ServiceOrders />} />
          <Route path="guest-billing/:id" element={<GuestBillingDetails />} />
        </Route>

        {/* KOT Management Sub-routes */}
        <Route path="kot">
          <Route path="new" element={<GenerateKot />} />
          <Route path="list" element={<KotList />} />
          <Route path="kitchen" element={<KitchenView />} />
        </Route>

        {/* Accounts Sub-routes */}
        <Route path="accounts">
          <Route path="transactions" element={<Transactions />} />
          <Route path="expenses" element={<Expenses />} />
        </Route>

        {/* Asset Management Sub-routes */}
        <Route path="assets">
          <Route index element={<AssetDashboard />} />
          <Route path="list" element={<AssetList />} />
          <Route path="logs" element={<AssetLogs />} />
        </Route>

        <Route path="settings" element={<SettingsPage />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
      </Route>

      {/* Super Admin Routes (No /dashboard prefix) */}
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute allowedRoles={['superadmin']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<SuperAdminDashboard />} />
        <Route path="hotels" element={<HotelList />} />
        <Route path="hotels/add" element={<AddHotel />} />
        <Route path="hotels/edit/:id" element={<AddHotel />} />
        <Route path="billing-template" element={<BillingTemplatePage />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
      </Route>

      {/* Default redirect */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;