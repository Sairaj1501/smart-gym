export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: '#0A1B33', navy: { 800: '#102544', 700: '#17315A', 600: '#1F3F70' }, brand: { DEFAULT: '#22C97A', dark: '#12A863', soft: '#E6F9F0' }, surface: '#F3F6FA' },
      fontFamily: { display: ['Outfit', 'system-ui', 'sans-serif'], sans: ['Figtree', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(10,27,51,.06), 0 4px 14px rgba(10,27,51,.05)' },
    },
  },
  plugins: [],
};
