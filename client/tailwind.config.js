/** @type {import('tailwindcss').Config} */

/**
 * 令牌色 + 透明度修饰符支持（如 bg-bg-elevated/90、border-border/40）。
 * Tailwind v3 无法对纯 var() 颜色应用 /alpha 修饰符（此前这些类静默丢失，
 * 导致明亮主题下弹窗/面板背景全透明），用 color-mix 按透明度混入 transparent
 * 实现（Chromium 111+ / Electron 35 支持）。
 */
const tokenColor = (variable) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(${variable})`
    : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: tokenColor('--kb-brand-50'),
          100: tokenColor('--kb-brand-100'),
          200: tokenColor('--kb-brand-200'),
          300: tokenColor('--kb-brand-300'),
          400: tokenColor('--kb-brand-400'),
          500: tokenColor('--kb-brand-500'),
          600: tokenColor('--kb-brand-600'),
          700: tokenColor('--kb-brand-700'),
          800: tokenColor('--kb-brand-800'),
          900: tokenColor('--kb-brand-900'),
        },
        accent: {
          DEFAULT: tokenColor('--accent'),
          foreground: tokenColor('--accent-foreground'),
          50: tokenColor('--kb-accent-50'),
          100: tokenColor('--kb-accent-100'),
          200: tokenColor('--kb-accent-200'),
          300: tokenColor('--kb-accent-300'),
          400: tokenColor('--kb-accent-400'),
          500: tokenColor('--kb-accent-500'),
          600: tokenColor('--kb-accent-600'),
          700: tokenColor('--kb-accent-700'),
          800: tokenColor('--kb-accent-800'),
          900: tokenColor('--kb-accent-900'),
        },
        pomodoro: { DEFAULT: '#5B8A72', light: '#AAC9B5' },
        note: { DEFAULT: '#6B9BD2', light: '#ADD6FF' },
        flashcard: { DEFAULT: '#7BC4B8', light: '#B8E0D8' },
        feynman: { DEFAULT: '#C4956A', light: '#DEBB92' },
        classroom: { DEFAULT: '#14B8A6', light: '#5EEAD4' },
        /* 深海静谧功能色 */
        focus: { DEFAULT: tokenColor('--kb-focus-blue') },
        amber: { DEFAULT: tokenColor('--kb-amber') },
        moss: { DEFAULT: tokenColor('--kb-moss-green') },
        cyber: { DEFAULT: tokenColor('--kb-cyber-cyan') },
        'stone-purple': tokenColor('--kb-stone-purple'),
        bg: {
          primary: tokenColor('--kb-bg-primary'),
          secondary: tokenColor('--kb-bg-secondary'),
          tertiary: tokenColor('--kb-bg-tertiary'),
          elevated: tokenColor('--kb-bg-elevated'),
        },
        text: {
          primary: tokenColor('--kb-text-primary'),
          secondary: tokenColor('--kb-text-secondary'),
          tertiary: tokenColor('--kb-text-tertiary'),
          inverse: tokenColor('--kb-text-inverse'),
        },
        border: {
          DEFAULT: tokenColor('--kb-border-default'),
          strong: tokenColor('--kb-border-strong'),
        },
        semantic: {
          success: tokenColor('--kb-color-success'),
          warning: tokenColor('--kb-color-warning'),
          error: tokenColor('--kb-color-error'),
          info: tokenColor('--kb-color-info'),
        },
        // shadcn/ui 兼容色
        background: tokenColor('--background'),
        foreground: tokenColor('--foreground'),
        card: {
          DEFAULT: tokenColor('--card'),
          foreground: tokenColor('--card-foreground'),
        },
        popover: {
          DEFAULT: tokenColor('--popover'),
          foreground: tokenColor('--popover-foreground'),
        },
        primary: {
          DEFAULT: tokenColor('--primary'),
          foreground: tokenColor('--primary-foreground'),
        },
        secondary: {
          DEFAULT: tokenColor('--secondary'),
          foreground: tokenColor('--secondary-foreground'),
        },
        muted: {
          DEFAULT: tokenColor('--muted'),
          foreground: tokenColor('--muted-foreground'),
        },
        destructive: {
          DEFAULT: tokenColor('--destructive'),
          foreground: tokenColor('--destructive-foreground'),
        },
        input: tokenColor('--input'),
        ring: tokenColor('--ring'),
      },
      fontFamily: {
        sans: ['var(--kb-font-sans)'],
        serif: ['var(--kb-font-serif)'],
        mono: ['var(--kb-font-mono)'],
        timer: ['var(--kb-font-timer)'],
      },
      fontSize: {
        'd1': 'var(--kb-text-d1)',
        'd2': 'var(--kb-text-d2)',
        'h1': 'var(--kb-text-h1)',
        'h2': 'var(--kb-text-h2)',
        'h3': 'var(--kb-text-h3)',
        'b1': 'var(--kb-text-b1)',
        'b2': 'var(--kb-text-b2)',
        'b3': 'var(--kb-text-b3)',
        'c1': 'var(--kb-text-c1)',
        'c2': 'var(--kb-text-c2)',
        'timer': 'var(--kb-text-timer)',
      },
      spacing: {
        'kb-xs': 'var(--kb-space-xs)',
        'kb-sm': 'var(--kb-space-sm)',
        'kb-md': 'var(--kb-space-md)',
        'kb-lg': 'var(--kb-space-lg)',
        'kb-xl': 'var(--kb-space-xl)',
        'kb-2xl': 'var(--kb-space-2xl)',
        'rhythm-xs': 'var(--kb-rhythm-xs)',
        'rhythm-sm': 'var(--kb-rhythm-sm)',
        'rhythm-md': 'var(--kb-rhythm-md)',
        'rhythm-lg': 'var(--kb-rhythm-lg)',
        'rhythm-xl': 'var(--kb-rhythm-xl)',
      },
      borderRadius: {
        'kb-sm': 'var(--kb-radius-sm)',
        'kb-md': 'var(--kb-radius-md)',
        'kb-lg': 'var(--kb-radius-lg)',
        'kb-xl': 'var(--kb-radius-xl)',
        'kb-full': 'var(--kb-radius-full)',
        // shadcn 使用默认命名
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
      },
      boxShadow: {
        'kb-sm': 'var(--kb-shadow-sm)',
        'kb-md': 'var(--kb-shadow-md)',
        'kb-lg': 'var(--kb-shadow-lg)',
        'brand': 'var(--kb-shadow-brand)',
        'accent': 'var(--kb-shadow-accent)',
      },
      transitionDuration: {
        'kb-fast': 'var(--kb-duration-fast)',
        'kb-normal': 'var(--kb-duration-normal)',
        'kb-slow': 'var(--kb-duration-slow)',
        'beat-xs': 'var(--kb-beat-xs)',
        'beat': 'var(--kb-beat)',
        'beat-x2': 'var(--kb-beat-x2)',
        'beat-x3': 'var(--kb-beat-x3)',
        'beat-x5': 'var(--kb-beat-x5)',
      },
      transitionTimingFunction: {
        'kb-default': 'var(--kb-ease-default)',
        'kb-in': 'var(--kb-ease-in)',
        'kb-out': 'var(--kb-ease-out)',
        'kb-in-out': 'var(--kb-ease-in-out)',
        'kb-bounce': 'var(--kb-ease-bounce)',
        'kb-smooth': 'var(--kb-ease-smooth)',
        'kb-spring': 'var(--kb-ease-spring)',
      },
      animation: {
        'scale-bounce': 'scale-bounce var(--kb-duration-normal) var(--kb-ease-bounce)',
        'stagger-in': 'stagger-in var(--kb-duration-normal) var(--kb-ease-smooth)',
        'pulse-skeleton': 'pulse-skeleton 1.5s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in-up': 'fade-in-up var(--kb-duration-normal) var(--kb-ease-smooth)',
        'modal-enter': 'modal-enter var(--kb-duration-slow) var(--kb-ease-spring)',
        'card-exit': 'card-exit 350ms var(--kb-ease-in) forwards',
        'brand-draw': 'brand-draw 1.2s ease-out forwards',
        'brand-float': 'brand-float 3s ease-in-out infinite',
        'breathe': 'breathe 2s ease-in-out infinite',
      },
      width: {
        'icon-xs': 'var(--kb-icon-size-xs)',
        'icon-sm': 'var(--kb-icon-size-sm)',
        'icon-md': 'var(--kb-icon-size-md)',
        'icon-lg': 'var(--kb-icon-size-lg)',
        'icon-xl': 'var(--kb-icon-size-xl)',
      },
      height: {
        'icon-xs': 'var(--kb-icon-size-xs)',
        'icon-sm': 'var(--kb-icon-size-sm)',
        'icon-md': 'var(--kb-icon-size-md)',
        'icon-lg': 'var(--kb-icon-size-lg)',
        'icon-xl': 'var(--kb-icon-size-xl)',
      },
      strokeWidth: {
        'kb-icon': 'var(--kb-icon-stroke-width)',
      },
      perspective: {
        'kb': 'var(--kb-perspective)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
