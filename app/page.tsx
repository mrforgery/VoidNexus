'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Zap, Target, Terminal, ExternalLink, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

// ==========================================
// VOIDLOGIC NEXUS: MOBILE CONTROL CENTER
// ==========================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Helper to get supabase client safely
const getSupabase = () => {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
};

interface Signal {
  id: string;
  targetName: string;
  profitMargin: number;
  conditionScore: number;
  listedPrice: number;
  status: string;
  source: string;
  timestamp: string;
}

export default function NexusDashboard() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isGodMode, setIsGodMode] = useState(false);
  const [systemStatus, setSystemStatus] = useState<'ONLINE' | 'HUNTING' | 'OFFLINE'>('ONLINE');
  const [logs, setLogs] = useState<string[]>([]);
  const [executing, setExecuting] = useState<Record<string, 'LOADING' | 'SUCCESS' | 'ERROR'>>({});

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
  };

  // Real-time Supabase Subscription Trace
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      addLog("ERROR: Supabase credentials missing.");
      setSystemStatus('OFFLINE');
      return;
    }

    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from('nexus_signals')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);
      
      if (error) {
        addLog(`FETCH_ERROR: ${error.message}`);
      } else if (data) {
        setSignals(data);
        addLog("Initial signals synchronized.");
      }
    };

    fetchInitial();

    const channel = supabase.channel('realtime:nexus_signals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nexus_signals' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setSignals((current) => [payload.new as Signal, ...current].slice(0, 10));
          addLog(`NEW_SIGNAL: ${payload.new.targetName} detected.`);
          
          // GOD MODE: Auto-execute if enabled
          if (isGodMode && payload.new.status === 'PENDING') {
            addLog(`[GOD MODE] Auto-executing target ${payload.new.id}...`);
            executeTarget(payload.new.id, payload.new.listedPrice);
          }
        } else if (payload.eventType === 'UPDATE') {
          setSignals((current) => current.map(sig => sig.id === payload.new.id ? payload.new as Signal : sig));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const executeTarget = async (signalId: string, price: number) => {
    setExecuting(prev => ({ ...prev, [signalId]: 'LOADING' }));
    addLog(`Initiating checkout sequence for ${signalId}...`);
    
    try {
      const response = await fetch('/api/nexus/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_NEXUS_GOD_MODE_KEY || 'demo-key'}`
        },
        body: JSON.stringify({ signalId, price })
      });
      
      const result = await response.json();
      if (response.ok && result.status === 'SUCCESS') {
        setExecuting(prev => ({ ...prev, [signalId]: 'SUCCESS' }));
        addLog(`[SUCCESS] Target ${signalId} acquired. TX: ${result.transactionId}`);
      } else {
        setExecuting(prev => ({ ...prev, [signalId]: 'ERROR' }));
        addLog(`[ERROR] Checkout failed for ${signalId}: ${result.error}`);
      }
    } catch (err) {
      setExecuting(prev => ({ ...prev, [signalId]: 'ERROR' }));
      addLog(`[ERROR] Network failure during checkout for ${signalId}.`);
    }
  };

  const triggerManualSweep = async () => {
    setSystemStatus('HUNTING');
    addLog("Initiating manual sweep protocol...");
    
    try {
      const response = await fetch('/api/nexus/sweep', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_NEXUS_GOD_MODE_KEY || 'demo-key'}`
        }
      });
      
      const result = await response.json();
      if (response.ok) {
        addLog(`Sweep complete. Found ${result.signalsFound} targets.`);
      } else {
        addLog(`Sweep failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      addLog("Sweep execution error. Check connection.");
    } finally {
      setSystemStatus('ONLINE');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-emerald-500 font-mono p-4 selection:bg-emerald-900/30 overflow-x-hidden">
      
      {/* HEADER & INDICATORS */}
      <header className="flex justify-between items-center border-b border-emerald-900/50 pb-4 mb-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold tracking-tighter text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]"
          >
            VOIDLOGIC_NEXUS
          </motion.h1>
          <p className="text-[10px] text-emerald-800 mt-1 uppercase tracking-widest">v2.0 // Ouroboros Protocol</p>
        </div>
        
        <div className="flex items-center gap-3 bg-emerald-950/20 px-3 py-1.5 rounded-full border border-emerald-900/30">
          <span className="text-[10px] font-bold tracking-tighter">{systemStatus}</span>
          <div className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus === 'HUNTING' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${systemStatus === 'HUNTING' ? 'bg-red-600' : 'bg-emerald-600'}`}></span>
          </div>
        </div>
      </header>

      {/* CONTROL PANEL */}
      <section className="bg-zinc-900/30 backdrop-blur-xl border border-white/5 rounded-2xl p-5 mb-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-zinc-500" />
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Execution Matrix</h2>
          </div>
          
          <button 
            onClick={() => {
              setIsGodMode(!isGodMode);
              addLog(isGodMode ? "God Mode deactivated." : "GOD MODE ACTIVATED. AUTO-BUY ARMED.");
            }}
            className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all duration-500 uppercase tracking-tighter ${
              isGodMode 
                ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-400' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700'
            }`}
          >
            {isGodMode ? 'God Mode: Active' : 'Manual Review'}
          </button>
        </div>

        <button 
          onClick={triggerManualSweep}
          disabled={systemStatus === 'HUNTING'}
          className="group relative w-full overflow-hidden bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black py-4 rounded-xl active:scale-[0.98] transition-all duration-200"
        >
          <div className="relative z-10 flex items-center justify-center gap-2">
            <Zap className={`w-4 h-4 ${systemStatus === 'HUNTING' ? 'animate-spin' : ''}`} />
            <span className="tracking-tighter uppercase">
              {systemStatus === 'HUNTING' ? 'Executing Sweep...' : 'Initiate Market Sweep'}
            </span>
          </div>
          <motion.div 
            className="absolute inset-0 bg-emerald-500/10"
            initial={{ x: '-100%' }}
            whileHover={{ x: '100%' }}
            transition={{ duration: 0.5 }}
          />
        </button>
      </section>

      {/* TERMINAL LOGS */}
      <section className="mb-6 bg-black/40 border border-emerald-900/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2 text-emerald-900">
          <Terminal className="w-3 h-3" />
          <span className="text-[9px] uppercase font-bold">System Telemetry</span>
        </div>
        <div className="space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="text-[10px] text-emerald-700/80 leading-tight">
              {log}
            </div>
          ))}
          {logs.length === 0 && <div className="text-[10px] text-emerald-900/50 italic">Awaiting system events...</div>}
        </div>
      </section>

      {/* LIVE REAPER FEED */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b border-zinc-900 pb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-500" />
            <h2 className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Live Target Feed</h2>
          </div>
          <span className="text-[9px] text-zinc-600 uppercase">{signals.length} Active Signals</span>
        </div>
        
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {signals.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-zinc-800 text-xs py-16 flex flex-col items-center gap-3"
              >
                <div className="w-12 h-12 rounded-full border border-zinc-900 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 opacity-20" />
                </div>
                <span className="uppercase tracking-widest opacity-50">Awaiting market signals...</span>
              </motion.div>
            ) : (
              signals.map((sig) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={sig.id} 
                  className="group bg-zinc-900/20 border border-white/5 p-4 rounded-2xl flex flex-col gap-3 relative overflow-hidden active:bg-zinc-900/40 transition-colors"
                >
                  {/* Condition Indicator Bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] opacity-0 group-hover:opacity-100 transition-opacity`} />
                  
                  <div className="flex justify-between items-start">
                    <div className="w-3/4">
                      <span className="text-[10px] text-zinc-600 uppercase font-bold block mb-1">{sig.source} {'//'} {sig.id}</span>
                      <h3 className="text-xs font-bold text-zinc-200 leading-tight line-clamp-2">{sig.targetName}</h3>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-black text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-500/20">
                        +${sig.profitMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-end mt-1">
                    <div className="flex gap-3 text-[9px] text-zinc-500 uppercase font-bold">
                      <span className="flex items-center gap-1">
                        <span className="text-emerald-500">COND:</span> {sig.conditionScore}/5
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-emerald-500">STATUS:</span> {sig.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => executeTarget(sig.id, sig.listedPrice)}
                        disabled={sig.status === 'EXECUTED' || executing[sig.id] === 'LOADING' || executing[sig.id] === 'SUCCESS'}
                        className={`border text-[10px] font-black px-4 py-1.5 rounded-lg transition-all uppercase tracking-tighter flex items-center gap-1 ${
                          sig.status === 'EXECUTED' || executing[sig.id] === 'SUCCESS'
                            ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed'
                            : executing[sig.id] === 'ERROR'
                            ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 active:scale-95'
                        }`}
                      >
                        {executing[sig.id] === 'LOADING' ? (
                          <><Zap className="w-3 h-3 animate-spin" /> Executing...</>
                        ) : executing[sig.id] === 'SUCCESS' || sig.status === 'EXECUTED' ? (
                          'Acquired'
                        ) : executing[sig.id] === 'ERROR' ? (
                          'Retry'
                        ) : (
                          'Execute'
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* EXTERNAL RESOURCES PANEL */}
      <footer className="mt-12 pt-6 border-t border-zinc-900/50 text-center pb-8">
        <h3 className="text-[9px] text-zinc-700 mb-4 uppercase tracking-[0.3em] font-black">Nexus Routing Links</h3>
        <div className="flex justify-center gap-6 text-[10px] font-bold uppercase tracking-tighter">
          <Link href="/proxies" className="text-cyan-500 hover:text-cyan-400 transition-colors drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">Proxy Fleet CMD</Link>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-500 transition-colors">Supabase</a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-500 transition-colors">Vercel</a>
          <a href="https://www.salvagereseller.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-500 transition-colors">Salvage</a>
        </div>
      </footer>
    </div>
  );
}
