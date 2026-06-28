import React from 'react';
import { Home, Search, Bell, ClipboardList, User } from 'lucide-react';

export default function MobileBottomNav({ 
  currentPath = '/dashboard', 
  alertCount = 0 
}) {
  const tabs = [
    { id: 'home', path: '/dashboard', icon: Home, label: 'Home', exact: true },
    { id: 'tenders', path: '/tenders', icon: Search, label: 'Tenders', exact: false },
    { id: 'alerts', path: '/dashboard/alerts', icon: Bell, label: 'Alerts', exact: false, badge: alertCount },
    { id: 'pipeline', path: '/dashboard/pipeline', icon: ClipboardList, label: 'Pipeline', exact: false },
    { id: 'profile', path: '/dashboard/profile', icon: User, label: 'Profile', exact: false },
  ];

  // Helper to determine if a tab is currently active
  const isActive = (tab) => {
    if (tab.exact) {
      return currentPath === tab.path;
    }
    return currentPath.startsWith(tab.path);
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-[0_-4px_15px_rgba(0,0,0,0.03)] z-40 md:hidden pb-safe"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
    >
      <div className="flex justify-around items-center pt-2 px-2">
        {tabs.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;

          return (
            <a
              key={tab.id}
              href={tab.path}
              className="relative flex flex-col items-center justify-center w-full min-w-[64px] group"
            >
              {/* Top Active Indicator */}
              {active && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#F5A623] rounded-b-full" />
              )}

              <div className="relative p-1">
                <Icon 
                  size={24} 
                  strokeWidth={active ? 2.5 : 2}
                  className={`transition-colors duration-200 ${
                    active ? 'text-[#F5A623]' : 'text-gray-400 group-hover:text-gray-600'
                  }`} 
                />
                
                {/* Notification Badge */}
                {tab.badge > 0 && (
                  <span className="absolute top-0 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </div>

              <span 
                className={`text-[10px] mt-1 font-medium transition-colors duration-200 ${
                  active ? 'text-[#F5A623]' : 'text-gray-500 group-hover:text-gray-700'
                }`}
              >
                {tab.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}