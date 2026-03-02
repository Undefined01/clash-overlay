import type { MergeNodeInfo } from '../substore-context.js';

export type ScriptArgValue = string | number | boolean;

export interface GeoInfo {
    ip: string;
    countryCode: string;
    country: string;
}

export interface LandingGeoInfo extends GeoInfo {
    isResidential: boolean;
}

/**
 * Normalized node info parsed from proxy name.
 *
 * Written by `00_parse_name` as `_nodeInfo`.
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

export interface BaseProxy extends MergeNodeInfo {
    name?: string;
    _originName?: string;
    server?: string;
    [key: string]: unknown;
}

export type WithGeo<TProxy extends BaseProxy> = TProxy & GeoPatch;
export type WithNodeInfo<TProxy extends BaseProxy> = TProxy & NodeInfoPatch;
export type WithName<TProxy extends BaseProxy> = TProxy & { name: string };
