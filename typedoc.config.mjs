/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
    entryPoints: [
        'packages/libmodule/src/index.ts',
    ],
    out: 'docs/api',
    plugin: ['typedoc-plugin-markdown'],
    readme: 'none',
    githubPages: false,
    entryPointStrategy: 'expand',
    tsconfig: 'packages/libmodule/tsconfig.json',
    name: 'libmodule API Reference',
    excludePrivate: true,
    excludeInternal: true,
    categorizeByGroup: true,
    outputFileStrategy: 'members',
};
