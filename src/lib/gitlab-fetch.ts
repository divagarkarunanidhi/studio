/**
 * Helpers for outbound HTTPS calls to GitLab when behind a corporate proxy.
 *
 * Corporate environments often perform TLS interception, which causes Node's
 * built-in fetch to fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. We support
 * two escape hatches:
 *
 *   1. Provide a custom CA bundle via the env var `NODE_EXTRA_CA_CERTS`
 *      (handled natively by Node — nothing to do here).
 *   2. Set `gitlabInsecureTls: true` in the app configuration (or
 *      `GITLAB_INSECURE_TLS=true` in the environment) to skip certificate
 *      verification entirely. **Only use this on trusted networks.**
 */
import { Agent, ProxyAgent, type Dispatcher } from 'undici';

let cachedInsecureAgent: Agent | null = null;
const cachedProxyAgents = new Map<string, ProxyAgent>();

function getInsecureAgent(): Agent {
    if (!cachedInsecureAgent) {
        cachedInsecureAgent = new Agent({
            connect: { rejectUnauthorized: false },
        });
    }
    return cachedInsecureAgent;
}

export interface GitlabFetchOptions {
    insecureTls?: boolean;
}

function getProxyUri(): string | undefined {
    return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
}

function getProxyAgent(proxyUri: string, insecureTls: boolean): ProxyAgent {
    const cacheKey = `${proxyUri}|insecure:${insecureTls}`;
    const cached = cachedProxyAgents.get(cacheKey);
    if (cached) return cached;

    const agent = new ProxyAgent({
        uri: proxyUri,
        requestTls: { rejectUnauthorized: !insecureTls },
    });
    cachedProxyAgents.set(cacheKey, agent);
    return agent;
}

/**
 * Returns a `dispatcher` to splice into a `fetch()` call when TLS verification
 * needs to be bypassed. Returns `undefined` to use the default dispatcher.
 */
export function getGitlabDispatcher(opts: GitlabFetchOptions = {}): Dispatcher | undefined {
    const envFlag = String(process.env.GITLAB_INSECURE_TLS || '').toLowerCase();
    const envInsecure = envFlag === 'true' || envFlag === '1' || envFlag === 'yes';
    const useInsecureTls = opts.insecureTls || envInsecure;

    const proxyUri = getProxyUri();
    if (proxyUri) {
        return getProxyAgent(proxyUri, useInsecureTls);
    }

    if (useInsecureTls) {
        return getInsecureAgent();
    }
    return undefined;
}
