/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard', 'stylelint-config-standard-vue', 'stylelint-config-recess-order'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    'selector-class-pattern': null,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'apply',
          'variants',
          'responsive',
          'screen',
          'layer',
          'theme',
          'use',
          'forward',
          'each',
          'if',
          'else',
          'config',
          'utility',
          'source',
          'plugin',
          'custom-variant',
        ],
      },
    ],
    'no-descending-specificity': null,
    // 允许自定义属性前空行（用于分组）
    'custom-property-empty-line-before': null,
    // 允许重复选择器
    'no-duplicate-selectors': null,
    // 允许 rgba 函数（兼容性更好）
    'color-function-notation': null,
    // 允许小数形式的 alpha 值
    'alpha-value-notation': null,
    // 允许完整的十六进制颜色
    'color-hex-length': null,
    // 放宽属性顺序规则
    'order/properties-order': null,
    // 允许 Vue 的 :deep 伪类选择器
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['deep', 'global', 'slotted'],
      },
    ],
    // 允许 Tailwind 的 @import 语法
    'import-notation': null,
    // 允许未知函数（Tailwind 使用的）
    'function-no-unknown': null,
  },
  ignoreFiles: ['dist/**', 'node_modules/**'],
}
