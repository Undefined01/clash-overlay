import type { MergeNodeInfo } from '../substore-context.js';
import type { ProxyNode } from '../../types/substore.js';

export interface GeoInfo {
    countryCode: string;
}

export type LandingGeoInfo = GeoInfo;

/**
 * Normalized node info parsed from proxy name.
 *
 * Written by `parse_node_name` as `_nodeInfo`.
 */
export interface NodeInfo {
    /** Standardized country code (e.g. TW/US/CN). */
    countryCode: string;
    /** Optional multiplier extracted from node name. */
    multiplier?: number;
    /** Optional tag list extracted from node name. */
    tags?: string[];
}

export interface NodeInfoPatch {
    _nodeInfo: NodeInfo;
}

export interface GeoPatch {
    _geoEntry: GeoInfo;
    _geoLanding?: LandingGeoInfo;
    _geoCheckedAt?: number;
}

export type BaseProxy = ProxyNode & MergeNodeInfo & {
    server?: string;
};

export type WithGeo<TProxy extends BaseProxy> = TProxy & GeoPatch;
export type WithNodeInfo<TProxy extends BaseProxy> = TProxy & NodeInfoPatch;
export type WithName<TProxy extends BaseProxy> = TProxy & { name: string };
