export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  unit: string;
  category: string;
  previewImage: string;
  fileType: string;
}

export const products: Product[] = [
  {
    id: 1,
    name: 'Pixel Grid Wallpaper Pack',
    description: 'A collection of minimal dot-matrix wallpapers inspired by industrial design. Four high-resolution patterns in monochrome.',
    price: 4,
    unit: 'sat',
    category: 'wallpapers',
    previewImage: '/assets/wallpaper-preview.svg',
    fileType: 'SVG Pack',
  },
  {
    id: 2,
    name: 'Mono Icon Set',
    description: '24 monochrome SVG icons designed for developer tools and technical interfaces. Pixel-perfect at 24x24.',
    price: 2,
    unit: 'sat',
    category: 'icons',
    previewImage: '/assets/icons-preview.svg',
    fileType: 'SVG Bundle',
  },
  {
    id: 3,
    name: 'Code Snippet Collection',
    description: 'Curated TypeScript utility functions for cryptographic operations, encoding, and data manipulation.',
    price: 1,
    unit: 'sat',
    category: 'code',
    previewImage: '/assets/code-preview.svg',
    fileType: 'TypeScript',
  },
  {
    id: 4,
    name: 'Terminal Font',
    description: 'A monospaced bitmap font optimized for terminal emulators and code editors. Includes regular and bold weights.',
    price: 8,
    unit: 'sat',
    category: 'fonts',
    previewImage: '/assets/font-preview.svg',
    fileType: 'OTF Font',
  },
];
