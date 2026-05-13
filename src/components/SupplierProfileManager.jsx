import React, { useState, useEffect } from 'react';
import { 
  Building2, Award, Globe, Hammer, FileText, Briefcase, Users, 
  Plus, ChevronDown, CheckCircle, AlertTriangle, ExternalLink, 
  Trash2, Upload, Calendar, Search, MapPin
} from 'lucide-react';

const SupplierProfileManager = ({ 
  profiles = [], 
  activeProfile = null, 
  onSwitchProfile, 
  onCreateProfile, 
  onSaveProfile, 
  onUploadDocument,
  onDeleteProfile 
}) => {
  const [activeTab, setActiveTab] = useState('Identity');
  const [localProfile, setLocalProfile] = useState(activeProfile || {});
  const [isSaving, setIsSaving] = useState(false);

  // Auto-save simulation when localProfile changes
  useEffect(() => {
    if (localProfile.id) {
      setIsSaving(true);
      const timer = setTimeout(() => {
        onSaveProfile(localProfile);
        setIsSaving(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [localProfile]);

  const tabs = [
    { id: 'Identity', icon: Building2 },
    { id: 'B-BBEE', icon: Award },
    { id: 'CSD', icon: Globe },
    { id: 'Capabilities', icon: Hammer },
    { id: 'Documents', icon: FileText },
    { id: 'Projects', icon: Briefcase },
    { id: 'Team', icon: Users },
  ];

  const updateField = (field, value) => {
    setLocalProfile(prev => ({ ...prev, [field]: value }));
  };

  const isExpiringSoon = (dateString) => {
    if (!dateString) return false;
    const expiry = new Date(dateString);
    const today = new Date();
    const diff = (expiry - today) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  };

  const getPreferencePoints = (level) => {
    const points = { '1': 20, '2': 18, '3': 14, '4': 12, '5': 8, '6': 6, '7': 4, '8': 2, 'Exempt': 20 };
    return points[level] || 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* --- HEADER / PROFILE SWITCHER --- */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative group">
            <button className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-lg font-bold text-[#1a5c38]">
              {localProfile.legalName || "Select Profile"}
              <ChevronDown size={18} />
            </button>
            <div className="absolute hidden group-hover:block top-full left-0 w-64 bg-white shadow-xl border rounded-lg mt-1 overflow-hidden">
              {profiles.map(p => (
                <button 
                  key={p.id} 
                  onClick={() => onSwitchProfile(p.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0 text-sm"
                >
                  {p.legalName}
                </button>
              ))}
              <button 
                onClick={onCreateProfile}
                className="w-full text-left px-4 py-3 hover:bg-green-50 text-[#1a5c38] font-bold text-sm flex items-center gap-2"
              >
                <Plus size={16} /> New Profile
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
            <div className="flex items-center gap-1">
              {isSaving ? (
                <span className="flex items-center gap-1 animate-pulse"><Search size={12}/> Saving...</span>
              ) : (
                <span className="flex items-center gap-1 text-green-600"><CheckCircle size={12}/> All changes saved</span>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer border-l pl-4">
              <input type="checkbox" className="rounded text-[#1a5c38] focus:ring-[#1a5c38]" />
              Default Profile
            </label>
          </div>
        </div>

        {/* --- GLOBAL USAGE CHECKBOXES --- */}
        <div className="max-w-7xl mx-auto px-4 py-2 border-t flex flex-wrap gap-4 text-[11px] uppercase tracking-wider font-bold text-gray-400">
          <span>Use for:</span>
          {['Bid Drafter', 'Compliance Check', 'Win Probability'].map(label => (
            <label key={label} className="flex items-center gap-1 text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded text-[#1a5c38]" /> {label}
            </label>
          ))}
        </div>
      </div>

      {/* --- TABS --- */}
      <div className="bg-white border-b overflow-x-auto no-scrollbar sticky top-[97px] md:top-[65px] z-20">
        <div className="max-w-7xl mx-auto px-4 flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-colors whitespace-nowrap text-sm font-bold ${
                activeTab === tab.id 
                ? 'border-[#1a5c38] text-[#1a5c38]' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.id}
            </button>
          ))}
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* TAB 1: IDENTITY */}
        {activeTab === 'Identity' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-xl shadow-sm border">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Legal Entity Name</span>
                <input 
                  type="text" 
                  value={localProfile.legalName || ''}
                  onChange={(e) => updateField('legalName', e.target.value)}
                  className="mt-1 block w-full rounded-lg border-gray-200 focus:border-[#1a5c38] focus:ring-[#1a5c38]" 
                  placeholder="Pty Ltd Name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Trading Name (Optional)</span>
                <input type="text" className="mt-1 block w-full rounded-lg border-gray-200 focus:border-[#1a5c38] focus:ring-[#1a5c38]" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Company Registration Number</span>
                <input 
                  type="text" 
                  placeholder="2021/123456/07"
                  className="mt-1 block w-full rounded-lg border-gray-200 focus:border-[#1a5c38] focus:ring-[#1a5c38]" 
                />
              </label>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">VAT Number (Optional)</span>
                <input type="text" className="mt-1 block w-full rounded-lg border-gray-200 focus:border-[#1a5c38] focus:ring-[#1a5c38]" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Tax Clearance PIN</span>
                <input type="text" className="mt-1 block w-full rounded-lg border-gray-200 focus:border-[#1a5c38] focus:ring-[#1a5c38]" />
              </label>
              <div className="block">
                <span className="text-sm font-semibold text-gray-700">Tax Clearance Expiry</span>
                <input 
                  type="date" 
                  onChange={(e) => updateField('taxExpiry', e.target.value)}
                  className={`mt-1 block w-full rounded-lg border-gray-200 focus:ring-[#1a5c38] ${
                    isExpiringSoon(localProfile.taxExpiry) ? 'border-red-500 bg-red-50' : ''
                  }`} 
                />
                {isExpiringSoon(localProfile.taxExpiry) && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1 font-bold">
                    <AlertTriangle size={12}/> Tax clearance expiring soon or expired!
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: B-BBEE */}
        {activeTab === 'B-BBEE' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6 bg-white p-6 rounded-xl shadow-sm border">
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">B-BBEE Level</span>
                  <select 
                    onChange={(e) => updateField('beeLevel', e.target.value)}
                    className="mt-1 block w-full rounded-lg border-gray-200 focus:ring-[#1a5c38]"
                  >
                    {[1,2,3,4,5,6,7,8].map(l => <option key={l} value={l}>Level {l}</option>)}
                    <option value="Exempt">Exempt / EME</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Black Ownership %</span>
                  <input type="number" className="mt-1 block w-full rounded-lg border-gray-200" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Verification Agency</span>
                  <input type="text" className="mt-1 block w-full rounded-lg border-gray-200" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Certificate Expiry</span>
                  <input type="date" className="mt-1 block w-full rounded-lg border-gray-200" />
                </label>
              </div>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-[#1a5c38] transition-colors cursor-pointer group">
                <Upload className="mx-auto text-gray-400 group-hover:text-[#1a5c38] mb-2" />
                <p className="text-sm font-bold text-gray-600">Upload B-BBEE Certificate (PDF)</p>
              </div>
            </div>
            
            <div className="bg-[#1a5c38] text-white p-8 rounded-xl flex flex-col items-center justify-center text-center shadow-lg">
              <span className="text-xs uppercase tracking-[0.2em] font-bold opacity-80 mb-2">Preferential Procurement</span>
              <div className="text-6xl font-black mb-2">
                {getPreferencePoints(localProfile.beeLevel)}
              </div>
              <p className="text-sm font-medium">Points on the 80/20 preference point system</p>
              <div className="mt-6 py-2 px-4 bg-white/10 rounded-full text-xs font-bold border border-white/20">
                Level {localProfile.beeLevel || '-'} status
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: DOCUMENTS (Complex Table example) */}
        {activeTab === 'Documents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Compliance Documents</h3>
              <button className="bg-[#1a5c38] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <Plus size={16}/> Upload Document
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-4 font-bold text-gray-600">Type</th>
                    <th className="px-6 py-4 font-bold text-gray-600">File Name</th>
                    <th className="px-6 py-4 font-bold text-gray-600">Expiry</th>
                    <th className="px-6 py-4 font-bold text-gray-600">Status</th>
                    <th className="px-6 py-4 font-bold text-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { type: 'Tax Clearance', file: 'tax_cert_2026.pdf', date: '2026-05-13', status: 'valid' },
                    { type: 'B-BBEE', file: 'bee_level2.pdf', date: '2026-01-10', status: 'expiring' },
                    { type: 'CSD Report', file: 'csd_full.pdf', date: 'N/A', status: 'valid' },
                  ].map((doc, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-semibold text-gray-800">{doc.type}</td>
                      <td className="px-6 py-4 text-gray-500">{doc.file}</td>
                      <td className="px-6 py-4 text-gray-500">{doc.date}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${doc.status === 'valid' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                          <span className="capitalize text-xs font-bold">{doc.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button className="text-gray-400 hover:text-[#1a5c38]"><FileText size={18}/></button>
                          <button className="text-gray-400 hover:text-red-500"><Trash2 size={18}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- PLACEHOLDERS FOR OTHER TABS --- */}
        {(activeTab === 'CSD' || activeTab === 'Capabilities' || activeTab === 'Projects' || activeTab === 'Team') && (
          <div className="bg-white p-12 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
               {React.createElement(tabs.find(t => t.id === activeTab).icon, { size: 32 })}
            </div>
            <h3 className="font-bold text-gray-800 mb-1">{activeTab} Details</h3>
            <p className="text-sm text-gray-500 max-w-xs mb-6">Manage your {activeTab.toLowerCase()} information to improve your tender win probability.</p>
            <button className="bg-[#1a5c38] text-white px-6 py-2 rounded-lg font-bold text-sm">
              Add {activeTab === 'Team' ? 'Member' : activeTab === 'Projects' ? 'Project' : 'Details'}
            </button>
          </div>
        )}

      </main>
    </div>
  );
};

export default SupplierProfileManager;