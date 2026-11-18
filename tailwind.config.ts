import type { Config } from 'tailwindcss'

/**
 * The palette is dark, low-chroma and serious. The learner is 18 and has been
 * put off by things that look like they were made for children, so nothing
 * here is bright for its own sake: brass is the single accent (a conductor's
 * baton), teal means verified, rose means wrong, and everything else is slate.
 */
export default {
  content: ['./apps/renderer/index.html', './apps/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090f',
          900: '#0b0e14',
          850: '#11151e',
          800: '#161b26',
          700: '#1f2633',
          600: '#2b3342',
          500: '#3d4757',
          400: '#4a5568',
        },
        brass: {
          400: '#e3b341',
          500: '#d29922',
          600: '#a97a15',
        },
        verify: {
          400: '#3fb950',
          500: '#2ea043',
          600: '#1f7a33',
        },
        wrong: {
          400: '#f85149',
          500: '#da3633',
        },
        parchment: {
          100: '#e6edf3',
          200: '#c9d1d9',
          300: '#9aa5b1',
          400: '#768390',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'prose-base': ['1.0625rem', { lineHeight: '1.75' }],
      },
      maxWidth: {
        prose: '68ch',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(210,153,34,0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(210,153,34,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(210,153,34,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 280ms ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
