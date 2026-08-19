import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Wrench, ShieldCheck, AlertTriangle, AlertOctagon, 
  Trash2, DollarSign, ArrowRight, Activity
} from 'lucide-react';
import api from '../../../services/api';

const AssetDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    maintenance: 0,
    repair: 0,
    damaged: 0,
    disposed: 0,
    totalCost: 0
  });
  const [attentionAssets, setAttentionAssets] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [assetsRes, logsRes] = await Promise.all([
        api.get('/assets'),
        api.get('/assets/logs')
      ]);

      if (assetsRes.data?.success && logsRes.data?.success) {
        const assets = assetsRes.data.data;
        const logs = logsRes.data.data;

        // Calculate counts
        const counts = {
          total: assets.length,
          active: 0,
          maintenance: 0,
          repair: 0,
          damaged: 0,
          disposed: 0,
          totalCost: 0
        };

        assets.forEach(asset => {
          if (asset.status === 'Active') counts.active++;
          else if (asset.status === 'Under Maintenance') counts.maintenance++;
          else if (asset.status === 'Under Repair') counts.repair++;
          else if (asset.status === 'Damaged') counts.damaged++;
          else if (asset.status === 'Disposed') counts.disposed++;
        });

        // Filter assets needing attention
        const attention = assets.filter(asset => 
          ['Under Maintenance', 'Under Repair', 'Damaged'].includes(asset.status)
        );

        // Calculate total cost from logs
        const cost = logs.reduce((acc, log) => acc + parseFloat(log.cost || 0), 0);
        counts.totalCost = cost;

        setStats(counts);
        setAttentionAssets(attention.slice(0, 5));
        setRecentLogs(logs.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching asset dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const activePercentage = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Asset Management Dashboard</h1>
          <p className="text-gray-500 text-sm">Monitor physical property health, maintenance metrics, and repair cost ledger.</p>
        </div>
        <Link 
          to="/dashboard/assets/list" 
          className="flex items-center gap-2 bg-[#8BA73B] text-white px-4 py-2.5 rounded-xl hover:bg-[#768F31] transition-colors shadow-sm font-medium text-sm"
        >
          Manage Inventory <ArrowRight size={16} />
        </Link>
      </div>

      {/* Grid Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Assets Card */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Assets</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</h3>
          </div>
        </div>

        {/* Operational Assets Card */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Active / Good</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.active}</h3>
            <span className="text-xs text-emerald-600 font-medium">{activePercentage}% Operational</span>
          </div>
        </div>

        {/* Assets in Trouble Card */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <Wrench size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Needs Service</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.maintenance + stats.repair}</h3>
            <span className="text-xs text-amber-600 font-medium">Maint: {stats.maintenance} | Repair: {stats.repair}</span>
          </div>
        </div>

        {/* Expenses Card */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="p-3.5 bg-red-50 text-red-600 rounded-xl">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Service Cost</p>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">₹{stats.totalCost.toLocaleString('en-IN')}</h3>
            <span className="text-xs text-gray-400">Accumulated repairs</span>
          </div>
        </div>
      </div>

      {/* Sub Status Ring Bar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex justify-between items-center text-sm font-medium text-gray-700">
          <span>Property Asset Health Index</span>
          <span>{activePercentage}% Healthy</span>
        </div>
        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 h-full" style={{ width: `${(stats.active / stats.total) * 100 || 0}%` }} title="Active"></div>
          <div className="bg-yellow-400 h-full" style={{ width: `${(stats.maintenance / stats.total) * 100 || 0}%` }} title="Maintenance"></div>
          <div className="bg-orange-500 h-full" style={{ width: `${(stats.repair / stats.total) * 100 || 0}%` }} title="Repair"></div>
          <div className="bg-red-500 h-full" style={{ width: `${(stats.damaged / stats.total) * 100 || 0}%` }} title="Damaged"></div>
          <div className="bg-gray-400 h-full" style={{ width: `${(stats.disposed / stats.total) * 100 || 0}%` }} title="Disposed"></div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs font-medium text-gray-500 pt-1">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Active ({stats.active})</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block"></span> Maintenance ({stats.maintenance})</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span> Repair ({stats.repair})</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Damaged ({stats.damaged})</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"></span> Disposed ({stats.disposed})</span>
        </div>
      </div>

      {/* Main Body Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Attention Needed */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm lg:col-span-6 space-y-4">
          <div className="flex justify-between items-center border-b border-gray-50 pb-3">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} />
              Needs Attention ({attentionAssets.length})
            </h3>
            <Link to="/dashboard/assets/list?filter=trouble" className="text-xs text-[#8BA73B] font-bold hover:underline">
              View All
            </Link>
          </div>

          {attentionAssets.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <ShieldCheck className="mx-auto text-emerald-400 mb-2" size={32} />
              All assets are currently healthy and operational!
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {attentionAssets.map(asset => (
                <div key={asset.id} className="py-3.5 flex justify-between items-center first:pt-0 last:pb-0">
                  <div className="space-y-1">
                    <h4 className="font-bold text-gray-800 text-sm">{asset.name}</h4>
                    <div className="flex gap-2 text-xs text-gray-400">
                      <span>Tag: <b className="text-gray-600">{asset.assetId}</b></span>
                      <span>•</span>
                      <span>Loc: <b className="text-gray-600">{asset.location}</b></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                      asset.status === 'Under Maintenance' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200/50' :
                      asset.status === 'Under Repair' ? 'bg-orange-50 text-orange-700 border border-orange-200/50' :
                      'bg-red-50 text-red-700 border border-red-200/50'
                    }`}>
                      {asset.status}
                    </span>
                    <Link 
                      to={`/dashboard/assets/logs?assetId=${asset.id}`} 
                      className="p-1.5 hover:bg-gray-50 text-gray-400 hover:text-gray-600 rounded-lg transition-all"
                    >
                      <Wrench size={16} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Recent Activity Logs */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm lg:col-span-6 space-y-4">
          <div className="flex justify-between items-center border-b border-gray-50 pb-3">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Wrench className="text-blue-500" size={18} />
              Recent Service Logs
            </h3>
            <Link to="/dashboard/assets/logs" className="text-xs text-[#8BA73B] font-bold hover:underline">
              Logs Ledger
            </Link>
          </div>

          {recentLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No service logs recorded yet.
            </div>
          ) : (
            <div className="relative border-l border-gray-100 ml-3 pl-5 space-y-5">
              {recentLogs.map(log => (
                <div key={log.id} className="relative text-sm space-y-1">
                  {/* Dot */}
                  <span className={`absolute -left-[26px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                    log.status === 'Pending' ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}></span>
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-gray-800 text-xs">{log.Asset?.name || 'Unknown Asset'}</span>
                    <span className="text-gray-400 text-[10px] whitespace-nowrap">{new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  <p className="text-gray-500 text-xs line-clamp-1">{log.issue}</p>
                  <div className="flex justify-between items-center pt-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      log.status === 'Pending' ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {log.status}
                    </span>
                    {parseFloat(log.cost) > 0 && (
                      <span className="text-gray-600 text-xs font-semibold">₹{parseFloat(log.cost).toLocaleString('en-IN')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetDashboard;
