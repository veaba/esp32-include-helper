import { defineConfig } from 'tsdown'

export default defineConfig({

  format: ['cjs'],
  unbundle: false,
  exports: false,
  sourcemap: true,
  external: ['vscode', 'sql.js', 'vscode-languageclient'],
  outExtensions: () => {
    return {
      js: '.js',
    }
  },
},
)
