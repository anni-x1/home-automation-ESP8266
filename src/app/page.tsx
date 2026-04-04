"use client";
/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { translations } from "./translations";

const BASE = "/api/blynk/update";

const defaultMap: Record<string, number> = {
  r0: 1,  // Bedroom lights
  r1: 9,  // Bedroom fan
  r2: 2,  // Balcony lights
  r3: 10, // Hall fan
  r4: 3,  // Hall light
  r5: 5,  // Kitchen lights
  r6: 13, // Kitchen fan
  r7: 8,  // Bathroom lights
  r8: 11, // Fridge
  r9: 12, // AC
  r10: 14,// Water pump
  r11: 15 // Spare relay
};

const APPLIANCE = [
  [60, 1.00],  // r0  Bedroom Lights (V1)
  [65, 0.80],  // r1  Bedroom Fan (V9)
  [15, 1.00],  // r2  Balcony Lights (V2)
  [65, 0.80],  // r3  Hall Fan (V10)
  [40, 1.00],  // r4  Hall Light (V3)
  [40, 1.00],  // r5  Kitchen Lights (V5)
  [55, 0.80],  // r6  Kitchen Fan (V13)
  [15, 1.00],  // r7  Bathroom Lights (V8)
  [150, 0.85], // r8  Fridge (V11)
  [1500, 0.85], // r9  AC 1.5-ton (V12)
  [750, 0.80], // r10 Water Pump (V14)
  [60, 1.00],  // r11 spare (V15)
];

const ROOMS = [
  { name: 'Bedroom', ids: [0, 1], icon: '🛏️' },
  { name: 'Hall', ids: [3, 4, 2], icon: '🛋️' },
  { name: 'Kitchen', ids: [5, 6, 8], icon: '🍳' },
  { name: 'Utilities', ids: [7, 9, 10, 11], icon: '⚙️' }
];

