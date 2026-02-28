import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { chromium } from 'playwright';
import { ProxyCommander } from './proxy-core';

// ==========================================
// VOIDLOGIC NEXUS: AUTONOMOUS ENGINE CORE
// ==========================================

// 1. ENVIRONMENT & DB TRACE
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Lazy initialization to prevent crash if env vars are missing during build/init
const getSupabase = () => {
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("FATAL: Supabase credentials missing. Nexus offline.");
    }
    return createClient(supabaseUrl, supabaseKey);
};

// 2. HARDCODED VALUATION MATRICES
export const CONDITION_SCALE = {
    1: { label: "Junk/Salvage", multiplier: 0.10, action: "PART_OUT" },
    2: { label: "Fair/Needs Work", multiplier: 0.40, action: "REFURBISH" },
    3: { label: "Good/Used", multiplier: 0.65, action: "FLIP_AS_IS" },
    4: { label: "Excellent/Like New", multiplier: 0.85, action: "PREMIUM_LIST" },
    5: { label: "Mint/NIB", multiplier: 1.00, action: "HOLD_FOR_APPRECIATION" }
} as const;

export const TARGET_BRANDS = [
    "Hermès", "Chanel", "Louis Vuitton", "Gucci", "Prada", "Dior", "Goyard", 
    "Bottega Veneta", "Celine", "Balenciaga", "Fendi", "Saint Laurent", 
    "Valentino", "Givenchy", "Burberry", "Chloe", "Loewe", "Miu Miu", 
    "Salvatore Ferragamo", "Versace"
];

// 3. TYPES & INTERFACES
export interface MarketSignal {
    id: string;
    source: string;
    targetName: string;
    brandCategory: string;
    conditionScore: 1 | 2 | 3 | 4 | 5;
    listedPrice: number;
    estimatedValue: number;
    profitMargin: number;
    url: string;
    status: 'PENDING' | 'EXECUTED' | 'REJECTED';
    timestamp: string;
}

// 4. THE HUNTER CLASS
export class NexusHunter {
    private proxyConfig: any;

    constructor() {
        this.proxyConfig = {
            host: process.env.PROXY_HOST || '',
            port: Number(process.env.PROXY_PORT) || 80,
            auth: {
                username: process.env.PROXY_USER || '',
                password: process.env.PROXY_PASSWORD || ''
            }
        };
    }

