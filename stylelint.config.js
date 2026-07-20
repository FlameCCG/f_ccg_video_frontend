/** @type {import('stylelint').Config} */
export default {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-config-standard-vue/scss',
    'stylelint-config-recess-order',
  ],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
    {
      files: ['**/*.{scss,sass}'],
      customSyntax: 'postcss-scss',
    },
  ],
  rules: {
    'selector-class-pattern': null,
    // Tailwind / Sass at-rules
    'scss/at-rule-no-unknown': [
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
    'scss/no-global-function-names': null,
    'scss/dollar-variable-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'no-duplicate-selectors': null,
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    'color-hex-length': null,
    'order/properties-order': null,
    'import-notation': null,
    'function-no-unknown': null,
    // 嵌套转换后的 Vue SFC 样式：放宽空行要求，避免海量机械噪音
    'rule-empty-line-before': null,
    'comment-empty-line-before': null,
    'scss/double-slash-comment-empty-line-before': null,
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['deep', 'global', 'slotted'],
      },
    ],
  },
  ignoreFiles: ['dist/**', 'node_modules/**'],
}
