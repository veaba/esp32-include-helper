import { defineConfig } from 'tsdown'

export default defineConfig({
  format: ['cjs'],
  exports: false,
  sourcemap: true,
  external: ['vscode'],
  noExternal: ['sql.js', /^vscode-languageclient/],
  outExtensions: () => {
    return {
      js: '.js',
    }
  },
})