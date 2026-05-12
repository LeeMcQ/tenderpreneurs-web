import { useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Custom hook for handling PayFast checkout flow.
 * Provides an `initiateCheckout` function, loading state, and error state.
 * 
 * Usage:
 *   const { initiateCheckout, isLoading, error } = useCheckout();
 *   <button onClick={() => initiateCheckout(planId, 'monthly')}>
 */
export function useCheckout() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const initiateCheckout = async (plan_id, billing) => {
    // 1. Ensure user is authenticated
    const token = localStorage.getItem('token'); // adjust key if needed
    if (!token) {
      window.location.href = '/login?next=/pricing';
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 2. Create checkout session
      const response = await fetch('/api/v1/payments/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_id, billing }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Request failed with status ${response.status}`);
      }

      const { action_url, form_data } = await response.json();

      // 3. Build and submit hidden form to redirect to PayFast
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action_url;
      form.style.display = 'none';

      for (const [key, value] of Object.entries(form_data)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      // No need to reset loading – the page will navigate away
    } catch (err) {
      const message = err.message || 'Something went wrong. Please try again.';
      setError(message);
      toast.error(message);
      setIsLoading(false);
    }
  };

  return { initiateCheckout, isLoading, error };
}