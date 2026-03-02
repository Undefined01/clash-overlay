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
        entry: resolve(__dirname, '../src/entrypoints/override.ts'),
        outfile: resolve(__dirname, '../dist/override.js'),
        footer: [
            '',
            '// Clash override entry point',
            'function main(config) { return __entry.default(config); }',
        ].join('\n'),
    },
    {
        entry: resolve(__dirname, '../src/entrypoints/parse_node_name.ts'),
        outfile: resolve(__dirname, '../dist/parse_node_name.js'),
        footer: [
            '',
            '// Sub-Store operator entry point',
            'function operator(proxies, targetPlatform, context) {',
            '    return __entry.default(proxies, targetPlatform, context);',
            '}',
        ].join('\n'),
    },
    {
        entry: resolve(__dirname, '../src/entrypoints/detect_geo.ts'),
        outfile: resolve(__dirname, '../dist/detect_geo.js'),
        footer: [
            '',
            '// Sub-Store operator entry point',
            'function operator(proxies, targetPlatform, context) {',
            '    return __entry.default(proxies, targetPlatform, context);',
            '}',
        ].join('\n'),
    },
    {
        entry: resolve(__dirname, '../src/entrypoints/rename_nodes.ts'),
        outfile: resolve(__dirname, '../dist/rename_nodes.js'),
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
        treeShaking: true,
        banner: { js: baseBanner },
        footer: { js: item.footer },
    });
    console.log(`✓ Built ${item.outfile.replace(resolve(__dirname, '..') + '/', '')}`);
}
