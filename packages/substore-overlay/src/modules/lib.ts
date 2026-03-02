import { ClashMetaConfig } from "../types/clash_meta_config";

export interface ModuleContext<TArg> {
    arguments: TArg;
    originalConfig: ClashMetaConfig;
}