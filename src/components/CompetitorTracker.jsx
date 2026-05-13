import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Users, Plus, X, BarChart3, TrendingUp, Briefcase, 
  Search, Bell, Info, Trophy, Filter, Target, ArrowRight 
} from 'lucide-react';

const CompetitorTracker = ({
  trackedCompetitors = [],
  selectedCompetitor = null,
  competitorStats = {
    totalWon: 0,
    awardCount: 0,
    avgValue: 0,
    frequency: "0 tenders/month",
    sectorData: [],
    entityData: [],
    recentWins: [],
    strategy: ""
  },
  leaderboard = [],
  onTrackCompetitor,
  onUntrack,
  onSelectCompetitor,
  onSearchCompetitor
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [newCompNotes, setNewCompNotes] = useState('');
  const [alertOnWin, setAlertOnWin] = useState(true);

  // Handle Search Autocomplete
  useEffect(() => {
    if (searchQuery.length > 2) {
      const results = onSearchCompetitor(searchQuery);
      setSuggestions(results || []);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  const formatCurrency = (val) => 
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-10 pb-20 bg-gray-50 min-h-screen">
      
      {/* SECTION 1: YOUR TRACKED COMPETITORS */}
      <section className="px-4 pt-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="text-[#1a5c38]" />
            <h2 className="text-xl font-bold text-gray-900">Your Tracked Competitors</h2>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-[#1a5c38] text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-[#14472b] transition-colors"
          >
            <Plus size={18} /> Add Competitor
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {trackedCompetitors.map((comp) => (
            <div 
              key={comp.id} 
              className={`relative bg-white border-2 p-5 rounded-xl transition-all ${selectedCompetitor?.id === comp.id ? 'border-blue-400 shadow-md ring-2 ring-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
            >
              <button 
                onClick={() => onUntrack(comp.id)}
                className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={16} />
              </button>
              
              <h3 className="font-bold text-gray-800 pr-6 truncate mb-1">{comp.name}</h3>
              <div className="space-y-1 mb-4">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold">Total Won (12m)</p>
                <p className="text-lg font-black text-blue-700 leading-none">{formatCurrency(comp.totalWon)}</p>
                <p className="text-xs text-gray-400">Last won: {comp.lastWonDate || 'N/A'}</p>
              </div>

              <button 
                onClick={() => onSelectCompetitor(comp.id)}
                className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  selectedCompetitor?.id === comp.id 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <BarChart3 size={14} /> View Intelligence
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: COMPETITOR INTELLIGENCE DASHBOARD */}
      {selectedCompetitor ? (
        <section className="px-4 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
            <div className="bg-blue-50/50 p-6 border-b border-blue-100">
              <div className="flex items-center gap-3 mb-1">
                <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Competitor Profile</span>
                <h2 className="text-2xl font-black text-gray-900">{selectedCompetitor.name}</h2>
              </div>
              <p className="text-sm text-gray-500">Deep-dive analysis into bidding patterns and historical success.</p>
            </div>

            <div className="p-6">
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "Total Won (12m)", value: formatCurrency(competitorStats.totalWon), icon: TrendingUp },
                  { label: "Awards", value: competitorStats.awardCount, icon: Trophy },
                  { label: "Avg. Value", value: formatCurrency(competitorStats.avgValue), icon: Briefcase },
                  { label: "Win Frequency", value: competitorStats.frequency, icon: Bell }
                ].map((stat, i) => (
                  <div key={i} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <stat.icon size={16} className="text-blue-600 mb-2" />
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{stat.label}</p>
                    <p className="text-lg font-black text-gray-800">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Charts */}
                <div className="space-y-4">
                  <h4 className="font-bold text-gray-700 flex items-center gap-2"><Filter size={16}/> Awards by Sector</h4>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={competitorStats.sectorData} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} style={{ fontSize: '11px', fontWeight: 'bold' }} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} />
                        <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-gray-700 flex items-center gap-2"><Target size={16}/> Top 5 Target Entities</h4>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={competitorStats.entityData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" style={{ fontSize: '10px' }} />
                        <YAxis hide />
                        <Tooltip cursor={{fill: '#f3f4f6'}} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                          {competitorStats.entityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#1e40af' : '#3b82f6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recent Wins Table */}
              <div className="mb-8">
                <h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Briefcase size={16}/> Recent Award Wins</h4>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 font-bold text-gray-600">Tender</th>
                        <th className="px-4 py-3 font-bold text-gray-600">Entity</th>
                        <th className="px-4 py-3 font-bold text-gray-600">Value</th>
                        <th className="px-4 py-3 font-bold text-gray-600">Date</th>
                        <th className="px-4 py-3 font-bold text-gray-600">Sector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {competitorStats.recentWins.map((win, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-blue-900 truncate max-w-[200px]">{win.title}</td>
                          <td className="px-4 py-3 text-gray-500">{win.entity}</td>
                          <td className="px-4 py-3 font-bold">{formatCurrency(win.value)}</td>
                          <td className="px-4 py-3 text-gray-400">{win.date}</td>
                          <td className="px-4 py-3"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{win.sector}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Strategy Box */}
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
                <h4 className="text-amber-800 font-black flex items-center gap-2 mb-2 uppercase tracking-wide">
                  <Target className="text-amber-600" size={20} /> Suggested Bid Strategy
                </h4>
                <div className="text-amber-900 text-sm leading-relaxed prose prose-amber">
                  {competitorStats.strategy || "Generating intelligence report..."}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
            <Info className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-800">No competitor selected</h3>
            <p className="text-sm text-gray-500">Select a competitor from your list above or add a new one to view intelligence.</p>
          </div>
        </div>
      )}

      {/* SECTION 3: INDUSTRY LEADERBOARD */}
      <section className="px-4 max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Trophy className="text-[#1a5c38]" /> Top Award Winners (Last 12 Months)
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Filter:</span>
              <select className="text-xs font-bold bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-[#1a5c38]/20">
                <option>All Sectors</option>
                <option>ICT & Telecoms</option>
                <option>Construction</option>
                <option>Professional Services</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] border-b">
                <tr>
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4 text-center">Awards</th>
                  <th className="px-6 py-4">Total Value</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-black text-gray-300 text-xl italic group-hover:text-[#1a5c38]/20 transition-colors">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-800">{item.company}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-gray-100 px-2 py-1 rounded-md text-xs font-black">{item.awards}</span>
                    </td>
                    <td className="px-6 py-4 font-black text-blue-700">{formatCurrency(item.totalValue)}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => onTrackCompetitor(item.company)}
                        className="bg-white border-2 border-[#1a5c38] text-[#1a5c38] px-3 py-1 rounded-lg text-xs font-bold hover:bg-[#1a5c38] hover:text-white transition-all flex items-center gap-1"
                      >
                        Track <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ADD COMPETITOR MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="font-black text-lg">Track New Competitor</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="relative">
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Company Name</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-[#1a5c38]"
                    placeholder="Search by name or registration..."
                  />
                </div>
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-xl border rounded-xl mt-1 z-10 overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button 
                        key={i} 
                        onClick={() => { setSearchQuery(s.name); setSuggestions([]); }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0 text-sm font-semibold"
                      >
                        {s.name} <span className="text-[10px] text-gray-400">{s.reg || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Notes (Internal)</label>
                <textarea 
                  rows={3}
                  value={newCompNotes}
                  onChange={(e) => setNewCompNotes(e.target.value)}
                  className="w-full p-4 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-[#1a5c38]"
                  placeholder="Why are you tracking them? (e.g. Direct rival in Western Cape)"
                />
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-bold text-gray-700">Alert me when they win a tender</span>
                <input 
                  type="checkbox" 
                  checked={alertOnWin} 
                  onChange={(e) => setAlertOnWin(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#1a5c38] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
              </label>

              <button 
                onClick={() => {
                  onTrackCompetitor(searchQuery, newCompNotes);
                  setShowAddModal(false);
                }}
                disabled={!searchQuery}
                className="w-full py-4 bg-[#1a5c38] text-white rounded-xl font-black disabled:opacity-50 shadow-lg shadow-green-100"
              >
                Start Tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompetitorTracker;