import { useState, useEffect } from 'react';

export function useNutpayDetection() {
  const [isDetected, setIsDetected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check for the global flag set by Nutpay's inject.ts
    if ((window as any).__nutpay_installed) {
      setIsDetected(true);
      setIsChecking(false);
      return;
    }

    // Retry once after 500ms — the extension content script runs at
    // document_start but there may be a small delay before inject.ts executes
    const timer = setTimeout(() => {
      setIsDetected(!!(window as any).__nutpay_installed);
      setIsChecking(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return { isDetected, isChecking };
}
