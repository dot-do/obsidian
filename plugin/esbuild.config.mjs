import esbuild from 'esbuild'
import process from 'process'

const prod = process.argv[2] === 'production'

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    '@lezer/*',
    // Node built-ins available in Electron
    'http',
    'https',
    'net',
    'tls',
    'crypto',
    'stream',
    'buffer',
    'events',
    'url',
    'util',
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
  define: {
    'process.env.NODE_ENV': prod ? '"production"' : '"development"'
  }
})

if (prod) {
  await context.rebuild()
  process.exit(0)
} else {
  await context.watch()
}
