import type { SubStoreHttpRequest, SubStoreHttpResponse } from '../../types/substore.js';
import { isRecord, safeJsonParse } from './runtime.js';
import type { GeoInfo } from './types.js';
import { normalizeCountryCode } from './country.js';

export interface RuntimeRequest extends SubStoreHttpRequest {
    method?: 'get';
    'policy-descriptor'?: string;
}

export type RuntimeResponse = SubStoreHttpResponse;

export interface LandingApiRequest {
    apiUrl: string;
    timeout: number;
    node: string;
    requester: SurgeApiClient;
}

interface RemoteSurgeEvaluateOutput {
    error?: unknown;
    response?: {
        status?: unknown;
        statusCode?: unknown;
        headers?: unknown;
        body?: unknown;
    };
    data?: unknown;
}

interface RemoteSurgeEvaluateResponse {
    output?: RemoteSurgeEvaluateOutput;
}

export class LandingApiClient {
    async lookup(_request: LandingApiRequest): Promise<GeoInfo> {
        throw new Error('LandingApiClient.lookup must be implemented');
    }
}

export class IpApiLandingClient extends LandingApiClient {
    async lookup(request: LandingApiRequest): Promise<GeoInfo> {
        const response = await request.requester.request({
            method: 'get',
            url: request.apiUrl,
            timeout: request.timeout,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
                accept: 'application/json',
            },
            node: request.node,
            'policy-descriptor': request.node,
        });
        return parseLandingResponse(response.body);
    }
}

export class SurgeApiClient {
    async request(_req: RuntimeRequest): Promise<RuntimeResponse> {
        throw new Error('SurgeApiClient.request must be implemented');
    }
}

export class NativeSurgeApiClient extends SurgeApiClient {
    async request(req: RuntimeRequest): Promise<RuntimeResponse> {
        return $substore.http.get(req);
    }
}

export class RemoteSurgeApiClient extends SurgeApiClient {
    private endpoint: string;
    private protocol: string;
    private key: string;

    constructor(endpoint: string, protocol: string, key: string) {
        super();
        this.endpoint = endpoint;
        this.protocol = protocol;
        this.key = key;
    }

    async request(req: RuntimeRequest): Promise<RuntimeResponse> {
        const timeoutMs = req.timeout || 5000;
        const surgeRequest: RuntimeRequest = {
            ...req,
            timeout: timeoutMs / 1000,
        };
        const evaluateScript =
            `$httpClient.get(${JSON.stringify(surgeRequest)}, ` +
            `(error, response, data) => { $done({ error, response, data }) })`;

        const response = await $substore.http.post({
            url: `${this.protocol}://${this.endpoint}/v1/scripting/evaluate`,
            timeout: timeoutMs,
            headers: {
                ...(this.key ? { 'X-Key': this.key } : {}),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                script_text: evaluateScript,
                mock_type: 'cron',
                timeout: timeoutMs / 1000,
            }),
        });

        const parsed = safeJsonParse<RemoteSurgeEvaluateResponse>(response.body) || {};
        const output = isRecord(parsed.output) ? parsed.output : {};
        if (output.error) {
            throw new Error(`surge evaluate error: ${String(output.error)}`);
        }

        const responseObject = isRecord(output.response) ? output.response : {};
        const statusCode = Number(responseObject.statusCode || responseObject.status);
        const headers = isRecord(responseObject.headers)
            ? (responseObject.headers as Record<string, string | string[] | undefined>)
            : {};
        const data = typeof output.data === 'string'
            ? output.data
            : typeof responseObject.body === 'string'
                ? responseObject.body
                : '';

        return {
            statusCode: Number.isFinite(statusCode) ? statusCode : 200,
            headers,
            body: data,
        };
    }
}

export function parseLandingResponse(body: string): GeoInfo {
    const parsed = safeJsonParse<Record<string, unknown>>(body);
    if (isRecord(parsed)) {
        return {
            ip: String(parsed.query || ''),
            countryCode: normalizeCountryCode(parsed.countryCode),
            country: String(parsed.country || ''),
        };
    }
    const text = String(body || '').trim();
    return {
        ip: /^\d{1,3}(?:\.\d{1,3}){3}$/.test(text) ? text : '',
        countryCode: 'ZZ',
        country: '',
    };
}
