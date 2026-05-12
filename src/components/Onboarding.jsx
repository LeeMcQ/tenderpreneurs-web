import React, { useState, useEffect } from 'react';

const ROLES = [
  { id: 'writer', icon: '🖊️', label: 'Bid Writer' },
  { id: 'owner', icon: '🏢', label: 'Business Owner' },
  { id: 'procurement', icon: '🏛️', label: 'Procurement Officer' },
  { id: 'consultant', icon: '💼', label: 'Consultant' }
];

const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 
  'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
];

const SECTORS = [
  'Construction', 'ICT', 'Health', 'Education', 'Transport',
  'Agriculture', 'Energy', 'Security', 'Consulting', 'Cleaning',
  'Catering', 'Legal'
];

const BBBEE_LEVELS = [
  'Level 1 Contributor', 'Level 2 Contributor', 'Level 3 Contributor', 
  'Level 4 Contributor', 'Level 5 Contributor', 'Level 6 Contributor', 
  'Level 7 Contributor', 'Level 8 Contributor', 'Exempt Micro Enterprise (EME)',
  'Prefer not to say'
];

export default function Onboarding({ 
  currentStep = 1, 
  onStepComplete = () => {}, 
  onSkip = () => {}, 
  isLoading = false 
}) {
  const [step, setStep] = useState(currentStep);
  
  const [formData, setFormData] = useState({
    role: '',
    companyName: '',
    province: '',
    sectors: [],
    bbbeeLevel: '',
    regNumber: ''
  });

  // Sync internal step with prop if it changes externally
  useEffect(() => {
    if (currentStep) setStep(currentStep);
  }, [currentStep]);

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSector = (sector) => {
    setFormData(prev => {
      const isSelected = prev.sectors.includes(sector);
      if (isSelected) {
        return { ...prev, sectors: prev.sectors.filter(s => s !== sector) };
      } else if (prev.sectors.length < 5) {
        return { ...prev, sectors: [...prev.sectors, sector] };
      }
      return prev;
    });
  };

  const handleNext = () => {
    onStepComplete(step, formData);
    if (step < 4) setStep(step + 1);
  };

  const handleSkipStep3 = () => {
    onSkip();
    setStep(4);
  };

  const isStep1Valid = formData.role !== '';
  const isStep2Valid = formData.province !== '' && formData.sectors.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans text-gray-900">
      
      {/* Progress Bar (Hidden on Step 4 for cleaner finish) */}
      {step < 4 && (
        <div className="w-full max-w-xl mb-8">
          <div className="flex justify-between text-xs font-medium text-gray-500 mb-2 px-1">
            <span>Step {step} of 4</span>
            <span>{Math.round((step / 4) * 100)}% Complete</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full flex overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div 
                key={i} 
                className={`h-full flex-1 transition-colors duration-300 ${
                  i <= step ? 'bg-[#1a5c38]' : 'bg-transparent'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Card Container */}
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-6 sm:p-10 transition-all duration-300">
        
        {/* ================= STEP 1 ================= */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Tell us about yourself</h1>
            <p className="text-gray-500 mb-8">Let's customise your tender experience.</p>
            
            <h2 className="text-sm font-semibold text-gray-700 mb-4">What best describes your role?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {ROLES.map((role) => (
                <button
                  key={role.id}
                  onClick={() => updateForm('role', role.label)}
                  className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all text-left ${
                    formData.role === role.label 
                      ? 'border-[#1a5c38] bg-[#1a5c38]/5 ring-1 ring-[#1a5c38]' 
                      : 'border-gray-100 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className="text-3xl">{role.icon}</span>
                  <span className="font-semibold text-gray-800">{role.label}</span>
                </button>
              ))}
            </div>

            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Company name <span className="text-gray-400 font-normal">(Optional)</span></label>
              <input 
                type="text" 
                value={formData.companyName}
                onChange={(e) => updateForm('companyName', e.target.value)}
                placeholder="e.g. LNL Project Management"
                className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-[#1a5c38] transition-shadow"
              />
            </div>

            <button 
              onClick={handleNext}
              disabled={!isStep1Valid || isLoading}
              className="w-full bg-[#1a5c38] hover:bg-[#124026] text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ================= STEP 2 ================= */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Where do you operate?</h1>
            <p className="text-gray-500 mb-8">We'll filter tenders to match your reach and expertise.</p>

            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Which province is your main focus?</label>
              <select 
                value={formData.province}
                onChange={(e) => updateForm('province', e.target.value)}
                className="w-full p-4 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-[#1a5c38] appearance-none"
              >
                <option value="" disabled>Select a province...</option>
                {PROVINCES.map(prov => (
                  <option key={prov} value={prov}>{prov}</option>
                ))}
              </select>
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-end mb-4">
                <label className="block text-sm font-semibold text-gray-700">Which sectors do you target?</label>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${formData.sectors.length === 5 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                  {formData.sectors.length}/5 selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map(sector => {
                  const isSelected = formData.sectors.includes(sector);
                  return (
                    <button
                      key={sector}
                      onClick={() => toggleSector(sector)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                        isSelected 
                          ? 'bg-[#1a5c38] text-white border-[#1a5c38] shadow-sm' 
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a5c38] hover:text-[#1a5c38]'
                      }`}
                    >
                      {sector}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setStep(1)}
                className="w-1/3 py-4 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-colors"
              >
                Back
              </button>
              <button 
                onClick={handleNext}
                disabled={!isStep2Valid || isLoading}
                className="w-2/3 bg-[#1a5c38] hover:bg-[#124026] text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3 ================= */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Your company details <span className="text-gray-400 font-normal text-xl">(Optional)</span></h1>
            <p className="text-gray-500 mb-8">Helps us score your win probability and check compliance.</p>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">B-BBEE Level</label>
              <select 
                value={formData.bbbeeLevel}
                onChange={(e) => updateForm('bbbeeLevel', e.target.value)}
                className="w-full p-4 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-[#1a5c38] appearance-none"
              >
                <option value="" disabled>Select B-BBEE status...</option>
                {BBBEE_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Company registration number</label>
              <input 
                type="text" 
                value={formData.regNumber}
                onChange={(e) => updateForm('regNumber', e.target.value)}
                placeholder="e.g. 2021/123456/07"
                className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-[#1a5c38] transition-shadow"
              />
            </div>

            <button 
              onClick={handleNext}
              disabled={isLoading}
              className="w-full bg-[#1a5c38] hover:bg-[#124026] text-white font-bold py-4 rounded-xl transition-colors mb-4"
            >
              Finish Setup
            </button>
            
            <div className="text-center">
              <button onClick={handleSkipStep3} className="text-gray-500 hover:text-gray-800 text-sm font-medium underline">
                Skip this step
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 4 ================= */}
        {step === 4 && (
          <div className="animate-in zoom-in-95 fade-in duration-500 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Your account is set up</h1>
            <p className="text-gray-500 mb-8">We've tailored everything to match your business.</p>

            <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left border border-gray-100">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Role</p>
                  <p className="font-medium text-gray-900">{formData.role || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Region</p>
                  <p className="font-medium text-gray-900">{formData.province || 'All provinces'}</p>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Sectors</p>
                <div className="flex flex-wrap gap-1.5">
                  {formData.sectors.length > 0 ? formData.sectors.map(s => (
                    <span key={s} className="bg-white border border-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-md">
                      {s}
                    </span>
                  )) : (
                    <span className="text-sm text-gray-500">No sectors selected</span>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3 text-[#1a5c38]">
                <div className="w-2 h-2 rounded-full bg-[#1a5c38] animate-pulse"></div>
                <p className="text-sm font-semibold">We've created your first tender alert</p>
              </div>
            </div>

            <button 
              onClick={() => onStepComplete(4, formData)}
              className="w-full bg-[#1a5c38] hover:bg-[#124026] text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-[#1a5c38]/20"
            >
              Go to my dashboard →
            </button>
            <p className="text-sm text-gray-500 mt-4">
              Your first matching tenders are waiting
            </p>
          </div>
        )}

      </div>
    </div>
  );
}