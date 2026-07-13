/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'rgb(var(--color-bg) / <alpha-value>)',
        bg2:     'rgb(var(--color-bg2) / <alpha-value>)',
        s1:      'rgb(var(--color-s1) / <alpha-value>)',
        s2:      'rgb(var(--color-s2) / <alpha-value>)',
        s3:      'rgb(var(--color-s3) / <alpha-value>)',
        bd:      'rgb(var(--color-bd) / <alpha-value>)',
        bd2:     'rgb(var(--color-bd2) / <alpha-value>)',
        acc:     'rgb(var(--color-acc) / <alpha-value>)',
        onacc:   'rgb(var(--color-onacc) / <alpha-value>)',
        tx:      'rgb(var(--color-tx) / <alpha-value>)',
        tx2:     'rgb(var(--color-tx2) / <alpha-value>)',
        tx3:     'rgb(var(--color-tx3) / <alpha-value>)',
        danger:  'rgb(var(--color-danger) / <alpha-value>)',
        warn:    'rgb(var(--color-warn) / <alpha-value>)',
        info:    'rgb(var(--color-info) / <alpha-value>)',
        purple:  'rgb(var(--color-purple) / <alpha-value>)',
        orange:  'rgb(var(--color-orange) / <alpha-value>)',
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.75rem',
      },
      boxShadow: {
        panel: '0 18px 48px rgb(15 23 42 / 0.12)',
        lift: '0 12px 30px rgb(15 23 42 / 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
