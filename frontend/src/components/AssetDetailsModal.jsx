import React, { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, Tag, Info, AlertCircle, Wrench, ShieldCheck, MapPin } from 'lucide-react';
import api from '../services/api';

const AssetDetailsModal = ({ assetId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState(null);

  useEffect(() => {
    fetchAssetDetails();
  }, [assetId]);

  const fetchAssetDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/assets/${assetId}`);
      if (res.data?.success) {
        setAsset(res.data.data);
      }
    } catch (error) {
      console.error('Error fetching asset details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (onClose === undefined) return null;

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Wrench size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Asset Specifications & History</h3>
              <p className="text-xs text-gray-400">Detailed logs for asset ID: <span className="font-bold text-gray-600">{asset?.assetId || 'Loading...'}</span></p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : !asset ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Asset details could not be found.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Asset Profile Grid */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Asset Name</span>
                <span className="font-bold text-gray-800 text-sm">{asset.name}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Category</span>
                <span className="font-semibold text-gray-600 text-sm">{asset.category}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Location</span>
                <span className="font-semibold text-gray-700 text-sm flex items-center gap-1">
                  <MapPin size={12} className="text-gray-400" /> {asset.location}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Brand & Specs</span>
                <span className="text-gray-700 text-sm font-medium">{asset.brand || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Serial Number</span>
                <span className="text-gray-700 text-sm font-mono">{asset.serialNumber || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Status</span>
                <span className={`px-2 py-0.5 text-xs font-bold rounded-lg inline-block mt-0.5 ${
                  asset.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' :
                  asset.status === 'Under Maintenance' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200/50' :
                  asset.status === 'Under Repair' ? 'bg-orange-50 text-orange-700 border border-orange-200/50' :
                  asset.status === 'Damaged' ? 'bg-red-50 text-red-700 border border-red-200/50' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {asset.status}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Purchase Value</span>
                <span className="font-bold text-gray-800 text-sm">
                  {parseFloat(asset.purchasePrice) > 0 ? `₹${parseFloat(asset.purchasePrice).toLocaleString('en-IN')}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Purchase Date</span>
                <span className="text-gray-600 text-sm font-medium">
                  {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
              <div className="sm:col-span-2 md:col-span-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Warranty/Additional Notes</span>
                <p className="text-gray-600 text-xs italic mt-0.5">{asset.notes || 'No notes added.'}</p>
              </div>
            </div>

            {/* Service & Maintenance History Timeline */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                Service & Maintenance Ledger ({asset.AssetLogs?.length || 0})
              </h4>
              
              {!asset.AssetLogs || asset.AssetLogs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs bg-gray-50/30 border border-dashed border-gray-200 rounded-2xl">
                  <ShieldCheck className="mx-auto text-emerald-400/80 mb-2" size={24} />
                  No service reports logged for this asset yet.
                </div>
              ) : (
                <div className="relative border-l border-gray-100 ml-3 pl-5 space-y-6">
                  {asset.AssetLogs.map(log => (
                    <div key={log.id} className="relative text-sm space-y-1.5">
                      {/* Timeline Node Icon */}
                      <span className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${
                        log.status === 'Pending' ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}></span>
                      
                      {/* Header line */}
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-gray-800 text-xs sm:text-sm">{log.issue}</span>
                        <span className="text-gray-400 text-[10px] font-medium whitespace-nowrap bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
                          {new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Details Remarks and status indicators */}
                      {log.remarks && (
                        <p className="text-gray-500 text-xs bg-gray-50/50 p-2.5 rounded-lg border border-gray-100/50">
                          {log.remarks}
                        </p>
                      )}

                      <div className="flex justify-between items-center text-xs font-semibold text-gray-500 pt-0.5">
                        <span className={`text-[10px] uppercase font-bold tracking-wider ${
                          log.status === 'Pending' ? 'text-amber-500' : 'text-emerald-500'
                        }`}>
                          {log.status}
                        </span>
                        {parseFloat(log.cost) > 0 && (
                          <span className="text-gray-800">
                            Service Cost: <b className="text-gray-900 font-bold">₹{parseFloat(log.cost).toLocaleString('en-IN')}</b>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition-colors shadow-sm"
          >
            Close Specifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssetDetailsModal;
