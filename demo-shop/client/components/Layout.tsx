import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={{
      maxWidth: '1120px',
      margin: '0 auto',
      padding: '0 var(--space-6)',
      minHeight: '100vh',
    }}>
      {children}
    </div>
  );
}
