// clash-overlay/scripts/build.js — esbuild bundler for Clash override output
import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

await build({
    entryPoints: [resolve(__dirname, '../src/index.ts')],
    bundle: true,
    format: 'iife',
    globalName: '__override',
    outfile: resolve(__dirname, '../dist/override.js'),
    platform: 'neutral',
    target: 'es2020',
    minify: false,
    keepNames: true,
    banner: {
        js: [
            `// Clash/Mihomo Override Script v${pkg.version}`,
            `// Built: ${new Date().toISOString()}`,
            `// https://github.com/han/clash-override`,
            '',
        ].join('\n'),
    },
    footer: {
        js: [
            '',
            '// Clash override entry point — export main as the global function',
            'function main(config) { return __override.default(config); }',
        ].join('\n'),
    },
});

console.log('✓ Built dist/override.js');
