import React, { useState } from 'react';
import { 
  Briefcase, 
  DollarSign, 
  FileText, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  Plus, 
  X 
} from 'lucide-react';

const KANBAN_STAGES = [
  'Identified', 
  'Docs Requested', 
  'Preparing', 
  'Submitted', 
  'Evaluation', 
  'Awarded', 
  'Lost'
];

export default function Dashboard({
  pipelineData = {},
  alertMatches = [],
  stats = { active: 0, totalValue: 0, submissions: 0, winRate: 0 },
  onStageChange = () => {},
  onAddToPipeline = () => {}
}) {
  const [selectedCard, setSelectedCard] = useState(null);

  // Format currency in ZAR
  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans text-gray-800">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* ================= PART 1: OVERVIEW ================= */}
        <section>
          <h1 className="text-3xl font-bold text-[#1a5c38] mb-6">Tender Dashboard</h1>
          
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between border-l-4 border-l-blue-500">
              <div>
                <p className="text-sm text-gray-500 font-medium">Active Tenders</p>
                <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg text-blue-500"><Briefcase size={24} /></div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between border-l-4 border-l-green-500">
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Pipeline Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatZAR(stats.totalValue)}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg text-green-600"><DollarSign size={24} /></div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between border-l-4 border-l-orange-500">
              <div>
                <p className="text-sm text-gray-500 font-medium">Submissions This Month</p>
                <p className="text-2xl font-bold text-gray-900">{stats.submissions}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg text-orange-500"><FileText size={24} /></div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between border-l-4 border-l-purple-500">
              <div>
                <p className="text-sm text-gray-500 font-medium">Win Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats.winRate}%</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg text-purple-500"><TrendingUp size={24} /></div>
            </div>
          </div>

          {/* Two Columns: Alerts & Expiring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Alerts */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-[#1a5c38]">Recent Alert Matches</h2>
                <span className="text-sm text-gray-500">{alertMatches.length} matches</span>
              </div>
              <div className="space-y-4">
                {alertMatches.slice(0, 5).map((tender) => (
                  <div key={tender.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="mb-3 sm:mb-0">
                      <h3 className="font-semibold text-gray-900 line-clamp-1">{tender.title}</h3>
                      <div className="text-sm text-gray-500 flex flex-wrap gap-x-4 mt-1">
                        <span>{tender.entity}</span>
                        <span className="font-medium text-green-700">{formatZAR(tender.value)}</span>
                        <span>Closes: {new Date(tender.closingDate).toLocaleDateString('en-ZA')}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => onAddToPipeline(tender.id)}
                      className="shrink-0 flex items-center gap-1 bg-white border border-[#1a5c38] text-[#1a5c38] px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#1a5c38] hover:text-white transition"
                    >
                      <Plus size={16} /> Add to Pipeline
                    </button>
                  </div>
                ))}
                {alertMatches.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No new alerts matching your profile.</p>
                )}
              </div>
            </div>

            {/* Right Column: Expiring Soon */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-[#1a5c38] mb-4">Expiring Soon (Next 7 Days)</h2>
              <div className="space-y-4">
                {/* Mocked expiring list - in reality, filter pipelineData for dates < 7 days */}
                {[
                  { id: 'exp1', days: 2, title: 'Department of Health IT Supply', value: 4500000 },
                  { id: 'exp2', days: 5, title: 'Gauteng Roads Maintenance', value: 12000000 },
                ].map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between p-4 border-l-4 border-red-500 bg-red-50 rounded-r-lg">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
                          <Clock size={12} /> {exp.days} days left
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900">{exp.title}</h3>
                    </div>
                    <span className="font-bold text-gray-700">{formatZAR(exp.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ================= PART 2: PIPELINE TRACKER ================= */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-[#1a5c38] mb-6">Pipeline Tracker</h2>
          
          <div className="flex overflow-x-auto pb-6 gap-6 snap-x">
            {KANBAN_STAGES.map((stage) => {
              const stageCards = pipelineData[stage] || [];
              
              return (
                <div key={stage} className="min-w-[300px] w-[300px] flex-shrink-0 snap-center">
                  {/* Column Header */}
                  <div className="flex items-center justify-between bg-gray-200 px-4 py-3 rounded-t-lg border-b-2 border-[#1a5c38]">
                    <h3 className="font-semibold text-gray-800">{stage}</h3>
                    <span className="bg-gray-300 text-gray-700 text-xs font-bold px-2 py-1 rounded-full">
                      {stageCards.length}
                    </span>
                  </div>
                  
                  {/* Column Body */}
                  <div className="bg-gray-100/50 p-3 rounded-b-lg min-h-[400px] space-y-3 flex flex-col">
                    {stageCards.map((card) => (
                      <div 
                        key={card.id}
                        onClick={() => setSelectedCard({ ...card, currentStage: stage })}
                        className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:shadow-md hover:border-[#1a5c38] transition group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${getPriorityColor(card.priority)}`} />
                          <h4 className="font-medium text-gray-900 text-sm ml-2 flex-1 line-clamp-2 group-hover:text-[#1a5c38]">
                            {card.title}
                          </h4>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="font-semibold text-green-700">{formatZAR(card.value)}</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                          <Calendar size={12} /> {new Date(card.submissionDate).toLocaleDateString('en-ZA')}
                        </div>
                      </div>
                    ))}
                    {stageCards.length === 0 && (
                      <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Drop tenders here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ================= MODAL: CARD DETAILS ================= */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-[#1a5c38] text-white">
              <h2 className="text-lg font-bold truncate pr-4">{selectedCard.title}</h2>
              <button onClick={() => setSelectedCard(null)} className="text-white/80 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Estimated Value</p>
                  <p className="font-bold text-lg text-green-700">{formatZAR(selectedCard.value)}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Submission Deadline</p>
                  <p className="font-bold text-lg text-gray-900">
                    {new Date(selectedCard.submissionDate).toLocaleDateString('en-ZA')}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Current Stage</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-[#1a5c38] focus:border-[#1a5c38] outline-none"
                  defaultValue={selectedCard.currentStage}
                  onChange={(e) => selectedCard.newStage = e.target.value}
                >
                  {KANBAN_STAGES.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700">Win Probability Score</label>
                  <span className="text-sm font-bold text-[#1a5c38]">{selectedCard.probability || 0}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" 
                  defaultValue={selectedCard.probability || 0}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1a5c38]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tender Notes / Next Steps</label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg p-3 h-32 focus:ring-2 focus:ring-[#1a5c38] focus:border-[#1a5c38] outline-none resize-none"
                  placeholder="Add your preparation notes, required documents, or entity contacts here..."
                  defaultValue={selectedCard.notes || ''}
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedCard(null)}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (selectedCard.newStage && selectedCard.newStage !== selectedCard.currentStage) {
                    onStageChange(selectedCard.id, selectedCard.newStage);
                  }
                  setSelectedCard(null);
                }}
                className="px-6 py-2 bg-[#1a5c38] text-white font-medium rounded-lg hover:bg-[#124026] shadow-sm transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}