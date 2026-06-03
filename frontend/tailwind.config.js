/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#FFC200',
          'yellow-light': '#FFD633',
          black: '#0a0a0a',
          surface: '#141414',
          card: '#1c1c1c',
          border: '#2a2a2a',
          muted: '#888888',
          text: '#f0f0f0',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'cursive'],
        body: ['"Outfit"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
