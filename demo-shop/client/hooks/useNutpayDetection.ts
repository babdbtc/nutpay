import { useState, useEffect } from 'react';

export function useNutpayDetection() {
  const [isDetected, setIsDetected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if the extension's content script has modified the page
    // The extension runs at document_start, so by the time React renders,
    // any injected scripts should be present.
    const checkExtension = () => {
      // Method 1: Check for injected script element
      const injectedScript = document.querySelector('script[src*="inject.js"]');
      if (injectedScript) {
        setIsDetected(true);
        setIsChecking(false);
        return;
      }

      // Method 2: Check after a short delay (extension may still be loading)
      setTimeout(() => {
        const scriptCheck = document.querySelector('script[src*="inject.js"]');
        setIsDetected(!!scriptCheck);
        setIsChecking(false);
      }, 1000);
    };

    checkExtension();
  }, []);

  return { isDetected, isChecking };
}
