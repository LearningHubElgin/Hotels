import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, Edit, Trash2, Calendar, DollarSign, Wrench, X, 
  AlertCircle, CheckCircle2, Info, Loader2, Play
} from 'lucide-react';
import api from '../../../services/api';

const AssetLogs = () => {
  const [searchParams] = useSearchParams();
  const queryAssetId = searchParams.get('assetId');

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [filterStatus, setFilterStatus] = useState('All');

  // Modals
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  
  const [selectedLog, setSelectedLog] = useState(null);

  // Add Log form fields
  const [formData, setFormData] = useState({
    assetId: '',
    issue: '',
    date: new Date().toISOString().split('T')[0],
    status: 'Pending',
    cost: '',
    remarks: '',
    updateAssetStatus: 'Under Repair' // Default to 'Under Repair' for immediate status update
  });

  // Complete Log form fields
  const [completeData, setCompleteData] = useState({
    cost: '',
    remarks: '',
    status: 'Completed'
  });

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchLogs();
    fetchAssets();
  }, []);

  useEffect(() => {
    // If assetId is in URL, open the modal pre-filled
    if (queryAssetId && assets.length > 0) {
      handleOpenLogModal(queryAssetId);
    }
  }, [queryAssetId, assets]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/assets/logs');
      if (res.data?.success) {
        setLogs(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      const res = await api.get('/assets');
      if (res.data?.success) {
        setAssets(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
    }
  };

  const handleOpenLogModal = (prefilledAssetId = '') => {
    setFormData({
      assetId: prefilledAssetId || (assets.length > 0 ? assets[0].id : ''),
      issue: '',
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      cost: '',
      remarks: '',
      updateAssetStatus: 'Under Repair'
    });
    setErrorMsg('');
    setIsLogModalOpen(true);
  };

  const handleCreateLog = async (e) => {
    e.preventDefault();
    if (!formData.assetId || !formData.issue || !formData.date) {
      setErrorMsg('Asset, Issue, and Date are required.');
      return;
    }

    try {
      const res = await api.post('/assets/logs', formData);
      if (res.data?.success) {
        fetchLogs();
        fetchAssets(); // Refresh assets to reflect new status
        setIsLogModalOpen(false);
      }
    } catch (error) {
      console.error('Error saving log:', error);
      setErrorMsg(error.response?.data?.message || 'Failed to create log.');
    }
  };

  const handleOpenCompleteModal = (log) => {
    setSelectedLog(log);
    setCompleteData({
      cost: log.cost || '',
      remarks: log.remarks || '',
      status: 'Completed'
    });
    setIsCompleteModalOpen(true);
  };

  const handleCompleteSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put(`/assets/logs/${selectedLog.id}`, completeData);
      if (res.data?.success) {
        fetchLogs();
        fetchAssets(); // Refresh assets status to active
        setIsCompleteModalOpen(false);
      }
    } catch (error) {
      console.error('Error completing maintenance:', error);
    }
  };

  const handleDeleteLog = async (id) => {
    if (!window.confirm('Are you sure you want to delete this log entry?')) {
      return;
    }

    try {
      const res = await api.delete(`/assets/logs/${id}`);
      if (res.data?.success) {
        fetchLogs();
      }
    } catch (error) {
      console.error('Error deleting log:', error);
      alert('Failed to delete log entry.');
    }
  };

  // Filtered Logs
  const filteredLogs = logs.filter(log => {
    return filterStatus === 'All' || log.status === filterStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Maintenance & Repair Log</h1>
          <p className="text-gray-500 text-sm">Record operations logs, track mechanical issues, and log maintenance expenditures.</p>
        </div>
        <button 
          onClick={() => handleOpenLogModal()}
          className="flex items-center gap-2 bg-[#8BA73B] text-white px-4 py-2.5 rounded-xl hover:bg-[#768F31] transition-colors shadow-sm font-semibold text-sm"
        >
          <Plus size={16} /> Log Issue
        </button>
      </div>

      {/* Filter and Summary Bar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        {/* Status Toggle buttons */}
        <div className="flex items-center gap-2 p-1 bg-gray-50 border border-gray-200/60 rounded-xl w-full sm:w-auto">
          {['All', 'Pending', 'Completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === status 
                  ? 'bg-white text-gray-800 shadow-sm border border-gray-100' 
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {status} Logs
            </button>
          ))}
        </div>

        {/* Cost stats */}
        <div className="flex items-center gap-3 text-sm text-gray-500 font-medium">
          <Info size={16} className="text-blue-500" />
          <span>Total maintenance cost of displayed logs: <b>₹{filteredLogs.reduce((acc, log) => acc + parseFloat(log.cost || 0), 0).toLocaleString('en-IN')}</b></span>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          <Wrench size={40} className="mx-auto mb-2 text-gray-300" />
          No maintenance logs found matching status.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Asset Details</th>
                  <th className="px-6 py-4">Issue Reported</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Repair Cost</th>
                  <th className="px-6 py-4">Remarks</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-500 whitespace-nowrap">
                      {new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-bold text-gray-800">{log.Asset?.name || 'Unknown Asset'}</div>
                        <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                          <span>Tag: <b className="text-gray-500">{log.Asset?.assetId}</b></span>
                          <span>•</span>
                          <span>Loc: <b className="text-gray-500">{log.Asset?.location}</b></span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate" title={log.issue}>
                      {log.issue}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        log.status === 'Completed' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' 
                          : 'bg-yellow-50 text-yellow-700 border border-yellow-200/50'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-600">
                      {parseFloat(log.cost) > 0 ? `₹${parseFloat(log.cost).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs italic max-w-[150px] truncate" title={log.remarks}>
                      {log.remarks || 'No notes'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* Complete action button */}
                        {log.status === 'Pending' && (
                          <button
                            onClick={() => handleOpenCompleteModal(log)}
                            title="Complete Service"
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 shadow-sm transition-colors"
                          >
                            <Play size={12} fill="white" /> Complete
                          </button>
                        )}
                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          title="Delete Entry"
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Issue Modal */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800">Log Maintenance / Repair</h3>
              <button 
                onClick={() => setIsLogModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateLog} className="p-6 space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-xs font-medium rounded-xl border border-red-100">
                  <AlertCircle size={16} /> {errorMsg}
                </div>
              )}

              {/* Asset Select */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase">Select Asset *</label>
                <select
                  value={formData.assetId}
                  onChange={(e) => setFormData({...formData, assetId: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-emerald-500"
                  required
                >
                  <option value="" disabled>-- Choose Asset --</option>
                  {assets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.assetId}) - {asset.location} [{asset.status}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Issue Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase">Issue / Service Required *</label>
                <textarea 
                  rows="3"
                  placeholder="e.g. Cooling not working, weird compressor sound."
                  value={formData.issue}
                  onChange={(e) => setFormData({...formData, issue: e.target.value})}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                  required
                ></textarea>
              </div>

              {/* Date & Initial Cost */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase">Log Date *</label>
                  <input 
                    type="date" 
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase">Est. Cost (₹)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={formData.cost}
                    onChange={(e) => setFormData({...formData, cost: e.target.value})}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Update Asset Status Option */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase">Update Asset Status To</label>
                <select
                  value={formData.updateAssetStatus}
                  onChange={(e) => setFormData({...formData, updateAssetStatus: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Keep current status</option>
                  <option value="Under Maintenance">Under Maintenance</option>
                  <option value="Under Repair">Under Repair</option>
                  <option value="Damaged">Damaged</option>
                </select>
                <p className="text-[10px] text-gray-400">Selecting this changes the asset's active status in your inventory instantly.</p>
              </div>

              {/* Initial Remarks */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase">Remarks / Diagnostics</label>
                <input 
                  type="text" 
                  placeholder="e.g. Called AC mechanic, visits tomorrow"
                  value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#8BA73B] text-white rounded-xl text-sm font-semibold hover:bg-[#768F31] transition-colors"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Service Modal */}
      {isCompleteModalOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500" size={18} />
                Complete Service Details
              </h3>
              <button 
                onClick={() => setIsCompleteModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCompleteSubmit} className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-100 p-3.5 rounded-xl text-xs space-y-1">
                <p className="text-gray-400">Asset: <b className="text-gray-700">{selectedLog?.Asset?.name} ({selectedLog?.Asset?.assetId})</b></p>
                <p className="text-gray-400">Issue: <span className="text-gray-600 italic">"{selectedLog?.issue}"</span></p>
              </div>

              {/* Repair Cost */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase">Actual Repair Cost (₹) *</label>
                <input 
                  type="number" 
                  placeholder="Enter service fee / parts cost"
                  value={completeData.cost}
                  onChange={(e) => setCompleteData({...completeData, cost: e.target.value})}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {/* Completion Remarks */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase">Completion Remarks / Resolution</label>
                <textarea 
                  rows="3"
                  placeholder="e.g. Compressor gas refilled. 3 months warranty on service."
                  value={completeData.remarks}
                  onChange={(e) => setCompleteData({...completeData, remarks: e.target.value})}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                ></textarea>
                <p className="text-[10px] text-emerald-600 font-medium">Completing this resolves the issue and resets the asset status back to "Active".</p>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors shadow-sm"
                >
                  Submit & Reset Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetLogs;
