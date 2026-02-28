/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
    entryPoints: [
        'packages/liboverlay/src/index.ts',
    ],
    out: 'docs/api',
    plugin: ['typedoc-plugin-markdown'],
    readme: 'none',
    githubPages: false,
    entryPointStrategy: 'expand',
    tsconfig: 'packages/liboverlay/tsconfig.json',
    name: 'liboverlay API Reference',
    excludePrivate: true,
    excludeInternal: true,
    categorizeByGroup: true,
    outputFileStrategy: 'members',
};
