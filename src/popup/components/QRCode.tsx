import React, { useEffect, useRef, useState } from 'react';
import QRCodeLib from 'qrcode';

interface QRCodeProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  canvas: {
    borderRadius: '8px',
    background: '#fff',
    padding: '8px',
  },
  error: {
    color: '#ef4444',
    fontSize: '12px',
    textAlign: 'center',
  },
};

export function QRCode({
  value,
  size = 200,
  bgColor = '#ffffff',
  fgColor = '#000000',
  errorCorrectionLevel = 'M',
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCodeLib.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 2,
        color: {
          dark: fgColor,
          light: bgColor,
        },
        errorCorrectionLevel,
      },
      (err) => {
        if (err) {
          setError('Failed to generate QR code');
          console.error('QR code generation error:', err);
        } else {
          setError(null);
        }
      }
    );
  }, [value, size, bgColor, fgColor, errorCorrectionLevel]);

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  return (
    <div style={styles.container}>
      <canvas ref={canvasRef} style={styles.canvas} />
    </div>
  );
}

export default QRCode;
