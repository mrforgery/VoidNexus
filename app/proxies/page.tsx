'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Zap, Target, Terminal, Server, Activity, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// ==========================================
// VOIDLOGIC NEXUS: PROXY FLEET COMMANDER UI
// ==========================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const getSupabase = () => {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
};

interface ProxyNode {
  id: string;
  ip: string;
  port: number;
  protocol: string;
  status: 'UNTESTED' | 'ACTIVE' | 'DEAD';
  latency: number | null;
  fail_count: number;
  last_tested: string;
}

export default function ProxyCommanderDashboard() {
  const [proxies, setProxies] = useState<ProxyNode[]>([]);
  const [systemStatus, setSystemStatus] = useState<'IDLE' | 'SYNCING' | 'OFFLINE'>('IDLE');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      addLog("ERROR: Supabase credentials missing.");
      setSystemStatus('OFFLINE');
      return;
    }

    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from('nexus_proxies')
        .select('*')
        .order('last_tested', { ascending: false })
        .limit(50);
      
      if (error) {
        if (error.message.includes('Could not find the table')) {
          addLog(`SETUP REQUIRED: Run the SQL schema in Supabase to create 'nexus_proxies' table.`);
        } else {
          addLog(`FETCH_ERROR: ${error.message}`);
        }
      } else if (data) {
        setProxies(data);
        addLog(`Loaded ${data.length} proxy nodes from fleet.`);
      }
    };

    fetchInitial();

    const channel = supabase.channel('realtime:nexus_proxies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nexus_proxies' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          setProxies((current) => {
            const existingIndex = current.findIndex(p => p.id === payload.new.id);
            if (existingIndex > -1) {
              const updated = [...current];
              updated[existingIndex] = payload.new as ProxyNode;
              return updated.sort((a, b) => new Date(b.last_tested).getTime() - new Date(a.last_tested).getTime()).slice(0, 50);
            }
            return [payload.new as ProxyNode, ...current].slice(0, 50);
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const triggerProxySync = async () => {
    setSystemStatus('SYNCING');
    addLog("Initiating Proxy Fleet Sync Protocol...");
    
    try {
      const response = await fetch('/api/proxies/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_NEXUS_GOD_MODE_KEY || 'demo-key'}`
        }
      });
      
      const result = await response.json();
      if (response.ok) {
        addLog(`Sync complete. Scraped ${result.scrapedTotal}, Tested ${result.tested}, Found ${result.activeFound} ACTIVE.`);
      } else {
        addLog(`Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      addLog("Sync execution error. Check connection.");
    } finally {
      setSystemStatus('IDLE');
    }
  };

  const activeProxies = proxies.filter(p => p.status === 'ACTIVE');
  const deadProxies = proxies.filter(p => p.status === 'DEAD');

  return (
    <div className="min-h-screen bg-[#050505] text-cyan-500 font-mono p-4 selection:bg-cyan-900/30 overflow-x-hidden">
      
      {/* HEADER & INDICATORS */}
      <header className="flex justify-between items-center border-b border-cyan-900/50 pb-4 mb-6">
        <div>
          <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors mb-2 text-[10px] uppercase font-bold">
            <ArrowLeft className="w-3 h-3" /> Back to Nexus Core
          </Link>
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold tracking-tighter text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]"
          >
            PROXY_FLEET_CMD
          </motion.h1>
          <p className="text-[10px] text-cyan-800 mt-1 uppercase tracking-widest">v1.0 // Node Validation Matrix</p>
        </div>
        
        <div className="flex items-center gap-3 bg-cyan-950/20 px-3 py-1.5 rounded-full border border-cyan-900/30">
          <span className="text-[10px] font-bold tracking-tighter">{systemStatus}</span>
          <div className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus === 'SYNCING' ? 'bg-amber-500' : 'bg-cyan-500'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${systemStatus === 'SYNCING' ? 'bg-amber-600' : 'bg-cyan-600'}`}></span>
          </div>
        </div>
      </header>

      {/* METRICS PANEL */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
          <span className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Active Nodes</span>
          <span className="text-2xl font-black text-cyan-400">{activeProxies.length}</span>
        </div>
        <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center">
          <span className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Dead Nodes</span>
          <span className="text-2xl font-black text-red-500/70">{deadProxies.length}</span>
        </div>
      </div>

      {/* CONTROL PANEL */}
      <section className="bg-zinc-900/30 backdrop-blur-xl border border-white/5 rounded-2xl p-5 mb-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-zinc-500" />
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Fleet Operations</h2>
          </div>
        </div>

        <button 
          onClick={triggerProxySync}
          disabled={systemStatus === 'SYNCING'}
          className="group relative w-full overflow-hidden bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 font-black py-4 rounded-xl active:scale-[0.98] transition-all duration-200"
        >
          <div className="relative z-10 flex items-center justify-center gap-2">
            <Activity className={`w-4 h-4 ${systemStatus === 'SYNCING' ? 'animate-spin' : ''}`} />
            <span className="tracking-tighter uppercase">
              {systemStatus === 'SYNCING' ? 'Scraping & Validating...' : 'Initiate Fleet Sync'}
            </span>
          </div>
          <motion.div 
            className="absolute inset-0 bg-cyan-500/10"
            initial={{ x: '-100%' }}
            whileHover={{ x: '100%' }}
            transition={{ duration: 0.5 }}
          />
        </button>
      </section>

      {/* TERMINAL LOGS */}
      <section className="mb-6 bg-black/40 border border-cyan-900/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2 text-cyan-900">
          <Terminal className="w-3 h-3" />
          <span className="text-[9px] uppercase font-bold">Commander Telemetry</span>
        </div>
        <div className="space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="text-[10px] text-cyan-700/80 leading-tight">
              {log}
            </div>
          ))}
          {logs.length === 0 && <div className="text-[10px] text-cyan-900/50 italic">Awaiting fleet events...</div>}
        </div>
      </section>

      {/* LIVE PROXY FEED */}
      <section>
        <div className="flex items-center justify-between mb-4 border-b border-zinc-900 pb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-500" />
            <h2 className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Node Registry (Top 50)</h2>
          </div>
        </div>
        
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {proxies.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-zinc-800 text-xs py-10"
              >
                <span className="uppercase tracking-widest opacity-50">No nodes in registry. Initiate sync.</span>
              </motion.div>
            ) : (
              proxies.map((node) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={node.id} 
                  className="group bg-zinc-900/20 border border-white/5 p-3 rounded-xl flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${node.status === 'ACTIVE' ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-red-900/50'} opacity-50 group-hover:opacity-100 transition-opacity`} />
                  
                  <div className="flex justify-between items-start pl-2">
                    <div>
                      <span className="text-[10px] text-zinc-600 uppercase font-bold block mb-0.5">{node.protocol.toUpperCase()}</span>
                      <h3 className={`text-xs font-bold leading-tight ${node.status === 'ACTIVE' ? 'text-zinc-200' : 'text-zinc-600 line-through'}`}>{node.ip}:{node.port}</h3>
                    </div>
                    <div className="flex flex-col items-end">
                      {node.status === 'ACTIVE' && node.latency && (
                        <span className="text-[10px] font-black text-cyan-400 bg-cyan-950/40 px-2 py-1 rounded border border-cyan-500/20">
                          {node.latency}ms
                        </span>
                      )}
                      {node.status === 'DEAD' && (
                        <span className="text-[10px] font-black text-red-500 bg-red-950/40 px-2 py-1 rounded border border-red-500/20">
                          DEAD
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
