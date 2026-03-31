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
  [60, 1.00],  // r12 spare
  [60, 1.00],  // r13 spare
  [60, 1.00],  // r14 spare
  [60, 1.00],  // r15 spare
];

const LIGHT_RELAYS = [0, 2, 4, 5, 7];

export default function Home() {
  const [lang, setLang] = useState<"en" | "gu">("en");
  const [mounted, setMounted] = useState(false);
  const t = translations[lang];

  const [relayMap] = useState<Record<string, number>>(defaultMap);
  const [relayState, setRelayState] = useState<boolean[]>(new Array(16).fill(false));
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [doorOpen, setDoorOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [vLog, setVLog] = useState<React.ReactNode>("");
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

  const [clickedBtns, setClickedBtns] = useState<Record<string, string>>({});

  const applianceNames = React.useMemo(() => [
    t.bedroomLights, t.bedroomFan, t.balconyLights, t.hallFan,
    t.hallLight, t.kitchenLights, t.kitchenFan, t.bathroomLights,
    t.fridge, t.ac, t.waterPump, t.spareRelay, "Relay 12", "Relay 13", "Relay 14", "Relay 15"
  ], [t]);

  const SCENES_DATA = React.useMemo(() => ({
    sleep: {
      key: "sleep",
      label: t.sleepMode,
      pins: [] as number[],
      speech: lang === "en" ? "Activating sleep mode. Turning everything off." : "સ્લીપ મોડ ચાલુ. બધું બંધ.",
      toast: t.sleepMode + " → " + t.allOff,
    },
    welcome: {
      key: "welcome",
      label: t.welcomeMode,
      pins: [0, 2, 4, 5] as number[],
      speech: lang === "en" ? "Welcome mode activated. Entrance and living lights are on." : "વેલકમ મોડ ચાલુ. લાઈટો ચાલુ છે.",
      toast: t.welcomeMode + " → " + t.entryOn,
    },
    full: {
      key: "full",
      label: t.fullPower,
      pins: Array.from({ length: 12 }, (_, i) => i) as number[],
      speech: lang === "en" ? "Full power mode activated. Everything is now on." : "ફુલ પાવર મોડ ચાલુ. બધું ચાલુ છે.",
      toast: t.fullPower + " → " + t.allOn,
    }
  }), [t, lang]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const humGainRef = useRef<GainNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

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

  // Speak Feedback
  const speakFeedback = (text: string) => {
    if (!isVoiceEnabled) return;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (preferredVoiceRef.current) utterance.voice = preferredVoiceRef.current;
      utterance.rate = 1.0; 
      utterance.pitch = 1.1; 
      window.speechSynthesis.speak(utterance);
    }
  };

  // Handlers
  const handleSetRelay = useCallback((i: number, on: boolean, silent = false) => {
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
      const action = on ? (lang === "en" ? "Switching on" : "ચાલુ") : (lang === "en" ? "Switching off" : "બંધ");
      speakFeedback(lang === "en" ? `${action} the ${applianceNames[i]}` : `${applianceNames[i]} ${action}`);
      showToast(`${applianceNames[i]} → ${on ? "ON" : "OFF"}`);
    }
  }, [relayMap, lang, applianceNames, showToast, playClick, speakFeedback]);

  const handleToggleAllLights = useCallback(() => {
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
        blynkSet(mappedPin, on ? 1 : 0);
      }
    })();

    playClick(on);
    const status = on ? (lang === "en" ? "on" : "ચાલુ") : (lang === "en" ? "off" : "બંધ");
    speakFeedback(lang === "en" ? `Switching ${on ? "on" : "off"} all lights` : `બધી લાઇટો ${status}`);
    showToast(t.allLights + ' → ' + (on ? 'ON' : 'OFF'));
  }, [relayState, relayMap, lang, t, showToast, playClick, speakFeedback]);

  const handleDoor = useCallback((open: boolean, silent = false) => {
    blynkSet(16, open ? 120 : 0);
    setDoorOpen(open);
    if (!silent) {
      playClick(open);
      const action = open ? (lang === "en" ? "Opening" : "ખુલ્લો") : (lang === "en" ? "Closing" : "બંધ");
      speakFeedback(lang === "en" ? `${action} the door` : `દરવાજો ${action}`);
      showToast(`${t.doorControl} → ${open ? t.opened + ' 🔓' : t.closed + ' 🔒'}`);
    }
  }, [lang, t, showToast, playClick, speakFeedback]);

  const handleSceneMode = useCallback((mode: string) => {
    const scene = (SCENES_DATA as any)[mode];
    if (!scene) return;
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
  }, [SCENES_DATA, relayMap, speakFeedback, showToast, playClick]);

  const handleSceneOff = useCallback(() => {
    setActiveScene(null);
    setClickedBtns(prev => ({ ...prev, "scene-off": "clicking-off" }));
    setTimeout(() => {
      setClickedBtns(prev => ({ ...prev, "scene-off": "" }));
    }, 300);
    playClick(false);
    speakFeedback(lang === "en" ? "Scene mode turned off. Manual control is active." : "સીન મોડ બંધ થયો. મેન્યુઅલ કંટ્રોલ ચાલુ છે.");
    showToast(t.modeOff + " (" + t.manual + ")");
  }, [lang, t, showToast, playClick, speakFeedback]);

  // Voice Command Processing
  const processCmd = useCallback((raw: string) => {
    const norm = (s: string) => s
      .toLowerCase()
      .replace(/\b(the|a|an|please|hey|ok|okay|can you|could you)\b/g, '')
      .replace(/\bswitch\b/g, 'turn').replace(/\bpower on\b/g, 'turn on')
      .replace(/\bshut off\b|\bpower off\b/g, 'turn off')
      .replace(/\bair conditioner\b|\bair conditioning\b|\baircon\b/g, 'ac')
      .replace(/\brefrigerator\b/g, 'fridge')
      .replace(/\bpump\b/g, 'water pump')
      .replace(/\s+/g, ' ').trim();

    const cmd = norm(raw);
    const logV = (msg: string, cls = '') => setVLog(<span className={cls}>{msg}</span>);

    // Door
    if (/\bopen\b.*\bdoor\b|\bdoor\b.*\bopen\b|\bunlock\b|darvajo.*kholo|darvajo.*khol|darvajo.*ugado/.test(cmd) || 
        /દરવાજો.*ખોલો|દરવાજો.*ખોલ|ખોલો.*દરવાજો|દરવાજો.*ઉઘાડો|ઉઘાડો.*દરવાજો/.test(cmd)) { 
      handleDoor(true); 
      logV(`✓ ${t.opened} 🔓`, 'action'); 
      return true; 
    }
    if (/\bclose\b.*\bdoor\b|\bdoor\b.*\bclose\b|\block\b|darvajo.*bandh/.test(cmd) || 
        /દરવાજો.*બંધ|બંધ.*દરવાજો/.test(cmd)) { 
      handleDoor(false); 
      logV(`✓ ${t.closed} 🔒`, 'action'); 
      return true; 
    }

    // Scenes
    if (/\bsleep mode\b|\bgood night\b|\bnight mode\b|sleep.*mod|good.*night/.test(cmd) || /સ્લીપ.*મોડ|સુઈ.*જવું|સુઈ.*જાઓ/.test(cmd)) { 
      handleSceneMode("sleep"); 
      logV(`✓ ${t.sleepMode} activated`, 'action'); 
      return true; 
    }
    if (/\bwelcome mode\b|\bi am home\b|\bhome mode\b|welcome.*mod|home.*mod/.test(cmd) || /વેલકમ.*મોડ|ઘરે.*આવ્યો|ઘરે.*આવી/.test(cmd)) { 
      handleSceneMode("welcome"); 
      logV(`✓ ${t.welcomeMode} activated`, 'action'); 
      return true; 
    }
    if (/\bfull power\b|\beverything on\b|\ball on\b|full.*power|badhu.*chalu/.test(cmd) || /બધું.*ચાલુ|ફુલ.*પાવર|બધું.*ખોલો/.test(cmd)) { 
      handleSceneMode("full"); 
      logV(`✓ ${t.fullPower} activated`, 'action'); 
      return true; 
    }

    let intent: boolean | null = null;
    if (/\bturn on\b|chalu|on\b/.test(cmd) || /\bચાલુ\b/.test(cmd) || /\bચાલુ કરો\b/.test(cmd)) intent = true;
    if (/\bturn off\b|bandh|off\b/.test(cmd) || /\bબંધ\b/.test(cmd) || /\bબંધ કરો\b/.test(cmd)) intent = false;
    
    if (intent === null) return false;

    if (/\ball lights?\b|badhi.*light|badhi.*lite/.test(cmd) || /બધી.*લાઇટ|બધી.*લાઈટ/.test(cmd)) {
      setRelayState(prev => {
        const next = [...prev];
        LIGHT_RELAYS.forEach(i => next[i] = intent!);
        return next;
      });
      LIGHT_RELAYS.forEach(i => blynkSet(relayMap[`r${i}`] ?? i, intent! ? 1 : 0));
      logV(`✓ ${t.allLights} → ${intent ? 'ON' : 'OFF'}`, 'action');
      return true;
    }

    const commands: [RegExp, number, string][] = [
      [/\bbedroom fan\b|bedroom.*pankho|bedroom.*fan|બેડરૂમ.*પંખો/, 1, t.bedroomFan],
      [/\bbedroom lights?\b|\bbedroom light\b|bedroom.*light|bedroom.*lite|બેડરૂમ.*લાઇટ/, 0, t.bedroomLights],
      [/\bbalcony\b|balcony.*light|balcony.*lite|બાલ્કની/, 2, t.balconyLights],
      [/\bhall fan\b|hall.*pankho|hall.*fan|હોલ.*પંખો/, 3, t.hallFan],
      [/\bhall lights?\b|\bhall light\b|hall.*light|hall.*lite|હોલ.*લાઇટ/, 4, t.hallLight],
      [/\bkitchen fan\b|kitchen.*pankho|kitchen.*fan|રસોડા.*પંખો/, 6, t.kitchenFan],
      [/\bkitchen lights?\b|\bkitchen light\b|kitchen.*light|kitchen.*lite|રસોડા.*લાઇટ/, 5, t.kitchenLights],
      [/\bbathroom\b|bathroom.*light|bathroom.*lite|બાથરૂમ/, 7, t.bathroomLights],
      [/\bfridge\b|fridge|ફ્રીજ/, 8, t.fridge],
      [/\bac\b|ac|એસી/, 9, t.ac],
      [/\bwater pump\b|water.*pump|motor|વોટર.*પંપ|મોટર/, 10, t.waterPump]
    ];

    for (const [regex, idx, name] of commands) {
      if (regex.test(cmd)) {
        handleSetRelay(idx, intent);
        logV(`✓ ${name} → ${intent ? 'ON' : 'OFF'}`, 'action');
        return true;
      }
    }
    return false;
  }, [relayMap, lang, t, applianceNames]);

  // Effects
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      setVLog(t.awaitingVoice);
    }
  }, [mounted, t.awaitingVoice]);

  const setupVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVLog("NOT SUPPORTED");
      return;
    }
    recognitionRef.current = new SR();
    const r = recognitionRef.current;
    r.continuous = false; 
    r.lang = lang === 'en' ? 'en-IN' : 'gu-IN'; 
    r.interimResults = false; 
    r.maxAlternatives = 6;
    r.onresult = (e: any) => {
      const alts = Array.from({ length: e.results[0].length }, (_, i) => e.results[0][i].transcript.toLowerCase().trim());
      setVLog(<span className="heard">Heard: "{alts[0]}"</span>);
      if (!alts.some((t: any) => processCmd(t))) {
        setVLog(<span className="error">✗ Not recognised: "{alts[0]}"</span>);
      }
    };
    r.onend = () => setIsListening(false);
    r.onerror = (e: any) => {
      if (e.error !== 'no-speech') setVLog(<span className="error">Error: {e.error}</span>);
      setIsListening(false);
    };
  }, [processCmd, lang]);

  useEffect(() => {
    if (mounted) {
      setupVoice();
      blynkSet(16, 0); 
    }
  }, [setupVoice, mounted]);

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

  const anyLightOn = LIGHT_RELAYS.some(li => relayState[li]);
  const allLightsOn = LIGHT_RELAYS.every(li => relayState[li]);

  useEffect(() => {
    if (anyLightOn) document.body.classList.add('lights-on');
    else document.body.classList.remove('lights-on');
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

  if (!mounted) return null;

  return (
    <div className="cabinet">
      {/* LANGUAGE TOGGLE */}
      <div style={{ position: "fixed", top: "10px", left: "10px", zIndex: 1000, display: "flex", gap: "6px" }}>
        <button onClick={() => setLang("en")} style={{ background: lang === "en" ? "var(--blue)" : "var(--recess)", border: "2px solid var(--border)", borderRadius: "4px", color: "white", padding: "6px 10px", fontSize: "0.65rem", fontFamily: "var(--head)", fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", transition: "all 0.2s" }}>ENGLISH</button>
        <button onClick={() => setLang("gu")} style={{ background: lang === "gu" ? "var(--blue)" : "var(--recess)", border: "2px solid var(--border)", borderRadius: "4px", color: "white", padding: "6px 10px", fontSize: "0.65rem", fontFamily: "var(--head)", fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", transition: "all 0.2s" }}>ગુજરાતી</button>
      </div>

      {/* VOICE TOGGLE */}
      <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} style={{ position: "fixed", top: "10px", right: "10px", zIndex: 1000, background: isVoiceEnabled ? "var(--blue)" : "var(--muted)", border: "2px solid var(--border)", borderRadius: "4px", color: "white", padding: "6px 10px", fontSize: "0.65rem", fontFamily: "var(--head)", fontWeight: 800, letterSpacing: "0.1em", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s" }}>
        <span>{isVoiceEnabled ? t.voiceOn : t.voiceOff}</span>
      </button>

      {/* NAMEPLATE */}
      <div className="nameplate">
        <div className="np-rivet tl"></div><div className="np-rivet tr"></div><div className="np-rivet bl"></div><div className="np-rivet br"></div>
        <div className="np-inner">
          <div className="np-emblem">
            <svg className="emblem-svg" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="26" cy="26" r="23" stroke="#c8a830" strokeWidth="1.5" fill="none" opacity="0.4" />
              <g fill="#c8a830" opacity="0.85"><rect x="24.5" y="1" width="3" height="6" rx="1" /><rect x="24.5" y="45" width="3" height="6" rx="1" /><rect x="1" y="24.5" width="6" height="3" rx="1" /><rect x="45" y="24.5" width="6" height="3" rx="1" /><rect x="38.5" y="5.5" width="3" height="6" rx="1" transform="rotate(45 40 8.5)" /><rect x="6.5" y="38.5" width="3" height="6" rx="1" transform="rotate(45 8 41.5)" /><rect x="6.5" y="5.5" width="3" height="6" rx="1" transform="rotate(-45 8 8.5)" /><rect x="38.5" y="38.5" width="3" height="6" rx="1" transform="rotate(-45 40 41.5)" /></g>
              <circle cx="26" cy="26" r="17" fill="#0e1418" stroke="#c8a830" strokeWidth="1.2" opacity="0.9" /><circle cx="26" cy="26" r="14" stroke="#c8a830" strokeWidth="0.6" fill="none" opacity="0.3" strokeDasharray="3 2" /><path d="M29 10 L20 27 H27 L23 42 L34 23 H27 L31 10 Z" fill="url(#bolt-grad)" filter="url(#bolt-glow)" />
              <defs><linearGradient id="bolt-grad" x1="26" y1="10" x2="26" y2="42" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#ffe060" /><stop offset="50%" stopColor="#c8a830" /><stop offset="100%" stopColor="#a07820" /></linearGradient><filter id="bolt-glow" x="-40%" y="-20%" width="180%" height="140%"><feGaussianBlur stdDeviation="1.5" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter></defs>
            </svg>
            <div className="emblem-badge">ITI</div>
          </div>
          <div className="np-center"><div className="np-govt">{t.govt}</div><div className="np-inst">{t.inst}</div><div className="np-trade">{t.trade}<div className="np-trade-divider"></div></div><div className="np-project">{t.project}</div></div>
          <div className="np-batch"><div className="np-batch-label">{t.batch}</div><div className="np-batch-num">83</div><div className="np-batch-sect">D–E</div><div className="np-batch-sub">2025–26</div></div>
        </div>
      </div>

      {/* STATUS INDICATORS */}
      <div className="indicator-row"><div className="pilot-light pl-green"></div><span className="ind-label">{t.power}</span><div className="pilot-light pl-red"></div><span className="ind-label">{t.fault}</span><div className="pilot-light pl-orange"></div><span className="ind-label">{t.manual}</span><div className="pilot-light pl-blue"></div><span className="ind-label">{t.auto}</span><div className="ind-sep"></div><span className="sys-id">PANEL · 16CH · V3.0</span></div>

      {/* 3-PHASE + ENERGY METER */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">{t.threePhase}</span><span className="ps-circuit">415V AC · 50Hz · TN-S</span></div>
        <div className="ps-body" style={{ padding: 0 }}>
          <div className="phase-row">
            <div className="phase-unit"><div className="phase-lamp-housing"><div className="phase-jewel jewel-r"></div></div><div className="phase-label r-lbl">R</div><div className="phase-reading">230 V</div></div><div className="phase-divider"></div>
            <div className="phase-unit"><div className="phase-lamp-housing"><div className="phase-jewel jewel-y"></div></div><div className="phase-label y-lbl">Y</div><div className="phase-reading">231 V</div></div><div className="phase-divider"></div>
            <div className="phase-unit"><div className="phase-lamp-housing"><div className="phase-jewel jewel-b"></div></div><div className="phase-label b-lbl">B</div><div className="phase-reading">229 V</div></div><div className="phase-divider"></div>
            <div className="phase-unit" style={{ gap: "10px" }}><div className="phase-spec"><div className="phase-spec-val">415 V</div><div className="phase-spec-unit">Line–Line</div></div><div className="phase-spec"><div className="phase-spec-val">230 V</div><div className="phase-spec-unit">Phase–N</div></div></div>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <div className="meter-display">
              <div className="meter-inner">
                <div className="meter-title-bar"><span className="meter-title">⬡ {t.energyMonitor}</span><span className="meter-live-dot"></span></div>
                <div className="meter-grid">
                  <div className="meter-cell v-cell"><div className="meter-cell-label">{t.voltage}</div><div className="meter-cell-value">{meter.voltage.toFixed(1)}</div><div className="meter-cell-unit">V rms</div></div>
                  <div className="meter-cell i-cell"><div className="meter-cell-label">{t.current}</div><div className="meter-cell-value">{meter.current.toFixed(2)}</div><div className="meter-cell-unit">A rms</div></div>
                  <div className="meter-cell p-cell"><div className="meter-cell-label">{t.activePwr}</div><div className="meter-cell-value">{meter.powerStr}</div><div className="meter-cell-unit">{meter.powerUnit}</div></div>
                  <div className="meter-cell f-cell"><div className="meter-cell-label">{t.frequency}</div><div className="meter-cell-value">{meter.freq.toFixed(1)}</div><div className="meter-cell-unit">Hz</div></div>
                </div>
                <div className="meter-pf-row"><span className="meter-pf-label">{t.pf}</span><div className="meter-pf-bar-bg"><div className="meter-pf-bar-fill" style={{ width: `${meter.pfPct}%` }}></div></div><span className="meter-pf-val">{meter.pf}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LIGHTING */}
      <div className={`panel-section lighting-section ${anyLightOn ? 'lights-on' : ''}`} id="lighting-section">
        <div className="ps-head"><span className="ps-title">{t.lighting}</span><span className="ps-circuit">Circuit A · V1 V2 V3 V5 V8</span></div>
        <div className="ps-body">
          <div className="breaker-grid">
            <div className={`breaker-btn light-btn wide ${allLightsOn ? 'on' : ''} ${clickedBtns['all-lights'] || ''}`} onClick={handleToggleAllLights}><div className="mcb-led"></div><div className="mcb-slot"><div className="mcb-handle"></div></div><div className="breaker-name">{t.allLights}</div><div className="breaker-pin">V1·V2·V3·V5·V8</div></div>
            {renderBreaker("r0", 0, t.bedroomLights, true)}{renderBreaker("r2", 2, t.balconyLights, true)}{renderBreaker("r4", 4, t.hallLight, true)}{renderBreaker("r5", 5, t.kitchenLights, true)}{renderBreaker("r7", 7, t.bathroomLights, true, true)}
          </div>
        </div>
      </div>

      {/* FAN CIRCUIT */}
      <div className="panel-section"><div className="ps-head"><span className="ps-title">{t.fanCircuit}</span><span className="ps-circuit">Circuit B · V9 V10 V13</span></div><div className="ps-body"><div className="breaker-grid-3">{renderBreaker("r1", 1, t.bedroomFan)}{renderBreaker("r3", 3, t.hallFan)}{renderBreaker("r6", 6, t.kitchenFan)}</div></div></div>

      {/* APPLIANCES */}
      <div className="panel-section"><div className="ps-head"><span className="ps-title">{t.appliances}</span><span className="ps-circuit">Circuit C · V11 V12 V14</span></div><div className="ps-body"><div className="breaker-grid-3">{renderBreaker("r8", 8, t.fridge)}{renderBreaker("r9", 9, t.ac)}{renderBreaker("r10", 10, t.waterPump)}</div></div></div>

      {/* EXTRA CONTROLS */}
      <div className="panel-section"><div className="ps-head"><span className="ps-title">{t.extraControls}</span><span className="ps-circuit">Circuit D · V15</span></div><div className="ps-body"><div className="breaker-grid">{renderBreaker("r11", 11, t.spareRelay)}</div></div></div>

      {/* SCENE / PRESET MODES */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">{t.sceneModes}</span><span className="ps-circuit">One Tap · Automation</span></div>
        <div className="ps-body">
          <div className="scene-grid">
            <button className={`scene-btn sleep ${activeScene === "sleep" ? "active" : ""} ${clickedBtns["scene-sleep"] || ""}`} onClick={() => handleSceneMode("sleep")}><span className="scene-title">😴 {t.sleepMode}</span><span className="scene-sub">{t.sleepSub}</span></button>
            <button className={`scene-btn welcome ${activeScene === "welcome" ? "active" : ""} ${clickedBtns["scene-welcome"] || ""}`} onClick={() => handleSceneMode("welcome")}><span className="scene-title">🏠 {t.welcomeMode}</span><span className="scene-sub">{t.welcomeSub}</span></button>
            <button className={`scene-btn full ${activeScene === "full" ? "active" : ""} ${clickedBtns["scene-full"] || ""}`} onClick={() => handleSceneMode("full")}><span className="scene-title">⚡ {t.fullPower}</span><span className="scene-sub">{t.fullSub}</span></button>
            <button className={`scene-btn off ${activeScene === null ? "active" : ""} ${clickedBtns["scene-off"] || ""}`} onClick={handleSceneOff}><span className="scene-title">🛑 {t.modeOff}</span><span className="scene-sub">{t.modeOffSub}</span></button>
          </div>
          <div className="scene-status">{t.activeMode}: <b>{activeScene ? (SCENES_DATA as any)[activeScene].label : t.manual}</b></div>
        </div>
      </div>

      {/* DOOR CONTROL */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">{t.doorControl}</span><span className="ps-circuit">Servo · V16</span></div>
        <div className="ps-body">
          <div className="door-row">
            <button className={`door-btn open-btn ${doorOpen ? 'active' : ''}`} onClick={() => handleDoor(true)}>🔓 &nbsp;{t.open}</button>
            <button className={`door-btn close-btn ${!doorOpen ? 'active' : ''}`} onClick={() => handleDoor(false)}>🔒 &nbsp;{t.close}</button>
          </div>
          <div className="door-status">{t.status}: <b>{doorOpen ? t.opened : t.closed}</b></div>
          <div className="door-angle">{t.servoAngle}: {doorOpen ? '120°' : '0°'}</div>
        </div>
      </div>

      {/* VOICE CONTROL */}
      <div className="panel-section">
        <div className="ps-head"><span className="ps-title">{t.voiceControl}</span><span className="ps-circuit">{lang === 'en' ? 'en-IN' : 'gu-IN'}</span></div>
        <div className="ps-body">
          <button className={`voice-btn ${isListening ? 'listening' : ''}`} onClick={toggleVoice}><span>🎙</span><span>{isListening ? t.listening : t.tapToSpeak}</span></button>
          <div className="voice-log">{vLog}</div>
          <div className="cmd-table">
            <div className="cmd-table-head"><span className="cmd-table-head-title">{t.voiceCommands}</span><span className="cmd-table-head-sub">— {t.speakExactly}</span></div>
            <div className="cmd-rows">
              <div className="cmd-group"><div className="cmd-group-title special">⭐ {t.allLights}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdAllOn}</span><span className="cmd-badge badge-all">{t.allOn}</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdAllOff}</span><span className="cmd-badge badge-all">{t.allOff}</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title special">🎬 {t.sceneModes}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdSleep}</span><span className="cmd-badge badge-all">{t.allOff}</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdWelcome}</span><span className="cmd-badge badge-all">{t.entryOn}</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdFull}</span><span className="cmd-badge badge-all">{t.allOn}</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">🚪 {t.doorControl}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdDoorOpen}</span><span className="cmd-badge badge-door">{t.opened}</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdDoorClose}</span><span className="cmd-badge badge-door">{t.closed}</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">💡 {t.bedroomLights}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.bedroomLights}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.bedroomLights}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">🌀 {t.bedroomFan}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.bedroomFan}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.bedroomFan}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">💡 {t.balconyLights}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.balconyLights}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.balconyLights}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">🌀 {t.hallFan}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.hallFan}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.hallFan}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">💡 {t.hallLight}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.hallLight}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.hallLight}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">💡 {t.kitchenLights}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.kitchenLights}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.kitchenLights}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">🌀 {t.kitchenFan}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.kitchenFan}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.kitchenFan}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">💡 {t.bathroomLights}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.bathroomLights}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.bathroomLights}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">🧊 {t.fridge}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.fridge}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.fridge}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">❄️ {t.ac}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.ac}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.ac}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
              <div className="cmd-group"><div className="cmd-group-title">💧 {t.waterPump}</div><div className="cmd-entry"><span className="cmd-say">{t.cmdOn}{t.waterPump}{t.suffixOn || ""}</span><span className="cmd-badge badge-on">ON</span></div><div className="cmd-entry"><span className="cmd-say">{t.cmdOff}{t.waterPump}{t.suffixOff || ""}</span><span className="cmd-badge badge-off">OFF</span></div></div>
            </div>
          </div>
        </div>
      </div>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.isErr ? 'err' : ''}`}>{toast.msg}</div>
    </div>
  );
}
