interface LazyRecordProxyOptions {
    name: string;
    phase: string;
}

export function createLazyRecordProxy(
    getTarget: () => Record<string, unknown> | null,
    options: LazyRecordProxyOptions,
): Record<string, unknown> {
    return new Proxy(Object.create(null) as Record<string, unknown>, {
        get(_: Record<string, unknown>, prop: string | symbol): unknown {
            const target = getTarget();
            if (target === null) {
                throw new Error(
                    `Cannot eagerly access ${options.name}.${String(prop)} during ${options.phase}. ` +
                    `Wrap in defer(() => ${options.name}.${String(prop)}).`,
                );
            }
            return target[prop as keyof typeof target];
        },
        has(_: Record<string, unknown>, prop: string | symbol): boolean {
            const target = getTarget();
            if (target === null) {
                throw new Error(`Cannot check '${options.name}' membership during ${options.phase}.`);
            }
            return prop in target;
        },
        ownKeys(): Array<string | symbol> {
            const target = getTarget();
            if (target === null) {
                throw new Error(`Cannot enumerate '${options.name}' during ${options.phase}.`);
            }
            return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(_: Record<string, unknown>, prop: string | symbol): PropertyDescriptor | undefined {
            const target = getTarget();
            if (target === null) return undefined;
            if (prop in target) {
                return {
                    value: target[prop as keyof typeof target],
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };
            }
            return undefined;
        },
    });
}