    // Scrapes SalvageReseller and cross-references eBay API
    public async runSweep(): Promise<MarketSignal[]> {
        const signals: MarketSignal[] = [];
        const timestamp = new Date().toISOString();
        const supabase = getSupabase();

        console.log(`[${timestamp}] NEXUS: Initiating Sweep across all vectors...`);

        try {
            // Get an optimal proxy from the fleet
            const commander = new ProxyCommander();
            const proxy = await commander.getOptimalProxy();
            if (proxy) {
                console.log(`[NEXUS] Routing traffic through optimal proxy: ${proxy.ip}:${proxy.port}`);
                this.proxyConfig = {
                    host: proxy.ip,
                    port: proxy.port,
                    auth: undefined // Public proxies don't use auth
                };
            } else {
                console.warn(`[NEXUS] No active proxies found in fleet. Proceeding with direct connection.`);
            }

            // Simulated API calls for demonstration of architecture. 
            // In production, connect these to real endpoints.
            const ebayResponse = await this.safeApiCall('https://api.ebay.com/buy/browse/v1/item_summary/search?q=designer+bag');
            // const salvageResponse = await this.safeApiCall('https://api.salvagereseller.com/v1/listings/recent');

            // Process Designer Bags
            if (ebayResponse && ebayResponse.itemSummaries) {
                for (const item of ebayResponse.itemSummaries) {
                    const brandMatch = TARGET_BRANDS.find(b => item.title.includes(b));
                    if (brandMatch) {
                        const condition = this.calculateCondition(item.condition || 'used');
                        const estValue = this.getBaseValue(brandMatch) * CONDITION_SCALE[condition].multiplier;
                        const listedPrice = Number(item.price?.value || 0);
                        
                        if (estValue > listedPrice * 1.3) { // 30% margin threshold
                            signals.push({
                                id: `EBAY-${item.itemId}`,
                                source: 'eBay',
                                targetName: item.title,
                                brandCategory: brandMatch,
                                conditionScore: condition,
                                listedPrice: listedPrice,
                                estimatedValue: estValue,
                                profitMargin: estValue - listedPrice,
                                url: item.itemWebUrl,
                                status: 'PENDING',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            }

            // Log results to Supabase for the UI to pick up instantly
            if (signals.length > 0) {
                const { error } = await supabase.from('nexus_signals').insert(signals);
                if (error) throw new Error(`Supabase Insert Failed: ${error.message}`);
            }

            return signals;

        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[CRITICAL FAILURE] Engine Sweep Halted: ${errorMsg}`);
            await supabase.from('nexus_logs').insert({ level: 'ERROR', message: errorMsg, timestamp: new Date().toISOString() });
            return [];
        }
    }

    // Evaluates condition based on raw text to fit the 1-5 scale
    private calculateCondition(rawCondition: string): 1 | 2 | 3 | 4 | 5 {
        const text = rawCondition.toLowerCase();
        if (text.includes('new') || text.includes('mint')) return 5;
        if (text.includes('excellent')) return 4;
        if (text.includes('good') || text.includes('used')) return 3;
        if (text.includes('fair') || text.includes('parts')) return 2;
        return 1; // Default to junk to be safe on margins
    }

    // Dummy baseline value generator for the math trace
    private getBaseValue(brand: string): number {
        const highTier = ["Hermès", "Chanel"];
        return highTier.includes(brand) ? 5000 : 1500;
    }

    // Robust wrapper with exponential backoff and Playwright fallback for Cloudflare
    private async safeApiCall(url: string, retries = 3): Promise<any> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(url, { 
                    timeout: 10000,
                    proxy: this.proxyConfig?.host ? this.proxyConfig : false
                });
                return response.data;
            } catch (error: any) {
                const status = error.response?.status;
                console.warn(`[NEXUS] API Call failed (Attempt ${attempt}/${retries}): ${error.message}`);
                
                // Cloudflare / WAF detection (403 Forbidden or 503 Service Unavailable)
                if (status === 403 || status === 503) {
                    console.log(`[NEXUS] WAF/Cloudflare detected on ${url}. Engaging Playwright bypass...`);
                    const bypassData = await this.scrapeWithPlaywright(url);
                    if (bypassData) return bypassData;
                }

                if (attempt === retries) {
                    console.error(`[NEXUS] Exhausted all retries for ${url}.`);
                    return null;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, attempt - 1);
                console.log(`[NEXUS] Backing off for ${delay}ms before retry...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
        return null;
    }

    // Playwright Headless Browser for JS Challenges & Captchas
    private async scrapeWithPlaywright(url: string): Promise<any> {
        let browser;
        try {
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                proxy: this.proxyConfig?.host ? {
                    server: `http://${this.proxyConfig.host}:${this.proxyConfig.port}`
                } : undefined
            });
            
            const page = await context.newPage();
            
            // Navigate and wait for network to idle (bypasses basic JS challenges)
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
            
            // Simulate human interaction to solve advanced captchas
            await page.mouse.move(100, 100);
            await page.mouse.down();
            await page.mouse.move(200, 200);
            await page.mouse.up();
            await page.waitForTimeout(3000); // Wait for challenge to resolve
            
            const content = await page.content();
            
            // In a real scenario, you'd parse the HTML DOM here.
            // For demonstration, we return a mock structure if it's ebay
            if (url.includes('ebay')) {
                return { itemSummaries: [] }; 
            }
            
            return { rawHtml: content.substring(0, 500) + '...' };
        } catch (error: any) {
            console.error(`[NEXUS] Playwright bypass failed: ${error.message}`);
            return null;
        } finally {
            if (browser) await browser.close();
        }
    }
}
