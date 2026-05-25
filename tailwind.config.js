/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0e1117',
        s1:      '#161b24',
        s2:      '#1c2333',
        s3:      '#222d3a',
        bd:      '#263040',
        bd2:     '#2e3c4e',
        acc:     '#22c55e',
        tx:      '#f1f5f9',
        tx2:     '#94a3b8',
        tx3:     '#64748b',
        danger:  '#ef4444',
        warn:    '#f59e0b',
        info:    '#3b82f6',
        purple:  '#a855f7',
        orange:  '#f97316',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
