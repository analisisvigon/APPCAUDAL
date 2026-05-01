export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        caudal: {
          950: '#02070f',
          900: '#061127',
          850: '#0c1b3c',
          800: '#12254f',
          electric: '#4f8cff',
        },
      },
      boxShadow: {
        glow: '0 20px 50px rgba(79, 140, 255, 0.18)',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
