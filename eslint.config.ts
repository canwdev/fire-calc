import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  rules: {
    'no-console': 'off',
    'no-alert': 'off',
    'vue/no-mutating-props': 'warn',
    'vue/no-side-effects-in-computed-properties': 'warn',
  },
})
