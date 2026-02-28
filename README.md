# VOIDLOGIC NEXUS: ARBITRAGE ENGINE

## TECH STACK
* Frontend/Framework: Next.js 15+ (App Router, Server Actions)
* Deployment: Vercel Edge Network
* Database: Supabase (PostgreSQL with pgvector for semantic matching)
* Autonomous Execution: LangGraph / Vercel AI SDK
* Scraping/Proxies: BrightData Residential Proxies

## CORE MODULES
1. **The Hunter Engine (`lib/nexus-engine.ts`)**: The backend daemon. It hits public APIs (eBay, Craigslist) and private/authenticated APIs (SalvageReseller). It evaluates items against a strict 1-5 condition scale and cross-references a hardcoded Top 100 Designer Brand list.
2. **The Control Panel (`app/page.tsx`)**: Mobile-first, glassmorphic UI optimized for Android. Real-time SVG pulse indicators, autonomous toggle switches, and a live terminal feed of the engine's cognitive process.

## REQUIRED EXTERNAL RESOURCES
* [Next.js Documentation](https://nextjs.org/docs)
* [Supabase Vector DB Setup](https://supabase.com/docs/guides/ai/vector-columns)
* [BrightData Proxy Network](https://brightdata.com/)
* [OpenAI API Keys](https://platform.openai.com/)

---

## SUPABASE DB SCHEMA
Copy and paste this directly into your Supabase SQL Editor:

```sql
-- Enable pgvector for future semantic matching
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. THE SIGNALS TABLE (The Arbitrage Targets)
CREATE TABLE IF NOT EXISTS public.nexus_signals (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "brandCategory" TEXT NOT NULL,
    "conditionScore" INTEGER CHECK ("conditionScore" >= 1 AND "conditionScore" <= 5) NOT NULL,
    "listedPrice" NUMERIC(10, 2) NOT NULL,
    "estimatedValue" NUMERIC(10, 2) NOT NULL,
    "profitMargin" NUMERIC(10, 2) NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'REJECTED')),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2. THE REAPER LOGS (Engine Telemetry)
CREATE TABLE IF NOT EXISTS public.nexus_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level TEXT DEFAULT 'INFO' CHECK (level IN ('INFO', 'WARN', 'ERROR', 'CRITICAL')),
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 3. THE PROXY FLEET (Node Registry)
CREATE TABLE IF NOT EXISTS public.nexus_proxies (
    id TEXT PRIMARY KEY, -- ip:port
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    latency INTEGER,
    status TEXT DEFAULT 'UNTESTED' CHECK (status IN ('UNTESTED', 'ACTIVE', 'DEAD')),
    fail_count INTEGER DEFAULT 0,
    last_tested TIMESTAMPTZ
);

-- 4. REALTIME CONFIGURATION
ALTER PUBLICATION supabase_realtime ADD TABLE public.nexus_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nexus_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nexus_proxies;

-- 5. RLS POLICIES
ALTER TABLE public.nexus_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_proxies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.nexus_signals FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.nexus_logs FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.nexus_proxies FOR SELECT USING (true);
CREATE POLICY "Enable insert for service role only" ON public.nexus_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for service role only" ON public.nexus_signals FOR UPDATE USING (true);
CREATE POLICY "Enable insert for service role only" ON public.nexus_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable all for service role only" ON public.nexus_proxies FOR ALL USING (true);
```
