import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the user previously dismissed the prompt
    const hasDismissed = localStorage.getItem('pwa_prompt_dismissed') === 'true';
    
    // Simple mobile device check
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    const handleBeforeInstallPrompt = (e) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      
      // Update UI to notify the user they can add to home screen
      if (isMobile && !hasDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferredPrompt variable, it can only be used once
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa_prompt_dismissed', 'true');
    setIsVisible(false);
  };

  return (
    <div 
      className={`fixed bottom-0 left-0 w-full z-50 transition-transform duration-500 ease-in-out md:hidden ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="bg-white rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-gray-100 p-4 m-2 mb-0 sm:m-4 sm:mb-0">
        <button 
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4">
          <div className="bg-[#1a5c38] text-white p-3 rounded-xl shrink-0 shadow-sm">
            <Download size={24} />
          </div>
          
          <div className="flex-1 pr-4">
            <h3 className="font-bold text-gray-900 text-sm mb-1">
              Add to Home Screen
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Install Tenderpreneur for faster access and offline tender alerts.
            </p>
            
            <div className="flex gap-2">
              <button 
                onClick={handleInstall}
                className="flex-1 bg-[#1a5c38] text-white text-sm font-bold py-2.5 px-4 rounded-lg hover:bg-[#124026] transition-colors shadow-sm"
              >
                Install App
              </button>
              <button 
                onClick={handleDismiss}
                className="flex-1 bg-gray-50 text-gray-700 text-sm font-bold py-2.5 px-4 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}