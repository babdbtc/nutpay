import React from 'react';
import Navigation from './Navigation';
import ExtensionBanner from './ExtensionBanner';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <ExtensionBanner />
      <div style={{
        maxWidth: '1120px',
        margin: '0 auto',
        padding: '0 var(--space-6)',
        minHeight: '100vh',
      }}>
        <Navigation />
        {children}
      </div>
    </>
  );
}
