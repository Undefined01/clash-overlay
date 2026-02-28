// scripts/build.js — esbuild bundler for Clash override single-file output
import { build } from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

await build({
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'iife',
    globalName: '__override',
    outfile: 'dist/override.js',
    platform: 'neutral',
    target: 'es2020',
    minify: false,           // 保持可读性，便于调试
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
