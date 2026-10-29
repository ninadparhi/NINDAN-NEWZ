export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        head: ['Iowan Old Style', 'Charter', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        leanLeft: 'rgb(var(--lean-left) / <alpha-value>)',
        leanCenterLeft: 'rgb(var(--lean-center-left) / <alpha-value>)',
        leanCenter: 'rgb(var(--lean-center) / <alpha-value>)',
        leanCenterRight: 'rgb(var(--lean-center-right) / <alpha-value>)',
        leanRight: 'rgb(var(--lean-right) / <alpha-value>)',
        leanNone: 'rgb(var(--lean-none) / <alpha-value>)',
      },
      maxWidth: { content: '1220px' },
    },
  },
};
