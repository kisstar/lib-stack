import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const common = defineConfig({
  input: 'src/index.ts',
})

export default defineConfig([
  {
    ...common,
    plugins: [dts()],
    output: {
      format: 'esm',
      dir: 'dist',
      entryFileNames: '[name].mjs',
      chunkFileNames: '[name].mjs',
    },
  },
  {
    ...common,
    output: [
      {
        format: 'cjs',
        dir: 'dist',
        entryFileNames: '[name].cjs',
      },
      {
        format: 'iife',
        dir: 'dist',
        entryFileNames: '[name].iife.js',
        name: 'LibStackShared',
      },
    ],
  },
  {
    ...common,
    plugins: [dts({ emitDtsOnly: true })],
    output: {
      format: 'esm',
      dir: 'dist',
      entryFileNames: '[name].cjs',
      chunkFileNames: '[name].cjs',
    },
  },
])
