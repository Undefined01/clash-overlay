// substore-overlay/scripts/build.js — esbuild bundler for Sub-Store scripts
import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

const builtAt = new Date().toISOString();
const baseBanner = [
    `// Sub-Store Script Bundle v${pkg.version}`,
    `// Built: ${builtAt}`,
    `// https://github.com/han/clash-override`,
    '',
].join('\n');

const entries = [
    {
        entry: resolve(__dirname, '../src/entrypoints/index.ts'),
        outfile: resolve(__dirname, '../dist/index.js'),
        footer: [
            '',
            '// Clash override entry point',
            'function main(config) { return __entry.default(config); }',
        ].join('\n'),
    },
    {
        entry: resolve(__dirname, '../src/entrypoints/01_detect_entry_landing_geo.ts'),
        outfile: resolve(__dirname, '../dist/01_detect_entry_landing_geo.js'),
        footer: [
            '',
            '// Sub-Store operator entry point',
            'function operator(proxies, targetPlatform, context) {',
            '    return __entry.default(proxies, targetPlatform, context);',
            '}',
        ].join('\n'),
    },
    {
        entry: resolve(__dirname, '../src/entrypoints/02_rename_by_entry_landing.ts'),
        outfile: resolve(__dirname, '../dist/02_rename_by_entry_landing.js'),
        footer: [
            '',
            '// Sub-Store operator entry point',
            'function operator(proxies, targetPlatform, context) {',
            '    return __entry.default(proxies, targetPlatform, context);',
            '}',
        ].join('\n'),
    },
];

for (const item of entries) {
    await build({
        entryPoints: [item.entry],
        bundle: true,
        format: 'iife',
        globalName: '__entry',
        outfile: item.outfile,
        platform: 'neutral',
        target: 'es2020',
        minify: false,
        keepNames: true,
        banner: { js: baseBanner },
        footer: { js: item.footer },
    });
    console.log(`✓ Built ${item.outfile.replace(resolve(__dirname, '..') + '/', '')}`);
}
