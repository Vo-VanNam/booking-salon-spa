import type { Config } from 'tailwindcss';

/**
 * Design tokens cho hướng "Sổ lịch be" (docs/design/specs/design-tokens.md):
 * nền be, nâu nhạt, trắng; accent nâu đậm; màu trạng thái chỉ dùng cho tín hiệu.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAF7F2',
        surface: '#FFFFFF',
        'surface-2': '#F3EDE4',
        'surface-3': '#EAE1D4',
        border: '#E4DACB',
        'border-strong': '#C9B79E',
        ink: '#2B2320',
        muted: '#6F6257',
        accent: { DEFAULT: '#7A5C3E', hover: '#63492F', soft: '#EFE6DA' },
        success: '#2F7D4F',
        warning: '#B4761A',
        danger: '#B3261E',
        info: '#3A6EA5',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        data: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        meta: ['12px', { lineHeight: '1.4' }],
        'body-sm': ['14px', { lineHeight: '1.5' }],
        body: ['16px', { lineHeight: '1.5' }],
        section: ['20px', { lineHeight: '1.3' }],
        title: ['25px', { lineHeight: '1.25' }],
        display: ['31px', { lineHeight: '1.2' }],
      },
      borderRadius: { card: '12px', control: '8px' },
      boxShadow: {
        sm: '0 1px 2px rgba(43,35,32,0.06)',
        md: '0 6px 16px rgba(43,35,32,0.10)',
      },
      transitionTimingFunction: { standard: 'cubic-bezier(0.2,0,0,1)' },
      transitionDuration: { micro: '120ms', base: '200ms', step: '320ms' },
    },
  },
  plugins: [],
};

export default config;
