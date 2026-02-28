import { NextResponse } from 'next/server';
import { NexusHunter } from '@/lib/nexus-engine';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// VOIDLOGIC NEXUS: SWEEP EXECUTION ROUTE
// ==========================================

export const runtime = 'nodejs'; // Node.js required for Playwright
export const maxDuration = 60;
export const dynamic = 'force-dynamic'; // Never cache this route

export async function POST(request: Request) {
    const startTime = Date.now();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    // Failsafe check
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json(
            { error: 'CRITICAL: Database connection severed. Check env vars.' },
            { status: 500 }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Authenticate the request (Basic barrier to keep out unauthorized bots)
        const authHeader = request.headers.get('authorization');
        const expectedKey = process.env.NEXT_PUBLIC_NEXUS_GOD_MODE_KEY || 'demo-key';
        if (authHeader !== `Bearer ${expectedKey}`) {
            await supabase.from('nexus_logs').insert({
                level: 'WARN',
                message: 'Unauthorized sweep attempt blocked.',
                timestamp: new Date().toISOString()
            });
            return NextResponse.json({ error: 'UNAUTHORIZED_ACCESS' }, { status: 401 });
        }

        // Initialize the Hunter
        const engine = new NexusHunter();
        
        // Log engine spin-up
        await supabase.from('nexus_logs').insert({
            level: 'INFO',
            message: 'Manual sweep initiated via Control Center.',
            timestamp: new Date().toISOString()
        });

        // Execute the dependency trace and scrape
        const signals = await engine.runSweep();

        const executionTime = Date.now() - startTime;

        return NextResponse.json({
            status: 'SWEEP_COMPLETE',
            signalsFound: signals.length,
            executionTimeMs: executionTime,
            data: signals
        }, { status: 200 });

    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown fatal error in Edge Route';
        
        // Exhaustive error logging to the DB
        await supabase.from('nexus_logs').insert({
            level: 'CRITICAL',
            message: `API Route Crash: ${errorMsg}`,
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({
            error: 'ENGINE_FAILURE',
            details: errorMsg
        }, { status: 500 });
    }
}
