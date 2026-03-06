import { ClashMetaConfig } from "../types/clash_meta_config";

export interface ModuleContext {
    arguments: Record<string, unknown>;
    originalConfig: ClashMetaConfig;
}
