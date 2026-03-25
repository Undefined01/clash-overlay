import type { ModuleArgs } from 'libmodule';
import type { ClashMetaConfig } from '../types/clash_meta_config.js';

export interface ModuleContext {
    arguments: Record<string, unknown>;
    originalConfig: ClashMetaConfig;
}

export type OverlayModuleArgs = ModuleArgs<{ ctx: ModuleContext }>;
