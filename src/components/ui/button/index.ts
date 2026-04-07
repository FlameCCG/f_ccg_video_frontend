import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

/**
 * 按钮基础样式由 main.scss 的 .ui-button 提供。
 * 过渡使用 --duration-fast 与 --ease-out-quart，显式列出颜色、边框、透明度和 transform；按压反馈使用 scale(0.97)。
 * 焦点指示使用全局统一规则，组件内提供兜底，避免调用方的 outline-none 隐藏焦点。
 * 阴影使用 --shadow-surface，以适应明暗主题。
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
