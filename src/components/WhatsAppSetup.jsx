import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, 
  CheckCircle2, 
  ArrowLeft, 
  Settings2, 
  Send, 
  RefreshCw, 
  BellRing,
  AlertCircle 
} from 'lucide-react';

const WhatsAppSetup = ({ 
  userPhone = null, 
  isVerified = false, 
  onSendCode, 
  onVerifyCode, 
  onUpdatePreferences, 
  onSendTest 
}) => {
  // Internal UI State
  const [step, setStep] = useState(isVerified ? 'verified' : 'setup');
  const [phone, setPhone] = useState(userPhone?.replace('+27', '') || '');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isAwaiting, setIsAwaiting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  // Preference States
  const [prefs, setPrefs] = useState({
    dailyDigest: true,
    instantAlerts: true,
    paused: false,
    channel: 'both'
  });

  const otpRefs = useRef([]);

  // Handle cooldown timer
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // Validation: 9 digits after +27
  const isPhoneValid = phone.length === 9 && /^\d+$/.test(phone);

  const handleSendCode = () => {
    if (isPhoneValid) {
      onSendCode(`+27${phone}`);
      setIsAwaiting(true);
      setStep('verify');
      setCooldown(30);
    }
  };

  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      otpRefs.current[index + 1].focus();
    }

    if (newOtp.every(v => v !== '')) {
      onVerifyCode(newOtp.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1].focus();
    }
  };

  const updatePref = (key, value) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    onUpdatePreferences?.(newPrefs);
  };

  // --- RENDER STATES ---

  // STATE 1: NOT SET UP
  if (step === 'setup' && !isVerified) {
    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#25D366] rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-100">
            <MessageCircle className="text-white w-10 h-10" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2">Get tender alerts on WhatsApp</h2>
          <p className="text-gray-500 text-sm mb-8">
            Instant notifications for tenders matching your criteria.
          </p>

          <div className="w-full space-y-6">
            {/* Phone Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-gray-500 font-medium border-r pr-3 border-gray-200">🇿🇦 +27</span>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                className="block w-full pl-24 pr-4 py-4 border-2 border-gray-100 rounded-xl focus:border-[#1a5c38] focus:ring-0 transition-colors text-lg tracking-wider"
                placeholder="82 123 4567"
              />
            </div>

            {/* Toggles */}
            <div className="space-y-4 text-left">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-gray-700">Send daily digest at 7am</span>
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={prefs.dailyDigest}
                  onChange={(e) => updatePref('dailyDigest', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a5c38] relative"></div>
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-gray-700">Send instant alerts</span>
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={prefs.instantAlerts}
                  onChange={(e) => updatePref('instantAlerts', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a5c38] relative"></div>
              </label>
            </div>

            <button
              onClick={handleSendCode}
              disabled={!isPhoneValid}
              className={`w-full py-4 rounded-xl font-bold text-white transition-all transform active:scale-[0.98] ${
                isPhoneValid ? 'bg-[#1a5c38] hover:bg-[#14472b] shadow-md' : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              Send Verification Code
            </button>

            <p className="text-[11px] text-gray-400 leading-tight">
              Professional plan and above. Standard WhatsApp rates apply (R0.50/message paid by us).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: AWAITING VERIFICATION
  if (step === 'verify') {
    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your WhatsApp</h2>
        <p className="text-gray-500 text-sm mb-8">
          We've sent a 6-digit code to <span className="font-semibold">+27 {phone}</span>
        </p>

        <div className="flex justify-between gap-2 mb-8">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={el => otpRefs.current[index] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-14 border-2 border-gray-100 rounded-lg text-center text-xl font-bold focus:border-[#1a5c38] focus:ring-0"
            />
          ))}
        </div>

        <div className="space-y-4">
          <button 
            disabled={cooldown > 0}
            onClick={() => {
              onSendCode(`+27${phone}`);
              setCooldown(30);
            }}
            className="flex items-center justify-center w-full text-sm font-medium text-[#1a5c38] hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            {cooldown > 0 ? (
              `Resend code in ${cooldown}s`
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> Didn't receive? Resend code</>
            )}
          </button>

          <button 
            onClick={() => setStep('setup')}
            className="flex items-center justify-center w-full text-xs text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="w-3 h-3 mr-1" /> Wrong number? Start over
          </button>
        </div>
      </div>
    );
  }

  // STATE 3: VERIFIED
  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-[#1a5c38]/5 p-6 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-full shadow-sm">
              <CheckCircle2 className="text-[#1a5c38] w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 leading-none">WhatsApp alerts active</h3>
              <p className="text-sm text-gray-500 mt-1 flex items-center">
                +27 {phone} 
                <button onClick={() => setStep('setup')} className="ml-2 text-xs text-[#1a5c38] font-medium hover:underline">Edit</button>
              </p>
            </div>
          </div>
          <div className="h-2 w-2 rounded-full bg-[#25D366] animate-pulse"></div>
        </div>

        <button 
          onClick={onSendTest}
          className="w-full py-2 bg-white border border-[#1a5c38]/20 rounded-lg text-sm font-semibold text-[#1a5c38] hover:bg-[#1a5c38] hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> Send me a test alert
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-700">
              <BellRing className="w-4 h-4" />
              <span className="text-sm font-medium">Pause alerts</span>
            </div>
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={prefs.paused}
              onChange={(e) => updatePref('paused', e.target.checked)}
            />
            <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 relative"></div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Channel Preference
            </label>
            <select 
              value={prefs.channel}
              onChange={(e) => updatePref('channel', e.target.value)}
              className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1a5c38]/20"
            >
              <option value="email">Email only</option>
              <option value="whatsapp">WhatsApp only</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-50 flex items-start gap-2 text-gray-400">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Reply <span className="font-bold text-gray-600">STOP</span> on WhatsApp to pause anytime. You can also re-enable by replying START.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppSetup;