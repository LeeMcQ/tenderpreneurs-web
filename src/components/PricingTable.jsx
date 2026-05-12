import React, { useState } from 'react';
import { Check } from 'lucide-react';

export default function PricingTable({ onSelectPlan = () => {} }) {
  const [isAnnual, setIsAnnual] = useState(false);

  const billingType = isAnnual ? 'annual' : 'monthly';

  return (
    <div className="min-h-screen bg-gray-50 py-20 px-4 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Choose the plan that best fits your tender bidding needs. Upgrade or downgrade at any time.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
              Monthly
            </span>
            <button 
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-7 w-14 items-center rounded-full bg-[#1a5c38] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:ring-offset-2"
            >
              <span 
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-8' : 'translate-x-1'}`}
              />
            </button>
            <span className={`text-sm font-medium flex items-center gap-2 ${isAnnual ? 'text-gray-900' : 'text-gray-500'}`}>
              Annual
              <span className="bg-green-100 text-[#1a5c38] text-xs font-bold px-2 py-0.5 rounded-full">
                2 months free
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-center mt-8">
          
          {/* FREE PLAN */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Free</h3>
              <p className="text-gray-500 text-sm h-10">Essential tools to start exploring tenders.</p>
              <div className="mt-4 flex items-baseline text-5xl font-extrabold">
                R0
                <span className="ml-1 text-xl font-medium text-gray-500">/mo</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              {[
                'Browse tender listings',
                '3 AI analyses per month',
                '3 compliance checks per month',
                'Basic search',
                'No credit card required'
              ].map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <Check className="h-5 w-5 text-gray-400 shrink-0 mr-3" />
                  <span className="text-gray-600">{feature}</span>
                </li>
              ))}
            </ul>

            <button 
              onClick={() => onSelectPlan('free', billingType)}
              className="w-full py-3 px-4 rounded-lg font-bold text-[#1a5c38] bg-green-50 hover:bg-green-100 transition-colors"
            >
              Get Started Free
            </button>
          </div>

          {/* PROFESSIONAL PLAN (Highlighted) */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-[#1a5c38] p-8 relative flex flex-col transform md:-translate-y-4 h-full">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span className="bg-[#1a5c38] text-white text-sm font-bold tracking-wide uppercase px-4 py-1.5 rounded-full shadow-sm">
                Most Popular
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-bold text-[#1a5c38] mb-2">Professional</h3>
              <p className="text-gray-500 text-sm h-10">Advanced AI features and full pipeline tracking.</p>
              <div className="mt-4 flex flex-col">
                <div className="flex items-baseline text-5xl font-extrabold text-gray-900">
                  {isAnnual ? 'R2,690' : 'R299'}
                  <span className="ml-1 text-xl font-medium text-gray-500">
                    /{isAnnual ? 'yr' : 'mo'}
                  </span>
                </div>
                {isAnnual && (
                  <p className="text-sm text-green-600 font-medium mt-1">Billed annually (Save R898)</p>
                )}
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              {[
                <span key="1" className="font-semibold text-gray-900">Everything in Free</span>,
                'Full tender details + documents',
                'Unlimited AI win probability',
                'Unlimited compliance checks',
                '10 AI tender drafts per month',
                'Email alerts for new tenders',
                'Pipeline tracker'
              ].map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <Check className="h-5 w-5 text-[#1a5c38] shrink-0 mr-3" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <button 
                onClick={() => onSelectPlan('professional', billingType)}
                className="w-full py-3 px-4 rounded-lg font-bold text-white bg-[#1a5c38] hover:bg-[#124026] shadow-md transition-colors"
              >
                Start 7-Day Free Trial
              </button>
              <p className="text-xs text-center text-gray-500 mt-3 font-medium">
                No credit card for trial
              </p>
            </div>
          </div>

          {/* BUSINESS PLAN */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Business</h3>
              <p className="text-gray-500 text-sm h-10">For agencies and teams handling high volumes.</p>
              <div className="mt-4 flex flex-col">
                <div className="flex items-baseline text-5xl font-extrabold">
                  {isAnnual ? 'R9,990' : 'R999'}
                  <span className="ml-1 text-xl font-medium text-gray-500">
                    /{isAnnual ? 'yr' : 'mo'}
                  </span>
                </div>
                {isAnnual && (
                  <p className="text-sm text-gray-500 font-medium mt-1">Up to 10 users</p>
                )}
                {!isAnnual && (
                  <p className="text-sm text-gray-500 font-medium mt-1">Up to 10 users</p>
                )}
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              {[
                <span key="1" className="font-semibold text-gray-900">Everything in Professional</span>,
                'Unlimited AI tender drafts',
                'Team collaboration',
                'API access',
                'Dedicated support'
              ].map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <Check className="h-5 w-5 text-gray-400 shrink-0 mr-3" />
                  <span className="text-gray-600">{feature}</span>
                </li>
              ))}
            </ul>

            <button 
              onClick={() => onSelectPlan('business', billingType)}
              className="w-full py-3 px-4 rounded-lg font-bold text-gray-700 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Contact Sales
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}