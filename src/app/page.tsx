"use client";
/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import React, { useEffect, useState, useRef, useCallback } from "react";

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
  [60, 1.00],  // r12 spare
  [60, 1.00],  // r13 spare
  [60, 1.00],  // r14 spare
  [60, 1.00],  // r15 spare
];

const LIGHT_RELAYS = [0, 2, 4, 5, 7];
const SCENES = {
  sleep: {
    key: "sleep",
    label: "SLEEP MODE",
    pins: [] as number[],
    speech: "Activating sleep mode. Turning everything off.",
    toast: "Sleep Mode → ALL OFF",
  },
  welcome: {
    key: "welcome",
    label: "WELCOME MODE",
    pins: [0, 2, 4, 5] as number[],
    speech: "Welcome mode activated. Entrance and living lights are on.",
    toast: "Welcome Mode → SELECTED LIGHTS ON",
  },
  full: {
    key: "full",
    label: "FULL POWER",
    pins: Array.from({ length: 12 }, (_, i) => i) as number[],
    speech: "Full power mode activated. Everything is now on.",
    toast: "Full Power → ALL ON",
  }
} as const;
const names = [
  "Bedroom Lights", "Bedroom Fan", "Balcony Lights", "Hall Fan",
  "Hall Light", "Kitchen Lights", "Kitchen Fan", "Bathroom Lights",
  "Fridge", "AC", "Water Pump", "Relay 11", "Relay 12", "Relay 13", "Relay 14", "Relay 15"
];

