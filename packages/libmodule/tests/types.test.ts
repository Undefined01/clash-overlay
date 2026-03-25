import { describe, expectTypeOf, it } from 'vitest';
import { mkIf } from '../src/index.js';
import type { DeferProxy, ModuleArgs, ModuleFn, OptionDeclaration, OptionType } from '../src/index.js';

describe('public typing', () => {
    it('threads special args through ModuleArgs and ModuleFn', () => {
        type Args = { ctx: { user: string } };
        type Config = { enabled: boolean };
        type Result = { greeting: string };

        expectTypeOf<ModuleArgs<Args, Config>>().toEqualTypeOf<Args & { readonly config: Config }>();

        const mod: ModuleFn<Args, Config, Result> = ({ ctx, config }) => ({
            greeting: `${ctx.user}:${config.enabled}`,
        });

        expectTypeOf(mod({ ctx: { user: 'alice' }, config: { enabled: true } }))
            .toEqualTypeOf<Result>();
    });

    it('keeps lazy mkIf results typed as deferred values', () => {
        const lazyObject = mkIf(() => true, {
            port: 443 as number,
            names: ['alice'] as string[],
        });
        const lazyScalar = mkIf(() => true, 443 as number);

        expectTypeOf(lazyObject.port).toEqualTypeOf<DeferProxy<number | undefined>>();
        expectTypeOf(lazyObject.names).toEqualTypeOf<DeferProxy<string[] | undefined>>();
        expectTypeOf(lazyScalar).toEqualTypeOf<DeferProxy<number | undefined>>();
    });

    it('keeps transform output typed on option declarations and option types', () => {
        expectTypeOf<OptionType<string | string[], string>>().toMatchTypeOf<OptionType<string | string[], string>>();
        expectTypeOf<OptionDeclaration<string | string[], string>>()
            .toMatchTypeOf<OptionDeclaration<string | string[], string>>();
    });
});

// @ts-expect-error `config` is reserved for libmodule.
type _InvalidModuleArgs = ModuleArgs<{ config: 'bad' }, { enabled: boolean }>;
