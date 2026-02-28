import { NextResponse } from 'next/server';
import { ProxyCommander } from '@/lib/proxy-core';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// VOIDLOGIC NEXUS: PROXY FLEET SYNC ROUTE
// ==========================================

export const runtime = 'nodejs'; // Node.js runtime for longer execution
export const maxDuration = 60; // 60 seconds max execution (Vercel Hobby limit)
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const startTime = Date.now();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'CRITICAL: Database connection severed.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const authHeader = request.headers.get('authorization');
        const expectedKey = process.env.NEXT_PUBLIC_NEXUS_GOD_MODE_KEY || 'demo-key';
        if (authHeader !== `Bearer ${expectedKey}`) {
            return NextResponse.json({ error: 'UNAUTHORIZED_ACCESS' }, { status: 401 });
        }

        const commander = new ProxyCommander();
        
        // 1. Scrape raw text dumps
        const rawProxies = await commander.scrapeSources();
        
        // 2. Validate a subset (e.g., 200 random proxies) to avoid Vercel timeouts
        // In a real production environment, you'd queue these in a background worker (e.g., Inngest/Upstash)
        const sampleSize = 200;
        const shuffled = rawProxies.sort(() => 0.5 - Math.random());
        const targetBatch = shuffled.slice(0, sampleSize);
        
        // 3. Concurrently test the batch (50 at a time)
        const validatedNodes = await commander.validateBatch(targetBatch, 50);
        
        // 4. Sync results to Supabase
        await commander.syncToDatabase(validatedNodes);

        const activeCount = validatedNodes.filter(n => n.status === 'ACTIVE').length;
        const executionTime = Date.now() - startTime;

        await supabase.from('nexus_logs').insert({
            level: 'INFO',
            message: `Proxy Fleet Sync: Scraped ${rawProxies.length}, Tested ${sampleSize}, Found ${activeCount} ACTIVE.`,
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({
            status: 'SYNC_COMPLETE',
            scrapedTotal: rawProxies.length,
            tested: sampleSize,
            activeFound: activeCount,
            executionTimeMs: executionTime
        }, { status: 200 });

    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown fatal error in Proxy Route';
        await supabase.from('nexus_logs').insert({
            level: 'ERROR',
            message: `Proxy Sync Crash: ${errorMsg}`,
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({ error: 'COMMANDER_FAILURE', details: errorMsg }, { status: 500 });
    }
}
