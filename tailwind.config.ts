import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        baw: {
          bg: '#0F0F12',
          surface: '#17171C',
          elevated: '#1E1E24',
          border: '#2A2A32',
          text: '#E8E8EC',
          muted: '#8B8B95',
          faint: '#55555E',
          primary: '#3B82F6',
          agent: '#8B5CF6',
          'agent-subtle': 'rgba(139, 92, 246, 0.1)',
          'human-subtle': 'rgba(59, 130, 246, 0.1)',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        meta: ['11px', { lineHeight: '16px' }],
        body: ['13px', { lineHeight: '18px' }],
        label: ['14px', { lineHeight: '20px' }],
        section: ['16px', { lineHeight: '22px' }],
        page: ['20px', { lineHeight: '28px' }],
      },
    },
  },
  plugins: [],
}

export default config