export default function Home() {
  const [relayMap] = useState<Record<string, number>>(defaultMap);
  const [relayState, setRelayState] = useState<boolean[]>(new Array(16).fill(false));
  const [activeScene, setActiveScene] = useState<keyof typeof SCENES | null>(null);
  const [doorOpen, setDoorOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [vLog, setVLog] = useState<React.ReactNode>("Awaiting voice input...");
  const [toast, setToast] = useState<{ msg: string; isErr: boolean; show: boolean }>({ msg: "", isErr: false, show: false });

  const [meter, setMeter] = useState({
    voltage: 230.0,
    current: 0.0,
    power: 0.0,
    powerStr: "0.0",
    powerUnit: "Watts",
    freq: 50.0,
    pf: "—",
    pfPct: 0
  });

  const [ptPin, setPtPin] = useState("1");
  const [ptVal, setPtVal] = useState("1");
  const [ptLog, setPtLog] = useState<React.ReactNode>(<span style={{ color: "rgba(255,180,0,.4)" }}>Tap SEND to test a virtual pin directly and see Blynk's response...</span>);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const humGainRef = useRef<GainNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Audio Context Init
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  // Toast
  const showToast = useCallback((msg: string, isErr = false) => {
    setToast({ msg, isErr, show: true });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(t => ({ ...t, show: false }));
    }, 2200);
  }, []);

  // Update Hum
  const updateHum = useCallback((anyOn: boolean) => {
    if (!audioCtxRef.current) return;
    if (anyOn && !humOscRef.current) {
      humOscRef.current = audioCtxRef.current.createOscillator();
      humGainRef.current = audioCtxRef.current.createGain();
      humOscRef.current.type = 'sawtooth';
      humOscRef.current.frequency.value = 50;
      const f = audioCtxRef.current.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      humGainRef.current.gain.value = 0.04;
      humOscRef.current.connect(f);
      f.connect(humGainRef.current);
      humGainRef.current.connect(audioCtxRef.current.destination);
      humOscRef.current.start();
    } else if (!anyOn && humOscRef.current) {
      humOscRef.current.stop();
      humOscRef.current.disconnect();
      humGainRef.current?.disconnect();
      humOscRef.current = null;
    }
  }, []);

  // Play Click
  const playClick = useCallback((isOn: boolean) => {
    initAudio();
    if (!audioCtxRef.current) return;
    const t = audioCtxRef.current.currentTime;
    const layers = [
      { type: 'sine' as OscillatorType, freqA: isOn ? 150 : 180, freqB: 30, gainA: 0.8, gainB: 0.001, dur: 0.1 },
      { type: 'square' as OscillatorType, freqA: isOn ? 800 : 1200, freqB: 100, gainA: 0.4, gainB: 0.001, dur: 0.05 },
      { type: 'sawtooth' as OscillatorType, freqA: 4000, freqB: 4000, gainA: 0.15, gainB: 0.001, dur: 0.03 },
    ];
    layers.forEach(l => {
      const o = audioCtxRef.current!.createOscillator();
      const g = audioCtxRef.current!.createGain();
      o.type = l.type;
      o.frequency.setValueAtTime(l.freqA, t);
      o.frequency.exponentialRampToValueAtTime(l.freqB, t + l.dur * 0.5);
      g.gain.setValueAtTime(l.gainA, t);
      g.gain.exponentialRampToValueAtTime(l.gainB, t + l.dur);
      o.connect(g);
      g.connect(audioCtxRef.current!.destination);
      o.start(t);
      o.stop(t + l.dur);
    });
  }, []);

  // Blynk Set
  const blynkSet = async (p: number, v: number) => {
    try {
      const res = await fetch(`${BASE}?v${p}=${v}`);
      if (!res.ok) showToast(`Blynk Error ${res.status} (V${p})`, true);
    } catch {
      showToast("Network Error", true);
    }
  };

  // Meter Update
  useEffect(() => {
    const voltageBase = 230.0;
    let voltageNoise = 0;

    const interval = setInterval(() => {
      voltageNoise += (Math.random() - 0.5) * 0.6;
      voltageNoise = Math.max(-3, Math.min(3, voltageNoise));
      const V = voltageBase + voltageNoise;

      let totalW = 0, totalVA = 0;
      for (let i = 0; i < 16; i++) {
        if (!relayState[i]) continue;
        const [w, pf] = APPLIANCE[i];
        totalW += w;
        totalVA += w / pf;
      }

      const I = totalVA > 0 ? totalVA / V : 0;
      const F = 50.0 + (Math.random() - 0.5) * 0.12;
      const PF = totalVA > 0 ? (totalW / totalVA) : null;
      const pfPct = PF !== null ? PF * 100 : 0;

      setMeter({
        voltage: V,
        current: I,
        power: totalW,
        powerStr: totalW >= 1000 ? (totalW / 1000).toFixed(2) + 'k' : totalW.toFixed(1),
        powerUnit: totalW >= 1000 ? 'kW' : 'Watts',
        freq: F,
        pf: PF !== null ? PF.toFixed(2) : '—',
        pfPct
      });

      updateHum(relayState.some(Boolean));
    }, 1800);

    return () => clearInterval(interval);
  }, [relayState, updateHum]);

  const [clickedBtns, setClickedBtns] = useState<Record<string, string>>({});

  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const initVoice = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const found = voices.find(v => v.name.includes("Sonia") && v.name.includes("Online")) || 
                      voices.find(v => v.name.includes("Aria") && v.name.includes("Online")) ||
                      voices.find(v => v.name.includes("Google") && v.name.includes("Female")) ||
                      voices.find(v => v.name.toLowerCase().includes("female") && v.lang.startsWith("en")) ||
                      voices.find(v => v.name.includes("Natural") && v.lang.startsWith("en"));
        
        if (found) {
          preferredVoiceRef.current = found;
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = initVoice;
      initVoice();
    }
  }, [initVoice]);

  const speakFeedback = (text: string) => {
    if (!isVoiceEnabled) return;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (preferredVoiceRef.current) {
        utterance.voice = preferredVoiceRef.current;
      }

      utterance.rate = 1.0; 
      utterance.pitch = 1.1; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSetRelay = (i: number, on: boolean, silent = false) => {
    setRelayState(prev => {
      const next = [...prev];
      next[i] = on;
      return next;
    });

    const btnId = `r${i}`;
    const animClass = on ? 'clicking-on' : 'clicking-off';
    setClickedBtns(prev => ({ ...prev, [btnId]: animClass }));
    setTimeout(() => setClickedBtns(prev => ({ ...prev, [btnId]: "" })), 300);

    const mappedPin = relayMap[btnId] !== undefined ? relayMap[btnId] : i;
    blynkSet(mappedPin, on ? 1 : 0);

    if (!silent) {
      playClick(on);
      const action = on ? "Switching on" : "Switching off";
      speakFeedback(`${action} the ${names[i]}`);
      showToast(`${names[i]} → ${on ? "ON" : "OFF"}`);
    }
  };

  const handleToggleAllLights = () => {
    const anyOn = LIGHT_RELAYS.some(li => relayState[li]);
    const on = !anyOn;

    setRelayState(prev => {
      const next = [...prev];
      LIGHT_RELAYS.forEach(i => next[i] = on);
      return next;
    });

    const animClass = on ? 'clicking-on' : 'clicking-off';
    const newClicks: Record<string, string> = { "all-lights": animClass };
    LIGHT_RELAYS.forEach(i => newClicks[`r${i}`] = animClass);
    setClickedBtns(prev => ({ ...prev, ...newClicks }));
    setTimeout(() => setClickedBtns(prev => {
      const next = { ...prev };
      Object.keys(newClicks).forEach(k => next[k] = "");
      return next;
    }), 300);

    (async () => {
      for (let idx = 0; idx < LIGHT_RELAYS.length; idx++) {
        if (idx > 0) await new Promise(r => setTimeout(r, 220));
        const relayIdx = LIGHT_RELAYS[idx];
        const mappedPin = relayMap[`r${relayIdx}`] !== undefined ? relayMap[`r${relayIdx}`] : relayIdx;
        try {
          const res = await fetch(`${BASE}?v${mappedPin}=${on ? 1 : 0}`);
          if (!res.ok) showToast(`Blynk Error ${res.status}`, true);
        } catch {
          showToast("Network Error", true);
          return;
        }
      }
    })();

    playClick(on);
    speakFeedback(on ? "Switching on all lights" : "Switching off all lights");
    showToast('All Lights → ' + (on ? 'ON' : 'OFF'));
  };

  const handleDoor = (open: boolean, silent = false) => {
    blynkSet(16, open ? 120 : 0);
    setDoorOpen(open);
    if (!silent) {
      playClick(open);
      speakFeedback(open ? "Opening the door" : "Closing the door");
      showToast(`Door → ${open ? 'OPEN 🔓' : 'CLOSED 🔒'}`);
    }
  };

  const handleSceneMode = (mode: keyof typeof SCENES) => {
    const scene = SCENES[mode];
    const shouldTurnOn = new Set(scene.pins);
    const animateOn = scene.pins.length > 0;
    const animClass = animateOn ? "clicking-on" : "clicking-off";
    setActiveScene(mode);

    setRelayState(prev => prev.map((_, idx) => shouldTurnOn.has(idx)));

    const newClicks: Record<string, string> = { [`scene-${scene.key}`]: animClass };
    for (let i = 0; i < 12; i++) {
      newClicks[`r${i}`] = shouldTurnOn.has(i) ? "clicking-on" : "clicking-off";
    }

    setClickedBtns(prev => ({ ...prev, ...newClicks }));
    setTimeout(() => {
      setClickedBtns(prev => {
        const next = { ...prev };
        Object.keys(newClicks).forEach(k => (next[k] = ""));
        return next;
      });
    }, 300);

    for (let i = 0; i < 12; i++) {
      const mappedPin = relayMap[`r${i}`] !== undefined ? relayMap[`r${i}`] : i;
      blynkSet(mappedPin, shouldTurnOn.has(i) ? 1 : 0);
    }

    playClick(animateOn);
    speakFeedback(scene.speech);
    showToast(scene.toast);
  };

  const handleSceneOff = () => {
    setActiveScene(null);
    setClickedBtns(prev => ({ ...prev, "scene-off": "clicking-off" }));
    setTimeout(() => {
      setClickedBtns(prev => ({ ...prev, "scene-off": "" }));
    }, 300);
    playClick(false);
    speakFeedback("Scene mode turned off. Manual control is active.");
    showToast("Scene Mode → OFF (Manual Control)");
  };

  // Voice
  const processCmd = useCallback((raw: string) => {
    const norm = (s: string) => s
      .replace(/\b(the|a|an|please|hey|ok|okay|can you|could you)\b/g, '')
      .replace(/\bswitch\b/g, 'turn').replace(/\bpower on\b/g, 'turn on')
      .replace(/\bshut off\b|\bpower off\b/g, 'turn off')
      .replace(/\bair conditioner\b|\bair conditioning\b|\baircon\b/g, 'ac')
      .replace(/\brefrigerator\b/g, 'fridge')
      .replace(/\bpump\b/g, 'water pump')
      .replace(/\s+/g, ' ').trim();

    const cmd = norm(raw);
    const logV = (msg: string, cls = '') => setVLog(<span className={cls}>{msg}</span>);

    if (/\bopen\b.*\bdoor\b|\bdoor\b.*\bopen\b|\bunlock\b/.test(cmd)) { handleDoor(true); logV('✓ Door opened 🔓', 'action'); return true; }
    if (/\bclose\b.*\bdoor\b|\bdoor\b.*\bclose\b|\block\b/.test(cmd)) { handleDoor(false); logV('✓ Door closed 🔒', 'action'); return true; }
    if (/\bsleep mode\b|\bgood night\b|\bnight mode\b/.test(cmd)) { handleSceneMode("sleep"); logV('✓ Sleep Mode activated', 'action'); return true; }
    if (/\bwelcome mode\b|\bi am home\b|\bhome mode\b/.test(cmd)) { handleSceneMode("welcome"); logV('✓ Welcome Mode activated', 'action'); return true; }
    if (/\bfull power\b|\beverything on\b|\ball on\b/.test(cmd)) { handleSceneMode("full"); logV('✓ Full Power activated', 'action'); return true; }

    let intent: boolean | null = null;
    if (/\bturn on\b/.test(cmd)) intent = true;
    if (/\bturn off\b/.test(cmd)) intent = false;
    if (intent === null) return false;

    if (/\ball lights?\b/.test(cmd)) {
      setRelayState(prev => {
        const next = [...prev];
        LIGHT_RELAYS.forEach(i => next[i] = intent!);
        return next;
      });
      // also execute the sequence
      LIGHT_RELAYS.forEach(i => blynkSet(relayMap[`r${i}`] ?? i, intent! ? 1 : 0));
      logV(`✓ All Lights → ${intent ? 'ON' : 'OFF'}`, 'action');
      return true;
    }

    const commands: [RegExp, number, string][] = [
      [/\bbedroom fan\b/, 1, "Bedroom Fan"],
      [/\bbedroom lights?\b|\bbedroom light\b/, 0, "Bedroom Lights"],
      [/\bbalcony\b/, 2, "Balcony Lights"],
      [/\bhall fan\b/, 3, "Hall Fan"],
      [/\bhall lights?\b|\bhall light\b/, 4, "Hall Light"],
      [/\bkitchen fan\b/, 6, "Kitchen Fan"],
      [/\bkitchen lights?\b|\bkitchen light\b/, 5, "Kitchen Lights"],
      [/\bbathroom\b/, 7, "Bathroom Lights"],
      [/\bfridge\b/, 8, "Fridge"],
      [/\bac\b/, 9, "AC"],
      [/\bwater pump\b/, 10, "Water Pump"]
    ];

    for (const [regex, idx, name] of commands) {
      if (regex.test(cmd)) {
        handleSetRelay(idx, intent);
        logV(`✓ ${name} → ${intent ? 'ON' : 'OFF'}`, 'action');
        return true;
      }
    }
    return false;
  }, [relayMap]); // omitted some deps for simplicity

  const setupVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVLog("NOT SUPPORTED");
      return;
    }
    recognitionRef.current = new SR();
    const r = recognitionRef.current;
    r.continuous = false; r.lang = 'en-IN'; r.interimResults = false; r.maxAlternatives = 6;
    r.onresult = (e: any) => {
      const alts = Array.from({ length: e.results[0].length }, (_, i) => e.results[0][i].transcript.toLowerCase().trim());
      setVLog(<span className="heard">Heard: "{alts[0]}"</span>);
      if (!alts.some((t: any) => processCmd(t))) {
        setVLog(<span className="error">✗ Not recognised: "{alts[0]}" — try again</span>);
      }
    };
    r.onend = () => setIsListening(false);
    r.onerror = (e: any) => {
      if (e.error !== 'no-speech') setVLog(<span className="error">Error: {e.error}</span>);
      setIsListening(false);
    };
  }, [processCmd]);

  useEffect(() => {
    setupVoice();
    blynkSet(16, 0); // close door initially
  }, [setupVoice]);

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      return;
    }
    setIsListening(true);
    initAudio();
    recognitionRef.current.start();
  };

  const runPinTest = async () => {
    const url = `${BASE}?v${ptPin}=${ptVal}`;
    setPtLog(<span style={{ color: "rgba(255,180,0,.5)" }}>Sending → v{ptPin}={ptVal} ...</span>);
    const t0 = Date.now();
    try {
      const res = await fetch(url);
      const ms = Date.now() - t0;
      const body = await res.text();
      const color = res.ok ? '#44ff88' : '#ff4422';
      setPtLog(
        <>
          <span style={{ color: "rgba(255,180,0,.4)" }}>URL:</span> <span style={{ color: "#aaa", wordBreak: "break-all" }}>{url}</span><br />
          <span style={{ color: "rgba(255,180,0,.4)" }}>HTTP Status:</span> <span style={{ color }}>{res.status} {res.statusText}</span><br />
          <span style={{ color: "rgba(255,180,0,.4)" }}>Response:</span> <span style={{ color }}>{body || '(empty — means OK)'}</span><br />
          <span style={{ color: "rgba(255,180,0,.4)" }}>Time:</span> <span style={{ color: "#aaa" }}>{ms}ms</span><br />
          <span style={{ color: "rgba(255,180,0,.4)" }}>Result:</span> <span style={{ color }}>{res.ok ? '✓ Internal API proxy handled the request successfully.' : '✗ Internal API proxy error.'}</span>
        </>
      );
    } catch (e: any) {
      setPtLog(<span style={{ color: "#ff4422" }}>✗ Network error: {e.message}</span>);
    }
  };

  const anyLightOn = LIGHT_RELAYS.some(li => relayState[li]);
  const allLightsOn = LIGHT_RELAYS.every(li => relayState[li]);

  useEffect(() => {
    if (anyLightOn) {
      document.body.classList.add('lights-on');
    } else {
      document.body.classList.remove('lights-on');
    }
  }, [anyLightOn]);

  const renderBreaker = (id: string, idx: number, name: string, isLight = false, isWide = false) => {
    const isOn = relayState[idx];
    const classes = ["breaker-btn", isLight ? "light-btn" : "", isWide ? "wide" : "", isOn ? "on" : "", clickedBtns[id] || ""].filter(Boolean).join(" ");
    return (
      <div className={classes} id={id} onClick={() => handleSetRelay(idx, !isOn)}>
        <div className="mcb-led"></div>
        <div className="mcb-slot"><div className="mcb-handle"></div></div>
        <div className="breaker-name">{name}</div>
        <div className="breaker-pin">V{relayMap[id] ?? idx}</div>
      </div>
    );
  };

  return (
    <div className="cabinet">
      {/* VOICE TOGGLE (TOP RIGHT) */}
      <button 
        onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          zIndex: 1000,
          background: isVoiceEnabled ? "var(--blue)" : "var(--muted)",
          border: "2px solid var(--border)",
          borderRadius: "4px",
          color: "white",
          padding: "6px 10px",
          fontSize: "0.65rem",
          fontFamily: "var(--head)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all 0.2s"
        }}
      >
        <span>{isVoiceEnabled ? "🔊 VOICE ON" : "🔇 VOICE OFF"}</span>
      </button>

      {/* NAMEPLATE */}
      <div className="nameplate">
        <div className="np-rivet tl"></div><div className="np-rivet tr"></div>
        <div className="np-rivet bl"></div><div className="np-rivet br"></div>
        <div className="np-inner">
          <div className="np-emblem">
            <svg className="emblem-svg" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="26" cy="26" r="23" stroke="#c8a830" strokeWidth="1.5" fill="none" opacity="0.4" />
              <g fill="#c8a830" opacity="0.85">
                <rect x="24.5" y="1" width="3" height="6" rx="1" />
                <rect x="24.5" y="45" width="3" height="6" rx="1" />
                <rect x="1" y="24.5" width="6" height="3" rx="1" />
                <rect x="45" y="24.5" width="6" height="3" rx="1" />
                <rect x="38.5" y="5.5" width="3" height="6" rx="1" transform="rotate(45 40 8.5)" />
                <rect x="6.5" y="38.5" width="3" height="6" rx="1" transform="rotate(45 8 41.5)" />
                <rect x="6.5" y="5.5" width="3" height="6" rx="1" transform="rotate(-45 8 8.5)" />
                <rect x="38.5" y="38.5" width="3" height="6" rx="1" transform="rotate(-45 40 41.5)" />
              </g>
              <circle cx="26" cy="26" r="17" fill="#0e1418" stroke="#c8a830" strokeWidth="1.2" opacity="0.9" />
              <circle cx="26" cy="26" r="14" stroke="#c8a830" strokeWidth="0.6" fill="none" opacity="0.3" strokeDasharray="3 2" />
              <path d="M29 10 L20 27 H27 L23 42 L34 23 H27 L31 10 Z" fill="url(#bolt-grad)" filter="url(#bolt-glow)" />
              <defs>
                <linearGradient id="bolt-grad" x1="26" y1="10" x2="26" y2="42" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ffe060" /><stop offset="50%" stopColor="#c8a830" /><stop offset="100%" stopColor="#a07820" />
                </linearGradient>
                <filter id="bolt-glow" x="-40%" y="-20%" width="180%" height="140%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
            </svg>
            <div className="emblem-badge">ITI</div>
          </div>
          <div className="np-center">
            <div className="np-govt">Govt. of India · NCVT</div>
            <div className="np-inst">Industrial<br /><span>Training</span> Institute</div>
            <div className="np-trade">Electrician Trade<div className="np-trade-divider"></div></div>
            <div className="np-project">Smart Home Automation Project · ESP8266 + Blynk IoT</div>
          </div>
          <div className="np-batch">
            <div className="np-batch-label">Batch</div>
            <div className="np-batch-num">83</div>
            <div className="np-batch-sect">D–E</div>
            <div className="np-batch-sub">2025–26</div>
          </div>
        </div>
      </div>

      {/* STATUS INDICATORS */}
      <div className="indicator-row">
        <div className="pilot-light pl-green"></div><span className="ind-label">Power</span>
        <div className="pilot-light pl-red"></div><span className="ind-label">Fault</span>
        <div className="pilot-light pl-orange"></div><span className="ind-label">Manual</span>
        <div className="pilot-light pl-blue"></div><span className="ind-label">Auto</span>
        <div className="ind-sep"></div>
        <span className="sys-id">PANEL · 16CH · V3.0</span>
      </div>

      {/* 3-PHASE + ENERGY METER */}
      <div className="panel-section">
        <div className="ps-head">
          <span className="ps-title">3-Phase Supply</span>
          <span className="ps-circuit">415V AC · 50Hz · TN-S</span>
        </div>
        <div className="ps-body" style={{ padding: 0 }}>
          <div className="phase-row">
            <div className="phase-unit">
              <div className="phase-lamp-housing">
                <div className="phase-jewel jewel-r"></div>
              </div>
              <div className="phase-label r-lbl">R</div>
              <div className="phase-reading">230 V</div>
            </div>
            <div className="phase-divider"></div>
            <div className="phase-unit">
              <div className="phase-lamp-housing">
                <div className="phase-jewel jewel-y"></div>
              </div>
              <div className="phase-label y-lbl">Y</div>
              <div className="phase-reading">231 V</div>
            </div>
            <div className="phase-divider"></div>
            <div className="phase-unit">
              <div className="phase-lamp-housing">
                <div className="phase-jewel jewel-b"></div>
              </div>
              <div className="phase-label b-lbl">B</div>
              <div className="phase-reading">229 V</div>
            </div>
            <div className="phase-divider"></div>
            <div className="phase-unit" style={{ gap: "10px" }}>
              <div className="phase-spec">
                <div className="phase-spec-val">415 V</div>
                <div className="phase-spec-unit">Line–Line</div>
              </div>
              <div className="phase-spec">
                <div className="phase-spec-val">230 V</div>
                <div className="phase-spec-unit">Phase–N</div>
              </div>
            </div>
          </div>

          <div style={{ padding: "0 16px 16px" }}>
            <div className="meter-display">
              <div className="meter-inner">
                <div className="meter-title-bar">
                  <span className="meter-title">⬡ ENERGY MONITOR · SINGLE PHASE LOAD</span>
                  <span className="meter-live-dot"></span>
                </div>
                <div className="meter-grid">
                  <div className="meter-cell v-cell">
                    <div className="meter-cell-label">Voltage</div>
                    <div className="meter-cell-value">{meter.voltage.toFixed(1)}</div>
                    <div className="meter-cell-unit">V rms</div>
                  </div>
                  <div className="meter-cell i-cell">
                    <div className="meter-cell-label">Current</div>
                    <div className="meter-cell-value">{meter.current.toFixed(2)}</div>
                    <div className="meter-cell-unit">A rms</div>
                  </div>
                  <div className="meter-cell p-cell">
                    <div className="meter-cell-label">Active Pwr</div>
                    <div className="meter-cell-value">{meter.powerStr}</div>
                    <div className="meter-cell-unit">{meter.powerUnit}</div>
                  </div>
                  <div className="meter-cell f-cell">
                    <div className="meter-cell-label">Frequency</div>
                    <div className="meter-cell-value">{meter.freq.toFixed(1)}</div>
                    <div className="meter-cell-unit">Hz</div>
                  </div>
                </div>
                <div className="meter-pf-row">
                  <span className="meter-pf-label">PF</span>
                  <div className="meter-pf-bar-bg">
                    <div className="meter-pf-bar-fill" style={{ width: `${meter.pfPct}%` }}></div>
                  </div>
                  <span className="meter-pf-val">{meter.pf}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LIGHTING */}
      <div className={`panel-section lighting-section ${anyLightOn ? 'lights-on' : ''}`} id="lighting-section">
        <div className="ps-head"><span className="ps-title">Lighting</span><span className="ps-circuit">Circuit A · V1 V2 V3 V5 V8</span></div>
        <div className="ps-body">
          <div className="breaker-grid">
            <div className={`breaker-btn light-btn wide ${allLightsOn ? 'on' : ''} ${clickedBtns['all-lights'] || ''}`} onClick={handleToggleAllLights}>
              <div className="mcb-led"></div>
              <div className="mcb-slot"><div className="mcb-handle"></div></div>
              <div className="breaker-name">ALL LIGHTS</div>
              <div className="breaker-pin">V1·V2·V3·V5·V8</div>
            </div>
            {renderBreaker("r0", 0, "Bedroom Lights", true)}
            {renderBreaker("r2", 2, "Balcony Lights", true)}
            {renderBreaker("r4", 4, "Hall Light", true)}
            {renderBreaker("r5", 5, "Kitchen Lights", true)}
            {renderBreaker("r7", 7, "Bathroom Lights", true, true)}
          </div>
        </div>
      </div>

      {/* FAN CIRCUIT */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">Fan Circuit</span><span className="ps-circuit">Circuit B · V9 V10 V13</span></div>
        <div className="ps-body">
          <div className="breaker-grid-3">
            {renderBreaker("r1", 1, "Bedroom Fan")}
            {renderBreaker("r3", 3, "Hall Fan")}
            {renderBreaker("r6", 6, "Kitchen Fan")}
          </div>
        </div>
      </div>

      {/* APPLIANCES */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">Appliances</span><span className="ps-circuit">Circuit C · V11 V12 V14</span></div>
        <div className="ps-body">
          <div className="breaker-grid-3">
            {renderBreaker("r8", 8, "Fridge")}
            {renderBreaker("r9", 9, "AC")}
            {renderBreaker("r10", 10, "Water Pump")}
          </div>
        </div>
      </div>

      {/* EXTRA CONTROLS */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">Extra Controls</span><span className="ps-circuit">Circuit D · V15</span></div>
        <div className="ps-body">
          <div className="breaker-grid">
            {renderBreaker("r11", 11, "Spare Relay 12")}
          </div>
        </div>
      </div>

      {/* SCENE / PRESET MODES */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">Scene / Preset Modes</span><span className="ps-circuit">One Tap · Multi-Relay Automation</span></div>
        <div className="ps-body">
          <div className="scene-grid">
            <button className={`scene-btn sleep ${activeScene === "sleep" ? "active" : ""} ${clickedBtns["scene-sleep"] || ""}`} onClick={() => handleSceneMode("sleep")}>
              <span className="scene-title">😴 SLEEP MODE</span>
              <span className="scene-sub">Turn everything OFF</span>
            </button>
            <button className={`scene-btn welcome ${activeScene === "welcome" ? "active" : ""} ${clickedBtns["scene-welcome"] || ""}`} onClick={() => handleSceneMode("welcome")}>
              <span className="scene-title">🏠 WELCOME MODE</span>
              <span className="scene-sub">Bedroom + Balcony + Hall + Kitchen lights ON</span>
            </button>
            <button className={`scene-btn full ${activeScene === "full" ? "active" : ""} ${clickedBtns["scene-full"] || ""}`} onClick={() => handleSceneMode("full")}>
              <span className="scene-title">⚡ FULL POWER</span>
              <span className="scene-sub">Turn all relays ON</span>
            </button>
            <button className={`scene-btn off ${activeScene === null ? "active" : ""} ${clickedBtns["scene-off"] || ""}`} onClick={handleSceneOff}>
              <span className="scene-title">🛑 MODE OFF</span>
              <span className="scene-sub">Disable preset mode (manual control)</span>
            </button>
          </div>
          <div className="scene-status">
            Active Mode: <b>{activeScene ? SCENES[activeScene].label : "MANUAL"}</b>
            <button className={`scene-btn sleep ${clickedBtns["scene-sleep"] || ""}`} onClick={() => handleSceneMode("sleep")}>
              <span className="scene-title">😴 SLEEP MODE</span>
              <span className="scene-sub">Turn everything OFF</span>
            </button>
            <button className={`scene-btn welcome ${clickedBtns["scene-welcome"] || ""}`} onClick={() => handleSceneMode("welcome")}>
              <span className="scene-title">🏠 WELCOME MODE</span>
              <span className="scene-sub">Bedroom + Balcony + Hall + Kitchen lights ON</span>
            </button>
            <button className={`scene-btn full ${clickedBtns["scene-full"] || ""}`} onClick={() => handleSceneMode("full")}>
              <span className="scene-title">⚡ FULL POWER</span>
              <span className="scene-sub">Turn all relays ON</span>
            </button>
          </div>
        </div>
      </div>

      {/* DOOR CONTROL */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">Door Control</span><span className="ps-circuit">Servo Motor · V16 · 0°–120°</span></div>
        <div className="ps-body">
          <div className="door-row">
            <button className={`door-btn open-btn ${doorOpen ? 'active' : ''}`} onClick={() => handleDoor(true)}>🔓 &nbsp;OPEN</button>
            <button className={`door-btn close-btn ${!doorOpen ? 'active' : ''}`} onClick={() => handleDoor(false)}>🔒 &nbsp;CLOSE</button>
          </div>
          <div className="door-status">Status: <b>{doorOpen ? 'OPEN' : 'CLOSED'}</b></div>
          <div className="door-angle">Servo Angle: {doorOpen ? '120°' : '0°'}</div>
        </div>
      </div>

      {/* VOICE CONTROL */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">Voice Control</span><span className="ps-circuit">en-IN · Chrome / Edge</span></div>
        <div className="ps-body">
          <button className={`voice-btn ${isListening ? 'listening' : ''}`} onClick={toggleVoice}>
            <span>🎙</span><span>{isListening ? 'LISTENING...' : 'TAP TO SPEAK'}</span>
          </button>
          <div className="voice-log">{vLog}</div>
          <div className="cmd-table">
            <div className="cmd-table-head">
              <span className="cmd-table-head-title">Voice Commands</span>
              <span className="cmd-table-head-sub">— speak these exactly</span>
            </div>
            <div className="cmd-rows">
              <div className="cmd-group">
                <div className="cmd-group-title special">⭐ All Lights</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on all lights"</span><span className="cmd-badge badge-all">ALL ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off all lights"</span><span className="cmd-badge badge-all">ALL OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title special">🎬 Scene Modes</div>
                <div className="cmd-entry"><span className="cmd-say">"Sleep mode"</span><span className="cmd-badge badge-all">ALL OFF</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Welcome mode"</span><span className="cmd-badge badge-all">ENTRY ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Full power"</span><span className="cmd-badge badge-all">ALL ON</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">🚪 Door</div>
                <div className="cmd-entry"><span className="cmd-say">"Open the door"</span><span className="cmd-badge badge-door">OPEN</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Close the door"</span><span className="cmd-badge badge-door">CLOSE</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">💡 Bedroom Lights</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on bedroom lights"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off bedroom lights"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">🌀 Bedroom Fan</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on bedroom fan"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off bedroom fan"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">💡 Balcony Lights</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on balcony lights"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off balcony lights"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">🌀 Hall Fan</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on hall fan"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off hall fan"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">💡 Hall Light</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on hall light"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off hall light"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">💡 Kitchen Lights</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on kitchen lights"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off kitchen lights"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">🌀 Kitchen Fan</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on kitchen fan"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off kitchen fan"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">💡 Bathroom Lights</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on bathroom lights"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off bathroom lights"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">🧊 Fridge</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on fridge"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off fridge"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">❄️ AC</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on AC"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off AC"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
              <div className="cmd-group">
                <div className="cmd-group-title">💧 Water Pump</div>
                <div className="cmd-entry"><span className="cmd-say">"Turn on water pump"</span><span className="cmd-badge badge-on">ON</span></div>
                <div className="cmd-entry"><span className="cmd-say">"Turn off water pump"</span><span className="cmd-badge badge-off">OFF</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PIN TESTER */}
      <div className="panel-section" id="pin-tester-section">
        <div className="ps-head"><span className="ps-title">🔧 Pin Tester</span><span className="ps-circuit">Debug · Blynk API Response</span></div>
        <div className="ps-body">
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "140px" }}>
              <span style={{ fontFamily: "var(--head)", fontSize: ".65rem", fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>VIRTUAL PIN</span>
              <select value={ptPin} onChange={(e) => setPtPin(e.target.value)} style={{ flex: 1, background: "var(--recess)", border: "2px solid var(--border)", borderRadius: "3px", padding: "6px 8px", fontFamily: "var(--mono)", fontSize: ".75rem", color: "var(--label)", outline: "none" }}>
                <option value="1">V1 – Bedroom Lights</option>
                <option value="9">V9 – Bedroom Fan</option>
                <option value="2">V2 – Balcony Lights</option>
                <option value="10">V10 – Hall Fan</option>
                <option value="3">V3 – Hall Light</option>
                <option value="5">V5 – Kitchen Lights</option>
                <option value="13">V13 – Kitchen Fan</option>
                <option value="8">V8 – Bathroom Lights</option>
                <option value="11">V11 – Fridge</option>
                <option value="12">V12 – AC</option>
                <option value="14">V14 – Water Pump</option>
                <option value="15">V15 – Spare Relay 12</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontFamily: "var(--head)", fontSize: ".65rem", fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>VALUE</span>
              <select value={ptVal} onChange={(e) => setPtVal(e.target.value)} style={{ background: "var(--recess)", border: "2px solid var(--border)", borderRadius: "3px", padding: "6px 8px", fontFamily: "var(--mono)", fontSize: ".75rem", color: "var(--label)", outline: "none" }}>
                <option value="1">1 (ON)</option>
                <option value="0">0 (OFF)</option>
              </select>
            </div>
            <button onClick={runPinTest} style={{ background: "linear-gradient(180deg,#2a3038,#1a2028)", border: "2px solid #0a1018", borderRadius: "3px", color: "rgba(255,255,255,.85)", fontFamily: "var(--head)", fontSize: ".7rem", fontWeight: 800, letterSpacing: ".15em", padding: "8px 16px", cursor: "pointer", textTransform: "uppercase" }}>SEND</button>
          </div>
          <div style={{ background: "linear-gradient(180deg,#0c1016,#0a0e12)", border: "2px solid #050a0e", borderRadius: "3px", padding: "12px", fontFamily: "var(--mono)", fontSize: ".72rem", lineHeight: 1.8, minHeight: "72px", color: "#ffcc44", letterSpacing: ".04em" }}>
            {ptLog}
          </div>
        </div>
      </div>

      {/* TOAST */}
      <div className={`toast ${toast.show ? 'show' : ''} ${toast.isErr ? 'err' : ''}`}>{toast.msg}</div>
    </div>
  );
}
