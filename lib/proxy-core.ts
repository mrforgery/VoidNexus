import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ==========================================
// VOIDLOGIC NEXUS: PROXY FLEET COMMANDER
// ==========================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const getSupabase = () => {
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("FATAL: Supabase credentials missing. Proxy Commander offline.");
    }
    return createClient(supabaseUrl, supabaseKey);
};

// High-frequency, raw text proxy dumps (HTTP/HTTPS)
const PROXY_SOURCES = [
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt'
];

export interface ProxyNode {
    id: string; // ip:port
    ip: string;
    port: number;
    protocol: string;
    status: 'UNTESTED' | 'ACTIVE' | 'DEAD';
    latency: number | null;
    fail_count: number;
    last_tested: string;
}

export class ProxyCommander {
    
    // 1. SCRAPE RAW PROXIES
    public async scrapeSources(): Promise<string[]> {
        console.log(`[PROXY_CMD] Initiating scrape across ${PROXY_SOURCES.length} vectors...`);
        const rawProxies = new Set<string>();

        const fetchPromises = PROXY_SOURCES.map(async (url) => {
            try {
                const res = await axios.get(url, { timeout: 10000 });
                const lines = res.data.split('\n');
                
                // Regex to match valid IPv4:Port
                const proxyRegex = /^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/;
                
                lines.forEach((line: string) => {
                    const clean = line.trim();
                    if (proxyRegex.test(clean)) {
                        rawProxies.add(clean);
                    }
                });
            } catch (error) {
                console.warn(`[PROXY_CMD] Source failed: ${url}`);
            }
        });

        await Promise.allSettled(fetchPromises);
        console.log(`[PROXY_CMD] Harvested ${rawProxies.size} unique raw proxies.`);
        return Array.from(rawProxies);
    }

    // 2. VALIDATE A BATCH OF PROXIES CONCURRENTLY
    // We test against a fast, highly available endpoint (e.g., Cloudflare trace or httpbin)
    public async validateBatch(proxies: string[], concurrency = 50): Promise<ProxyNode[]> {
        console.log(`[PROXY_CMD] Validating batch of ${proxies.length} proxies...`);
        const results: ProxyNode[] = [];
        
        // Chunk array into concurrency limits to avoid memory/socket exhaustion
        for (let i = 0; i < proxies.length; i += concurrency) {
            const chunk = proxies.slice(i, i + concurrency);
            
            const checks = chunk.map(async (proxyStr) => {
                const [ip, portStr] = proxyStr.split(':');
                const port = parseInt(portStr, 10);
                const startTime = Date.now();
                
                try {
                    const agent = new HttpsProxyAgent(`http://${proxyStr}`);
                    // 5-second timeout. If it's slower than 5s, it's garbage for our engine.
                    await axios.get('https://1.1.1.1/cdn-cgi/trace', {
                        httpsAgent: agent,
                        timeout: 5000,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    
                    const latency = Date.now() - startTime;
                    return {
                        id: proxyStr,
                        ip,
                        port,
                        protocol: 'http',
                        status: 'ACTIVE' as const,
                        latency,
                        fail_count: 0,
                        last_tested: new Date().toISOString()
                    };
                } catch (error) {
                    return {
                        id: proxyStr,
                        ip,
                        port,
                        protocol: 'http',
                        status: 'DEAD' as const,
                        latency: null,
                        fail_count: 1,
                        last_tested: new Date().toISOString()
                    };
                }
            });

            const chunkResults = await Promise.all(checks);
            results.push(...chunkResults);
        }

        return results;
    }

    // 3. SYNC TO DATABASE
    public async syncToDatabase(nodes: ProxyNode[]) {
        const supabase = getSupabase();
        
        // Upsert in chunks of 1000 to respect Supabase limits
        const chunkSize = 1000;
        for (let i = 0; i < nodes.length; i += chunkSize) {
            const chunk = nodes.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('nexus_proxies')
                .upsert(chunk, { onConflict: 'id' });
                
            if (error) {
                console.error(`[PROXY_CMD] DB Sync Error:`, error.message);
            }
        }
        console.log(`[PROXY_CMD] Synced ${nodes.length} proxies to database.`);
    }

    // 4. GET BEST PROXY (For the Hunter Engine)
    public async getOptimalProxy(): Promise<ProxyNode | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('nexus_proxies')
            .select('*')
            .eq('status', 'ACTIVE')
            .order('latency', { ascending: true })
            .limit(1)
            .single();

        if (error || !data) return null;
        return data as ProxyNode;
    }
}
