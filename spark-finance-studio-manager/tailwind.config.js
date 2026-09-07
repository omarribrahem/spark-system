/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        background: "#FAF9F6",
        foreground: "#1A1A1A",
        brand: {
          DEFAULT: "#004AC6",
          foreground: "#ffffff",
          soft: "#EEF3FD",
        },
        spark: {
          50: '#FAF9F6',
          100: '#F1F4FA',
          200: '#E3E7EE',
          300: '#DDE2EE',
          400: '#3B82F6',
          500: '#004AC6',
          600: '#003DA6',
          700: '#003085',
          800: '#002466',
          900: '#001948',
          950: '#000F2E',
        },
        surface: {
          canvas: '#FAF9F6',
          card: '#ffffff',
          glass: 'rgba(255, 255, 255, 0.75)',
          muted: '#F1F4FA',
        },
        border: {
          DEFAULT: '#E5E5E5',
          glass: 'rgba(255, 255, 255, 0.4)',
          subtle: '#EAEAEA',
          strong: '#D4D4D4',
        },
        status: {
          success: '#16A34A',
          'success-bg': '#ECFDF5',
          warning: '#D97706',
          'warning-bg': '#FFFBEB',
          danger: '#DC2626',
          'danger-bg': '#FEF2F2',
          info: '#2563EB',
          'info-bg': '#EFF6FF',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Noto Sans Arabic', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Noto Sans Arabic', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 8px 30px rgba(0, 0, 0, 0.06)',
        'island': '0 12px 40px -10px rgba(0, 0, 0, 0.12)',
        'tactile-xs': '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        'tactile-sm': '0 2px 4px 0 rgba(15, 23, 42, 0.05)',
      },
      borderRadius: {
        'card-xl': '2rem',
      },
    },
  },
  plugins: [],
}
