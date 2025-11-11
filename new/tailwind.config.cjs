const { fontFamily } = require('tailwindcss/defaultTheme');

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f1115',
        surface: '#161920',
        overlay: '#1f2330',
        accent: {
          DEFAULT: '#5d5fef',
          muted: '#3d3f9d',
          glow: '#9fa1ff',
        },
        success: '#4ade80',
        warning: '#facc15',
        danger: '#f87171',
        text: {
          primary: '#f4f5ff',
          secondary: '#a1a5b7',
          muted: '#6b7280',
        },
        border: '#2b3040',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', ...fontFamily.sans],
        mono: ['"JetBrains Mono"', ...fontFamily.mono],
      },
      boxShadow: {
        'glow-focus': '0 0 0 2px rgba(93, 95, 239, 0.25)',
      },
      borderRadius: {
        card: '1.25rem',
        menu: '2.5rem',
      },
      animation: {
        'ring-pulse': 'ringPulse 2.5s ease-in-out infinite',
        'fade-in': 'fadeIn 180ms ease-out forwards',
      },
      keyframes: {
        ringPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(93, 95, 239, 0.35)' },
          '70%': { boxShadow: '0 0 0 18px rgba(93, 95, 239, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(93, 95, 239, 0)' },
        },
        fadeIn: {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
