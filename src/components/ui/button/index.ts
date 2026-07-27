import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

/**
 * base 串的两处变化（真值见 main.scss @layer components 的 .ui-button）：
 * 1. `transition-colors`（默认 150ms ease，非项目 token）→ `.ui-button`，
 *    它用 --duration-fast / --ease-out-quart 显式列出 color/background/border/opacity/transform，
 *    并补上 `:active` 的 scale(0.97) —— 此前全站按钮按下去零反馈，
 *    登录 / 投稿 / 发布这些主路径只能靠后续 toast 才知道点到了。
 * 2. `focus-visible:outline-none focus-visible:ring-1 ring-ring` 删除。
 *    ring-1 在 primary 蓝上肉眼几乎不可见，且它与全局 `*:focus-visible` 的 outline
 *    是两套并存的焦点语言。统一收回到全局那一套（.ui-button 内再声明一次做兜底，
 *    防止调用方传了 outline-none 之类的 utility 把它冲掉）。
 * 阴影从 Tailwind 默认灰阴影换成项目 token：默认 shadow 在暗色主题（oklch 0.18 底）上
 * 等于不可见，弹起感全靠 --shadow-surface 这套带色相的双层阴影。
 */
export const buttonVariants = cva(
  'ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-surface hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-surface hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-surface hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-surface hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        xs: 'h-7 rounded px-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