export default function Home() {
  const [currentTab, setCurrentTab] = useState<'home' | 'settings'>('home');
  const [lang, setLang] = useState<"en" | "gu" | "hi">("en");
  const [mounted, setMounted] = useState(false);
  const t = translations[lang];

  // Config State
  const [relayMap, setRelayMap] = useState<Record<string, number>>(defaultMap);
  const [editMap, setEditMap] = useState<Record<string, number>>({});

  const [relayState, setRelayState] = useState<boolean[]>(new Array(16).fill(false));
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [doorOpen, setDoorOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [vLog, setVLog] = useState<string | React.ReactNode>("");
  const [toast, setToast] = useState({ msg: "", isErr: false, show: false });

  const [meter, setMeter] = useState({
    voltage: 230.0, current: 0.0, power: 0.0, powerStr: "0.0", powerUnit: "W", pf: "0.00", pfPct: 0
  });

  const applianceNames = React.useMemo(() => [
    t.bedroomLights, t.bedroomFan, t.balconyLights, t.hallFan,
    t.hallLight, t.kitchenLights, t.kitchenFan, t.bathroomLights,
    t.fridge, t.ac, t.waterPump, t.spareRelay
  ], [t]);

  const SCENES = React.useMemo(() => [
    { key: 'sleep', label: t.sleepMode, icon: '🌙', color: 'glow-purple', pins: [] },
    { key: 'welcome', label: t.welcomeMode, icon: '🏠', color: 'glow-blue', pins: [0, 2, 4, 5] },
    { key: 'full', label: t.fullPower, icon: '⚡', color: 'glow-orange', pins: [0,1,2,3,4,5,6,7,8,9,10,11] },
    { key: 'off', label: t.modeOff || 'Mode Off', icon: '🛑', color: 'glow-red', pins: 'off' }
  ], [t]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<any>(null);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Load configuration on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('lumina_relay_map');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRelayMap(parsed);
        setEditMap(parsed);
      } catch (e) {}
    } else {
      setEditMap(defaultMap);
    }
  }, []);

  const saveRelayMap = () => {
    setRelayMap(editMap);
    localStorage.setItem('lumina_relay_map', JSON.stringify(editMap));
    showToast("Pin Mapping Saved!");
    setCurrentTab('home');
  };

  const initAudio = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
  };

  const showToast = (msg: string, isErr = false) => {
    setToast({ msg, isErr, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const playClick = (isOn: boolean) => {
    initAudio();
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const tm = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(isOn ? 150 : 100, tm);
    o.frequency.exponentialRampToValueAtTime(1, tm + 0.1);
    g.gain.setValueAtTime(0.1, tm);
    g.gain.exponentialRampToValueAtTime(0.01, tm + 0.1);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(tm + 0.1);
  };

  const blynkSet = async (p: number, v: number) => {
    try {
      const res = await fetch(`${BASE}?v${p}=${v}`);
      if (!res.ok) showToast(`Blynk Error V${p}`, true);
    } catch { showToast("Network Error", true); }
  };

  const speak = (text: string) => {
    if (!isVoiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (preferredVoiceRef.current) u.voice = preferredVoiceRef.current;
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  };

  const handleSetRelay = (i: number, on: boolean, silent = false) => {
    setRelayState(prev => { const n = [...prev]; n[i] = on; return n; });
    blynkSet(relayMap[`r${i}`] ?? i, on ? 1 : 0);
    if (!silent) {
      playClick(on);
      const act = on ? (lang === "en" ? "On" : "ચાલુ") : (lang === "en" ? "Off" : "બંધ");
      speak(lang === "en" ? `${applianceNames[i]} is now ${act}` : `${applianceNames[i]} ${act}`);
      showToast(`${applianceNames[i]} → ${on ? "ON" : "OFF"}`);
    }
  };

  const handleDoor = (open: boolean) => {
    blynkSet(relayMap['door'] ?? 16, open ? 120 : 0);
    setDoorOpen(open);
    playClick(open);
    const act = open ? (lang === "en" ? "Opening" : "ખુલ્લો") : (lang === "en" ? "Closing" : "બંધ");
    speak(lang === "en" ? `${act} the door` : `દરવાજો ${act}`);
    showToast(`Door → ${open ? "OPEN" : "CLOSED"}`);
  };

  const handleScene = (scene: any) => {
    if (scene.pins === 'off') {
      setActiveScene(null);
      playClick(false);
      speak(lang === "en" ? "Scene mode turned off. Manual control is active." : "સીન મોડ બંધ થયો. મેન્યુઅલ કંટ્રોલ ચાલુ છે.");
      showToast("Manual Mode Active");
      return;
    }
    const onSet = new Set(scene.pins);
    setRelayState(prev => prev.map((_, i) => onSet.has(i)));
    setActiveScene(scene.key);
    for (let i = 0; i < 12; i++) blynkSet(relayMap[`r${i}`] ?? i, onSet.has(i) ? 1 : 0);
    playClick(true);
    speak(lang === "en" ? `${scene.label} activated` : `${scene.label} ચાલુ`);
    showToast(`${scene.label} Activated`);
  };

  const processCmd = useCallback((raw: string) => {
    const cmd = raw.toLowerCase().trim();
    const log = (msg: string, color = 'text-accent-blue') => setVLog(<span className={color}>{msg}</span>);

    // Intent detection (loose)
    const isOn = cmd.includes('on') || cmd.includes('chalu') || cmd.includes('open') || cmd.includes('kholo') || cmd.includes('jalao') || cmd.includes('start');
    const isOff = cmd.includes('off') || cmd.includes('bandh') || cmd.includes('close') || cmd.includes('stop') || cmd.includes('bujhao');
    
    if (!isOn && !isOff) return false;
    const intent = isOn; // true for ON, false for OFF

    // Door check
    if (cmd.includes('door') || cmd.includes('darvajo') || cmd.includes('darvaja') || cmd.includes('entrance')) {
      handleDoor(intent);
      log(`✓ Door ${intent ? 'Opened' : 'Closed'}`);
      return true;
    }

    // Group commands: ALL LIGHTS
    if (cmd.includes('all light') || cmd.includes('badhi light') || cmd.includes('sab light') || cmd.includes('every light')) {
      const lights = [0, 2, 4, 5, 7];
      lights.forEach(idx => handleSetRelay(idx, intent, true));
      const talkback = {
        en: `Turning ${intent ? 'on' : 'off'} all lights`,
        gu: `બધી લાઇટો ${intent ? 'ચાલુ' : 'બંધ'}`,
        hi: `सभी लाइटें ${intent ? 'चालू' : 'बंद'} कर दी गई हैं`
      };
      speak(talkback[lang]);
      log(`✓ All Lights ${intent ? 'ON' : 'OFF'}`);
      return true;
    }

    // Group commands: ALL FANS
    if (cmd.includes('all fan') || cmd.includes('badha pankha') || cmd.includes('sab pankhe') || cmd.includes('every fan')) {
      const fans = [1, 3, 6];
      fans.forEach(idx => handleSetRelay(idx, intent, true));
      const talkback = {
        en: `Turning ${intent ? 'on' : 'off'} all fans`,
        gu: `બધા પંખા ${intent ? 'ચાલુ' : 'બંધ'}`,
        hi: `सभी पंखे ${intent ? 'चालू' : 'बंद'} कर दिए गए हैं`
      };
      speak(talkback[lang]);
      log(`✓ All Fans ${intent ? 'ON' : 'OFF'}`);
      return true;
    }

    // Group commands: ALL APPLIANCES
    if (cmd.includes('all appliance') || cmd.includes('everything') || cmd.includes('badhu') || cmd.includes('sab kuch')) {
      const apps = [8, 9, 10, 11];
      apps.forEach(idx => handleSetRelay(idx, intent, true));
      const talkback = {
        en: `Turning ${intent ? 'on' : 'off'} all appliances`,
        gu: `બધા સાધનો ${intent ? 'ચાલુ' : 'બંધ'}`,
        hi: `सभी उपकरण ${intent ? 'चालू' : 'बंद'} कर दिए गए हैं`
      };
      speak(talkback[lang]);
      log(`✓ All Appliances ${intent ? 'ON' : 'OFF'}`);
      return true;
    }

    // Individual appliance mapping (Loose keywords)
    const items: { keywords: string[], idx: number }[] = [
      { keywords: ['bedroom fan', 'bedroom pankho', 'bedroom ka pankha', 'bed room fan'], idx: 1 },
      { keywords: ['bedroom light', 'bedroom ni light', 'bedroom ki light', 'bed room light'], idx: 0 },
      { keywords: ['balcony'], idx: 2 },
      { keywords: ['hall fan', 'hall pankho', 'hall ka pankha'], idx: 3 },
      { keywords: ['hall light', 'hall ni light', 'hall ki light'], idx: 4 },
      { keywords: ['kitchen fan', 'rasoda pankho', 'rasoi ka pankha'], idx: 6 },
      { keywords: ['kitchen light', 'rasoda ni light', 'rasoi ki light'], idx: 5 },
      { keywords: ['bathroom', 'nahva gharni light', 'gusal khane ki light'], idx: 7 },
      { keywords: ['fridge', 'refrigerator', 'freezer'], idx: 8 },
      { keywords: ['ac', 'air conditioner', 'coolant'], idx: 9 },
      { keywords: ['pump', 'motor', 'pani motor'], idx: 10 },
      { keywords: ['spare', 'extra', 'relay 12'], idx: 11 }
    ];

    for (const item of items) {
      if (item.keywords.some(k => cmd.includes(k))) {
        handleSetRelay(item.idx, intent);
        log(`✓ ${applianceNames[item.idx]} ${intent ? 'ON' : 'OFF'}`);
        return true;
      }
    }

    return false;
  }, [applianceNames, lang, handleDoor, handleSetRelay, speak]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = initVoice;
      initVoice();
    }
  }, [lang]);

  const initVoice = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        let found;
        if (lang === "gu") found = voices.find(v => v.lang.startsWith("gu"));
        if (lang === "hi") found = voices.find(v => v.lang.startsWith("hi"));
        
        if (!found) {
          found = voices.find(v => v.name.includes("Sonia") && v.name.includes("Online")) || 
                  voices.find(v => v.name.includes("Aria") && v.name.includes("Online")) ||
                  voices.find(v => v.name.includes("Google") && v.name.includes("Female")) ||
                  voices.find(v => v.name.toLowerCase().includes("female") && v.lang.startsWith("en")) ||
                  voices.find(v => v.name.includes("Natural") && v.lang.startsWith("en"));
        }
        if (found) preferredVoiceRef.current = found;
      }
    }
  }, [lang]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      recognitionRef.current = new SR();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = lang === 'en' ? 'en-IN' : 'gu-IN';
      recognitionRef.current.onresult = (e: any) => {
        const t = e.results[0][0].transcript;
        setVLog(`Heard: "${t}"`);
        if (!processCmd(t)) setVLog(<span className="text-accent-red">Not recognized</span>);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [lang, processCmd]);

  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      let totalW = 0, totalVA = 0;
      relayState.forEach((on, i) => { if (on && APPLIANCE[i]) { totalW += APPLIANCE[i][0]; totalVA += APPLIANCE[i][0] / APPLIANCE[i][1]; } });
      const V = 230 + (Math.random() - 0.5) * 2;
      const I = totalVA / V;
      setMeter({
        voltage: V, current: I, power: totalW, pf: totalVA > 0 ? (totalW / totalVA).toFixed(2) : "1.00",
        pfPct: totalVA > 0 ? (totalW / totalVA) * 100 : 100,
        powerStr: totalW > 1000 ? (totalW / 1000).toFixed(1) : totalW.toFixed(0),
        powerUnit: totalW > 1000 ? 'kW' : 'W'
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [mounted, relayState]);

  if (!mounted) return null;

  return (
    <>
      {/* Ambient Glassmorphism Background Elements */}
      <div className="ambient-bg">
        <div className="ambient-blob blob-1"></div>
        <div className="ambient-blob blob-2"></div>
        <div className="ambient-blob blob-3"></div>
      </div>

      <main className="max-w-md mx-auto px-6 py-8 pb-40">
        
        {/* App Header */}
        <header className="flex justify-between items-center mb-10 animate-in">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lumina</h1>
            <p className="text-text-secondary text-sm">Smart Home Console</p>
          </div>
          <div className="flex glass p-1 rounded-xl">
            {(['en', 'gu', 'hi'] as const).map((l) => (
              <button 
                key={l}
                onClick={() => setLang(l)} 
                className={`px-3 py-1.5 text-[10px] font-bold transition-all rounded-lg ${lang === l ? 'bg-accent-blue/20 text-accent-blue shadow-[0_0_12px_rgba(0,242,255,0.2)]' : 'text-text-muted hover:text-text-secondary'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {currentTab === 'home' ? (
          <div className="animate-in fade-in zoom-in duration-300">
            {/* Energy Monitor */}
            <section className="glass p-6 mb-8" style={{ animationDelay: '0.1s' }}>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <span className="text-text-muted text-[10px] uppercase tracking-[0.2em] block mb-1">Energy Usage</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-mono text-accent-blue">{meter.powerStr}</span>
                    <span className="text-text-secondary font-mono">{meter.powerUnit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-text-muted text-[10px] uppercase tracking-[0.2em] block mb-1">Grid Voltage</span>
                  <span className="text-xl font-mono text-accent-green">{meter.voltage.toFixed(0)}V</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-glass-border">
                <div className="text-center">
                  <span className="text-text-muted text-[10px] block mb-1">Current</span>
                  <span className="text-sm font-mono">{meter.current.toFixed(2)}A</span>
                </div>
                <div className="text-center">
                  <span className="text-text-muted text-[10px] block mb-1">Load PF</span>
                  <span className="text-sm font-mono">{meter.pf}</span>
                </div>
                <div className="text-center">
                  <span className="text-text-muted text-[10px] block mb-1">Status</span>
                  <span className="text-xs font-bold text-accent-green">STABLE</span>
                </div>
              </div>
            </section>

            {/* Door Control Card */}
            <section className="mb-10" style={{ animationDelay: '0.15s' }}>
              <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-text-muted mb-4 flex items-center gap-3">
                <span>🚪</span> Security
              </h2>
              <div 
                onClick={() => handleDoor(!doorOpen)}
                className={`glass p-6 flex items-center justify-between cursor-pointer device-card ${doorOpen ? 'active glow-orange' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl drop-shadow-md">{doorOpen ? '🔓' : '🔒'}</span>
                  <div>
                    <span className="text-text-secondary text-sm font-medium block">Front Entrance</span>
                    <span className={`text-[10px] font-bold ${doorOpen ? 'text-accent-orange' : 'text-text-muted'}`}>
                      {doorOpen ? 'UNLOCKED' : 'SECURED'}
                    </span>
                  </div>
                </div>
                <div className={`switch-base ${doorOpen ? 'active' : ''} glow-orange`}>
                  <div className="switch-thumb"></div>
                </div>
              </div>
            </section>

            {/* Quick Scenes */}
            <section className="grid grid-cols-2 gap-4 mb-10" style={{ animationDelay: '0.2s' }}>
              {SCENES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleScene(s)}
                  className={`glass p-4 flex flex-col items-center justify-center gap-3 ${activeScene === s.key ? s.color + ' border-glass-border-active bg-white/10' : ''}`}
                >
                  <span className="text-3xl drop-shadow-lg">{s.icon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
                </button>
              ))}
            </section>

            {/* Rooms */}
            <div className="space-y-10" style={{ animationDelay: '0.3s' }}>
              {ROOMS.map((room) => (
                <section key={room.name}>
                  <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-text-muted mb-6 flex items-center gap-3">
                    <span>{room.icon}</span> {room.name}
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    {room.ids.map((id) => {
                      const isOn = relayState[id];
                      return (
                        <div
                          key={id}
                          onClick={() => handleSetRelay(id, !isOn)}
                          className={`glass p-5 flex flex-col justify-between cursor-pointer device-card min-h-[110px] ${isOn ? 'active glow-blue' : ''}`}
                        >
                          <div className="flex justify-between items-start w-full">
                            <div className={`switch-base ${isOn ? 'active' : ''} glow-blue`}>
                              <div className="switch-thumb"></div>
                            </div>
                            <span className={`text-[10px] font-bold ${isOn ? 'text-accent-blue' : 'text-text-muted'}`}>
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-primary text-sm font-medium block truncate mt-4">{applianceNames[id]}</span>
                            <span className="text-text-muted font-mono text-[10px]">PIN V{relayMap[`r${id}`] ?? id}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {/* Voice Assistant Floating Log */}
            <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4 pointer-events-none">
              {vLog && (
                <div className="glass px-6 py-3 text-xs font-mono mb-2 whitespace-nowrap animate-in">
                  {vLog}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in duration-300 space-y-6">
            {/* Settings View */}
            <header className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight">Pin Setup</h2>
              <p className="text-text-secondary text-sm mt-1">Map UI buttons to Blynk V-Pins</p>
            </header>

            <div className="grid grid-cols-1 gap-3 mb-10 pb-6 border-b border-glass-border">
              {applianceNames.map((name, i) => (
                <div key={i} className="glass p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary truncate max-w-[180px]">{name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-accent-blue font-mono text-[10px] tracking-widest">V-PIN</span>
                    <input
                      type="number"
                      className="bg-black/40 border border-glass-border rounded-lg w-16 px-2 py-1.5 text-center font-mono text-white outline-none focus:border-accent-blue transition-colors"
                      value={editMap[`r${i}`] !== undefined ? editMap[`r${i}`] : defaultMap[`r${i}`]}
                      onChange={(e) => setEditMap({ ...editMap, [`r${i}`]: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              ))}
              
              {/* Door Setting */}
              <div className="glass p-4 flex items-center justify-between border border-accent-orange/30 bg-accent-orange/5 mt-4">
                <span className="text-sm font-medium text-accent-orange truncate max-w-[180px]">Front Entrance Door</span>
                <div className="flex items-center gap-3">
                  <span className="text-accent-orange font-mono text-[10px] tracking-widest">V-PIN</span>
                  <input
                    type="number"
                    className="bg-black/40 border border-accent-orange/50 rounded-lg w-16 px-2 py-1.5 text-center font-mono text-white outline-none focus:border-accent-orange transition-colors"
                    value={editMap['door'] !== undefined ? editMap['door'] : 16}
                    onChange={(e) => setEditMap({ ...editMap, 'door': parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <button onClick={saveRelayMap} className="w-full glass p-5 flex justify-center items-center gap-3 text-accent-green hover:bg-accent-green/10 transition-colors border-accent-green/30">
               <span className="text-xl">💾</span>
               <span className="font-bold tracking-widest uppercase text-sm">Save Configuration</span>
            </button>
            <button onClick={() => { setEditMap(defaultMap); }} className="w-full glass p-4 flex justify-center items-center gap-3 text-text-secondary mt-3">
               <span className="font-bold tracking-widest uppercase text-xs">Reset Defaults</span>
            </button>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-2 pointer-events-none">
        <div className="glass max-w-md mx-auto rounded-[32px] flex justify-around items-center px-4 py-2 bg-black/50 backdrop-blur-2xl border border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] pointer-events-auto">
          <button 
            onClick={() => setCurrentTab('home')} 
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 transition-colors ${currentTab === 'home' ? 'text-accent-blue drop-shadow-[0_0_8px_rgba(0,242,255,0.8)]' : 'text-text-muted hover:text-white'}`}
          >
            <span className="text-2xl mb-1">🏠</span>
            <span className="text-[9px] font-bold tracking-widest uppercase">Home</span>
          </button>
          
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => {
                if (isListening) recognitionRef.current?.stop();
                else { setIsListening(true); initAudio(); recognitionRef.current?.start(); }
              }}
              className={`voice-orb ${isListening ? 'listening' : ''}`}
            >
              <span className="text-xl text-white drop-shadow-md">🎙️</span>
            </button>
          </div>

          <button 
            onClick={() => setCurrentTab('settings')} 
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 transition-colors ${currentTab === 'settings' ? 'text-accent-blue drop-shadow-[0_0_8px_rgba(0,242,255,0.8)]' : 'text-text-muted hover:text-white'}`}
          >
            <span className="text-2xl mb-1">⚙️</span>
            <span className="text-[9px] font-bold tracking-widest uppercase">Setup</span>
          </button>
        </div>
      </nav>

      {/* Toast Notification */}
      <div className={`fixed top-8 left-1/2 -translate-x-1/2 glass px-6 py-3 text-sm font-bold tracking-wide transition-all duration-500 z-[100] shadow-[0_4px_24px_rgba(0,0,0,0.8)] border-t-2 ${toast.show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'} ${toast.isErr ? 'border-accent-red text-accent-red' : 'border-accent-blue text-accent-blue'}`}>
        {toast.msg}
      </div>
    </>
  );
}