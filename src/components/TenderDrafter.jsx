import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  X, 
  Wand2, 
  Copy, 
  Download, 
  Save, 
  Edit2, 
  Check,
  Building,
  Briefcase,
  Users,
  FileText
} from 'lucide-react';

const BBEE_LEVELS = [
  'Level 1 Contributor', 'Level 2 Contributor', 'Level 3 Contributor', 
  'Level 4 Contributor', 'Level 5 Contributor', 'Level 6 Contributor', 
  'Level 7 Contributor', 'Level 8 Contributor', 'Exempt Micro Enterprise (EME)',
  'Qualifying Small Enterprise (QSE)'
];

const EXPECTED_SECTIONS = [
  'Executive Summary',
  'Company Profile',
  'Relevant Experience',
  'Proposed Methodology',
  'Team CVs',
  'Pricing Schedule',
  'B-BBEE Declaration'
];

export default function TenderDrafter({
  tender = { title: "New Tender Submission", entity: "Public Sector", requirements: [] },
  onGenerate = () => {},
  streamedContent = "",
  isGenerating = false,
  onImproveSection = () => {},
  onDownload = () => {},
  onSave = () => {}
}) {
  // Form State
  const [formData, setFormData] = useState({
    companyName: '',
    regNumber: '',
    bbbeeLevel: 'Level 1 Contributor',
    yearsInBusiness: '',
    approachNotes: ''
  });

  // Array States
  const [projects, setProjects] = useState([]);
  const [team, setTeam] = useState([]);

  // Modal States
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [tempProject, setTempProject] = useState({ name: '', value: '', client: '', year: '' });
  const [tempTeam, setTempTeam] = useState({ name: '', role: '', qualification: '' });

  // Right Panel UI States
  const [improvingSection, setImprovingSection] = useState(null);
  const [improvePrompt, setImprovePrompt] = useState('');
  const [copied, setCopied] = useState(false);

  // Handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addProject = () => {
    if (tempProject.name && tempProject.client) {
      setProjects([...projects, { ...tempProject, id: Date.now() }]);
      setTempProject({ name: '', value: '', client: '', year: '' });
      setShowProjectModal(false);
    }
  };

  const addTeamMember = () => {
    if (tempTeam.name && tempTeam.role) {
      setTeam([...team, { ...tempTeam, id: Date.now() }]);
      setTempTeam({ name: '', role: '', qualification: '' });
      setShowTeamModal(false);
    }
  };

  const removeProject = (id) => setProjects(projects.filter(p => p.id !== id));
  const removeTeamMember = (id) => setTeam(team.filter(t => t.id !== id));

  const handleGenerate = () => {
    onGenerate({ ...formData, projects, team });
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(streamedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitImprovement = (section) => {
    if (improvePrompt.trim()) {
      onImproveSection(section, improvePrompt);
      setImprovingSection(null);
      setImprovePrompt('');
    }
  };

  // Utilities
  const wordCount = useMemo(() => {
    return streamedContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  }, [streamedContent]);

  // Basic markdown parser to split streamed content into sections
  const parsedSections = useMemo(() => {
    if (!streamedContent) return [];
    
    // Split by markdown headers (## Section Name)
    const rawChunks = streamedContent.split(/(?=^##\s)/m);
    
    return rawChunks.map((chunk, index) => {
      const match = chunk.match(/^##\s+(.*)\n?/);
      if (match) {
        return {
          id: index,
          title: match[1].trim(),
          content: chunk.replace(/^##.*\n?/, ''),
          isHeader: true
        };
      }
      return { id: index, title: 'Introduction', content: chunk, isHeader: false };
    });
  }, [streamedContent]);

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800 overflow-hidden">
      
      {/* ================= LEFT PANEL (INPUT FORM) ================= */}
      <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white shadow-sm z-10">
        <div className="p-6 border-b border-gray-100 bg-[#1a5c38] text-white">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wand2 size={20} /> AI Bid Document Drafter
          </h1>
          <p className="text-sm text-white/80 mt-1">Drafting for: {tender.title}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
          
          {/* Step 1: Company Details */}
          <section>
            <h2 className="text-lg font-bold text-[#1a5c38] flex items-center gap-2 mb-4 border-b pb-2">
              <Building size={18} /> Step 1: Your Company Details
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 focus:ring-[#1a5c38] focus:border-[#1a5c38]" placeholder="e.g. LNL Project Management" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                <input type="text" name="regNumber" value={formData.regNumber} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 focus:ring-[#1a5c38] focus:border-[#1a5c38]" placeholder="2021/123456/07" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">B-BBEE Level</label>
                <select name="bbbeeLevel" value={formData.bbbeeLevel} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 focus:ring-[#1a5c38] focus:border-[#1a5c38]">
                  {BBEE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years in Business</label>
                <input type="number" name="yearsInBusiness" value={formData.yearsInBusiness} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 focus:ring-[#1a5c38] focus:border-[#1a5c38]" placeholder="e.g. 5" />
              </div>
            </div>
          </section>

          {/* Step 2: Relevant Experience */}
          <section>
            <div className="flex items-center justify-between border-b pb-2 mb-4">
              <h2 className="text-lg font-bold text-[#1a5c38] flex items-center gap-2">
                <Briefcase size={18} /> Step 2: Relevant Experience
              </h2>
              <button onClick={() => setShowProjectModal(true)} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded flex items-center gap-1 transition">
                <Plus size={14} /> Add Project
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {projects.length === 0 && <p className="text-sm text-gray-400 italic">No projects added yet.</p>}
              {projects.map(proj => (
                <div key={proj.id} className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded-lg flex items-center gap-2 group">
                  <div>
                    <span className="font-semibold">{proj.name}</span> <span className="text-xs text-green-600">({proj.year})</span>
                  </div>
                  <button onClick={() => removeProject(proj.id)} className="text-green-600 hover:text-red-500 opacity-50 group-hover:opacity-100 transition"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Step 3: Your Team */}
          <section>
            <div className="flex items-center justify-between border-b pb-2 mb-4">
              <h2 className="text-lg font-bold text-[#1a5c38] flex items-center gap-2">
                <Users size={18} /> Step 3: Your Team
              </h2>
              <button onClick={() => setShowTeamModal(true)} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded flex items-center gap-1 transition">
                <Plus size={14} /> Add Member
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {team.length === 0 && <p className="text-sm text-gray-400 italic">No team members added yet.</p>}
              {team.map(member => (
                <div key={member.id} className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-3 py-2 rounded-lg flex items-center gap-2 group">
                  <div>
                    <span className="font-semibold">{member.name}</span> - <span className="text-xs">{member.role}</span>
                  </div>
                  <button onClick={() => removeTeamMember(member.id)} className="text-blue-600 hover:text-red-500 opacity-50 group-hover:opacity-100 transition"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Step 4: Your Approach */}
          <section>
            <h2 className="text-lg font-bold text-[#1a5c38] flex items-center gap-2 mb-4 border-b pb-2">
              <FileText size={18} /> Step 4: Your Approach (Optional)
            </h2>
            <p className="text-sm text-gray-500 mb-2">Paste your rough notes or approach here — AI will structure and expand them.</p>
            <textarea 
              name="approachNotes" 
              value={formData.approachNotes} 
              onChange={handleInputChange} 
              rows="5"
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-[#1a5c38] focus:border-[#1a5c38] resize-none" 
              placeholder="e.g. We plan to use agile methodology, focusing on community upskilling during the project execution..."
            ></textarea>
          </section>

        </div>

        {/* Generate Button Fixed Bottom */}
        <div className="p-6 bg-white border-t border-gray-100 absolute bottom-0 w-1/2 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-[#1a5c38] hover:bg-[#124026] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <><span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> Generating Document...</>
            ) : (
              <><Wand2 size={20} /> Generate Bid Document</>
            )}
          </button>
        </div>
      </div>

      {/* ================= RIGHT PANEL (LIVE OUTPUT) ================= */}
      <div className="w-1/2 flex flex-col bg-gray-50">
        {/* Output Header */}
        <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
          <h2 className="font-bold text-gray-800">Generated Draft</h2>
          <div className="flex gap-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">{wordCount} words</span>
          </div>
        </div>

        {/* Streaming Content Area */}
        <div className="flex-1 overflow-y-auto p-8 relative scroll-smooth">
          {!streamedContent && !isGenerating && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <FileText size={48} className="mb-4 opacity-20" />
              <p>Fill out the form and generate your bid document.</p>
            </div>
          )}

          <div className="prose prose-sm max-w-none prose-headings:text-[#1a5c38] prose-a:text-[#1a5c38]">
            {parsedSections.map((section) => (
              <div key={section.id} className="relative group mb-8 rounded-lg transition-colors hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-gray-200 p-4 -mx-4">
                
                {section.isHeader && (
                  <h2 className="mt-0 pt-0 border-b border-gray-100 pb-2">{section.title}</h2>
                )}
                
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {section.content}
                </div>

                {/* Improve Section Feature */}
                {(section.title || section.isHeader) && (
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setImprovingSection(section.id)}
                      className="bg-white border border-[#1a5c38] text-[#1a5c38] p-1.5 rounded-md hover:bg-[#1a5c38] hover:text-white shadow-sm flex items-center gap-1 text-xs font-medium"
                    >
                      <Edit2 size={12} /> Improve
                    </button>
                  </div>
                )}

                {/* Inline Improve Prompt Input */}
                {improvingSection === section.id && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2">
                    <input 
                      type="text" 
                      autoFocus
                      value={improvePrompt}
                      onChange={(e) => setImprovePrompt(e.target.value)}
                      placeholder="e.g. Make this sound more professional, add more detail about safety..."
                      className="flex-1 text-sm border-gray-300 rounded p-2 focus:ring-[#1a5c38] focus:border-[#1a5c38]"
                      onKeyDown={(e) => e.key === 'Enter' && submitImprovement(section.title)}
                    />
                    <button onClick={() => submitImprovement(section.title)} className="bg-[#1a5c38] text-white px-3 py-1.5 rounded text-sm hover:bg-[#124026]">
                      Update
                    </button>
                    <button onClick={() => setImprovingSection(null)} className="text-gray-500 hover:text-gray-700 px-2">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            
            {/* Blinking Cursor for generation state */}
            {isGenerating && (
              <span className="inline-block w-2 h-4 bg-[#1a5c38] animate-pulse ml-1 align-middle"></span>
            )}
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex gap-2">
            <button onClick={onSave} className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition">
              <Save size={16} /> Save Draft
            </button>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handleCopyAll} 
              className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition"
            >
              {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />} 
              {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button 
              onClick={onDownload}
              className="flex items-center gap-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg transition shadow-sm"
            >
              <Download size={16} /> Download as Word
            </button>
          </div>
        </div>
      </div>

      {/* ================= MODALS ================= */}
      
      {/* Add Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Relevant Project</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                <input type="text" value={tempProject.name} onChange={e => setTempProject({...tempProject, name: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. Server Migration 2024" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                <input type="text" value={tempProject.client} onChange={e => setTempProject({...tempProject, client: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. Dept of Health" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value (R)</label>
                  <input type="text" value={tempProject.value} onChange={e => setTempProject({...tempProject, value: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. R 1,500,000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year Completed</label>
                  <input type="text" value={tempProject.year} onChange={e => setTempProject({...tempProject, year: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. 2024" />
                </div>
              </div>
              <button onClick={addProject} className="w-full mt-2 bg-[#1a5c38] text-white py-2 rounded font-medium hover:bg-[#124026]">Add Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Member Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Team Member</h3>
              <button onClick={() => setShowTeamModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={tempTeam.name} onChange={e => setTempTeam({...tempTeam, name: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. Jane Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposed Role</label>
                <input type="text" value={tempTeam.role} onChange={e => setTempTeam({...tempTeam, role: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. Lead Engineer" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Highest Qualification</label>
                <input type="text" value={tempTeam.qualification} onChange={e => setTempTeam({...tempTeam, qualification: e.target.value})} className="w-full border rounded p-2 focus:ring-[#1a5c38]" placeholder="e.g. BSc Computer Science" />
              </div>
              <button onClick={addTeamMember} className="w-full mt-2 bg-[#1a5c38] text-white py-2 rounded font-medium hover:bg-[#124026]">Add Member</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}