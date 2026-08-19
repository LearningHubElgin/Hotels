import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ShieldAlert, Loader2, X, Download, CheckCircle, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { generateTaxInvoice } from '../../utils/taxInvoiceGenerator';

const BillingTemplatePage = () => {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    templateId: null,
    templateName: ''
  });
  const [pdfUrl, setPdfUrl] = useState('');

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const mockBill = {
    id: 'TX-98402',
    guestName: 'John Doe',
    address: '123 Dobson Ln, Railway Quarters, Howrah',
    createdAt: new Date().toISOString(),
    checkInDate: '2026-07-01',
    checkOutDate: '2026-07-03',
    checkInTime: '12:00 PM',
    checkOutTime: '11:00 AM',
    totalAmount: 4000,
    amountPaid: 4720,
    discount: 0,
    gstRate: 18,
    paymentMode: 'UPI / GPay',
    guestGst: '19AAECP1234F1Z0',
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const templatesRes = await api.get('/billing-templates');
        if (templatesRes.data.success) {
          setTemplates(templatesRes.data.data);
        }
      } catch (err) {
        console.error('Error fetching billing templates:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  const handleOpenPreview = async (template) => {
    setPreviewModal({
      isOpen: true,
      templateId: template.id,
      templateName: template.name
    });

    try {
      // Backup any active hotel in storage
      const backup = localStorage.getItem('activeHotel');
      
      const mockHotel = {
        name: `Grand Royal ${template.name}`,
        address: '123 Dobson Ln, Railway Quarters, Howrah',
        city: 'Howrah',
        state: 'West Bengal',
        phone: '1234567890',
        email: 'contact@hotelsoft.com',
        gstin: '19AAECP1234F1Z0',
        billingTemplateId: template.id
      };
      localStorage.setItem('activeHotel', JSON.stringify(mockHotel));

      // Generate the PDF
      const blob = await generateTaxInvoice(mockBill, 'blob');
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      // Restore activeHotel backup
      if (backup) {
        localStorage.setItem('activeHotel', backup);
      } else {
        localStorage.removeItem('activeHotel');
      }
    } catch (err) {
      console.error('Error generating PDF preview:', err);
    }
  };

  const handleClosePreview = () => {
    setPreviewModal({
      isOpen: false,
      templateId: null,
      templateName: ''
    });
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl('');
    }
  };

  const handleDownloadTemplate = (template) => {
    try {
      const configData = {
        name: template.name,
        layout: template.layout,
        style: template.style
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(configData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${template.id || 'template'}_config.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Error downloading template config:', err);
    }
  };

  const handleImportTemplate = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportError('');
    setImportSuccess('');
    setImporting(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const config = JSON.parse(event.target.result);
        
        if (!config.name || !config.layout || !config.style) {
          throw new Error('Invalid template format. Must contain "name", "layout", and "style" properties.');
        }

        const res = await api.post('/billing-templates', {
          name: config.name,
          layout: config.layout,
          style: config.style
        });

        if (res.data.success) {
          setTemplates(prev => [...prev, res.data.data]);
          setImportSuccess(`Successfully imported "${config.name}" template!`);
        }
      } catch (err) {
        console.error(err);
        setImportError(err.response?.data?.message || err.message || 'Failed to parse and import JSON file.');
      } finally {
        setImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    setImportError('');
    setImportSuccess('');

    try {
      const res = await api.delete(`/billing-templates/${id}`);
      if (res.data.success) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        setImportSuccess('Template deleted successfully!');
      }
    } catch (err) {
      console.error(err);
      setImportError(err.response?.data?.message || 'Failed to delete template.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#84A63C]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-[#DDE5D0] p-5 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#1A2E05] tracking-tight">Billing Templates Registry</h2>
          <p className="text-xs text-[#7A8A6A] font-semibold mt-0.5">Manage and inspect global invoice styles available for hotel printing</p>
        </div>
        
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <label className="bg-[#84A63C] hover:bg-[#729231] text-white font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors shadow-md shadow-[#84A63C]/10 flex items-center justify-center gap-1.5 shrink-0">
            <Download size={13} className="rotate-180" /> {importing ? 'Importing...' : 'Import JSON'}
            <input
              type="file"
              accept=".json"
              onChange={handleImportTemplate}
              className="hidden"
              disabled={importing}
            />
          </label>
        </div>
      </div>

      {importError && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold">
          <ShieldAlert size={14} className="flex-shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {importSuccess && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold">
          <CheckCircle size={14} className="flex-shrink-0" />
          <span>{importSuccess}</span>
        </div>
      )}

      {/* Grid List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(t => {
          const tStyle = t.style || {};
          const tLayout = t.layout || [];

          return (
            <div key={t.id} className="bg-white border border-[#DDE5D0] shadow-sm rounded-3xl overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full">
              {/* Mini mockup illustration of header colors */}
              <div className="h-28 bg-[#F5F7F0] flex flex-col justify-between p-4 border-b border-[#DDE5D0] relative">
                <div className="space-y-2">
                  <div className="h-3 rounded-full w-2/3" style={{ backgroundColor: tStyle.primaryColor || '#84A63C' }} />
                  <div className="h-1.5 bg-gray-200 rounded-full w-1/3" />
                </div>
                <div className="flex justify-between items-end">
                  <div className="space-y-1 w-2/3">
                    <div className="h-1 bg-gray-200 rounded-full w-4/5" />
                    <div className="h-1 bg-gray-200 rounded-full w-2/3" />
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center bg-white text-[9px] font-black text-gray-500 uppercase">
                    {tStyle.theme === 'emerald' ? 'EM' : tStyle.theme === 'dark' ? 'CM' : 'WL'}
                  </div>
                </div>
              </div>

              {/* Details card content */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div>
                    <h3 className="font-extrabold text-[#1A2E05] text-sm">{t.name}</h3>
                    <span className="text-[10px] text-[#7A8A6A] font-semibold block">Configurable Template</span>
                  </div>

                  <div className="space-y-1.5 text-[11px] border-t border-[#F0F3E8] pt-3">
                    <div className="flex justify-between">
                      <span className="text-[#7A8A6A] font-bold">Font Family:</span>
                      <span className="font-extrabold text-[#1A2E05] capitalize">{tStyle.fontFamily}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7A8A6A] font-bold">Accent Color:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: tStyle.primaryColor }} />
                        <span className="font-extrabold text-[#1A2E05] uppercase text-[9px]">{tStyle.primaryColor}</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7A8A6A] font-bold">Title Align:</span>
                      <span className="font-extrabold text-[#1A2E05] capitalize">{tStyle.headerAlignment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7A8A6A] font-bold">Total Layers:</span>
                      <span className="font-extrabold text-[#1A2E05]">{tLayout.length} Elements</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(t)}
                    className="flex-1 bg-[#84A63C] hover:bg-[#729231] text-white font-bold text-xs py-2.5 rounded-xl transition-colors shadow-md shadow-[#84A63C]/10 flex items-center justify-center gap-1.5"
                  >
                    <FileText size={13} /> View PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate(t)}
                    className="bg-white border border-[#DDE5D0] hover:bg-[#F5F7F0] text-[#4A5E38] font-bold text-xs px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    title="Download JSON Config File"
                  >
                    <Download size={13} />
                  </button>
                  {t.id !== 'template_1' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="bg-white border border-red-100 hover:bg-red-50 text-red-500 font-bold text-xs px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                      title="Delete Template"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic PDF Modal */}
      {previewModal.isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-[#DDE5D0] shadow-2xl rounded-3xl max-w-3xl w-full flex flex-col h-[85vh] max-h-[720px]">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#F0F3E8] bg-[#F5F7F0]/30 rounded-t-3xl">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#84A63C]/10 rounded-lg text-[#84A63C]">
                  <FileText size={15} />
                </div>
                <div>
                  <h3 className="font-bold text-[#1A2E05] text-sm">{previewModal.templateName} PDF</h3>
                  <p className="text-[9px] text-[#7A8A6A] font-semibold">Live dynamic print simulation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClosePreview}
                className="p-1.5 hover:bg-gray-100 rounded-xl text-[#7A8A6A] hover:text-red-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Iframe content */}
            <div className="p-4 flex-1 bg-[#F5F7F0]/20 overflow-hidden flex items-center justify-center">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  title="Billing Template PDF"
                  className="w-full h-full rounded-2xl border border-[#DDE5D0] bg-white"
                />
              ) : (
                <div className="text-xs text-[#7A8A6A] font-bold animate-pulse">
                  Loading PDF content...
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default BillingTemplatePage;
