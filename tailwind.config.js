import {nextui} from '@nextui-org/theme'

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      keyframes: {
        'pulse-scale': {
          '0%, 100%': { transform: 'scale(1.5)' },
          '50%': { transform: 'scale(1.55)' }
        },
        'scale-pulse': {
          '0%, 100%': { transform: 'scale(1.3)' },
          '50%': { transform: 'scale(1.35)' }
        }
      },
      animation: {
        'pulse-scale': 'pulse-scale 1s ease-in-out infinite',
        'scale-pulse': 'scale-pulse 1s ease-in-out infinite'
      }
    },
  },
  darkMode: "class",
  plugins: [nextui()],
}
