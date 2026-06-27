/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#161a23',
        border: '#252a36',
        accent: '#4f9cf9',
        green: '#26a69a',
        red: '#ef5350',
        yellow: '#f4c542',
        muted: '#64748b',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
