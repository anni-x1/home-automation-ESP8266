"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const BASE = "/api/blynk/update";
const STORAGE_KEY = "relay-setup-profiles-v1";
const TOTAL_RELAYS = 16;

type RelayCategory = "light" | "fan" | "appliance" | "custom";

type RelayProfile = {
  relaySlot: number;
  relayName: string;
  virtualPin: number;
  category: RelayCategory;
  watts: number;
  powerFactor: number;
  notes: string;
  verifiedOn: boolean;
  verifiedOff: boolean;
  circuitConfirmed: boolean;
  createdAt: string;
};

const categoryOptions: RelayCategory[] = ["light", "fan", "appliance", "custom"];

export default function RelaySetupPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<RelayProfile, "createdAt">>({
    relaySlot: 12,
    relayName: "",
    virtualPin: 6,
    category: "custom",
    watts: 60,
    powerFactor: 0.9,
    notes: "",
    verifiedOn: false,
    verifiedOff: false,
    circuitConfirmed: false
  });

  const canContinue = useMemo(() => {
    if (step === 1) return true;
    if (step === 2) return form.relayName.trim().length >= 2;
    if (step === 3) return form.virtualPin >= 0 && form.virtualPin <= 255;
    if (step === 4) return form.watts >= 0 && form.powerFactor > 0 && form.powerFactor <= 1;
    if (step === 5) return form.verifiedOn && form.verifiedOff && form.circuitConfirmed;
    return true;
  }, [form, step]);

  const setField = <K extends keyof Omit<RelayProfile, "createdAt">>(key: K, value: Omit<RelayProfile, "createdAt">[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const runRelayTest = async (turnOn: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${BASE}?v${form.virtualPin}=${turnOn ? 1 : 0}`);
      if (!res.ok) {
        throw new Error(`Blynk request failed (${res.status})`);
      }
      if (turnOn) {
        setField("verifiedOn", true);
        setMessage({ text: `Relay test ON sent to V${form.virtualPin}. Confirm load switched ON.`, isError: false });
      } else {
        setField("verifiedOff", true);
        setMessage({ text: `Relay test OFF sent to V${form.virtualPin}. Confirm load switched OFF.`, isError: false });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown test error";
      setMessage({ text, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = () => {
    const entry: RelayProfile = { ...form, createdAt: new Date().toISOString() };
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as RelayProfile[]) : [];
    const withoutSlot = existing.filter(item => item.relaySlot !== entry.relaySlot);
    const next = [entry, ...withoutSlot];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSavedCount(next.length);
    setMessage({ text: `Saved relay profile for slot r${entry.relaySlot} on V${entry.virtualPin}.`, isError: false });
    setStep(6);
  };

  return (
    <div className="relay-setup-page">
      <div className="relay-setup-shell">
        <div className="relay-setup-top">
          <h1>Relay Setup Wizard</h1>
          <p>Step-by-step onboarding to add a new relay and verify it is connected to the circuit.</p>
          <Link className="relay-back-link" href="/">← Back to Control Panel</Link>
        </div>

        <div className="relay-steps">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className={`relay-step-chip ${step === n ? "active" : ""} ${step > n ? "done" : ""}`}>Step {n}</div>
          ))}
        </div>

        <div className="relay-card">
          {step === 1 && (
            <>
              <h2>Safety and prerequisites</h2>
              <ul>
                <li>Switch off mains and follow safe wiring practice before touching terminals.</li>
                <li>Keep relay module COM/NO/NC wiring diagram ready.</li>
                <li>Decide relay slot and Blynk virtual pin in advance.</li>
              </ul>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Relay identity</h2>
              <label>
                Relay slot
                <select value={form.relaySlot} onChange={e => setField("relaySlot", Number(e.target.value))}>
                  {Array.from({ length: TOTAL_RELAYS }, (_, i) => i).map(i => (
                    <option key={i} value={i}>r{i}</option>
                  ))}
                </select>
              </label>
              <label>
                Appliance name
                <input
                  value={form.relayName}
                  onChange={e => setField("relayName", e.target.value)}
                  placeholder="e.g. Study room light"
                />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Blynk virtual pin mapping</h2>
              <label>
                Virtual pin number
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={form.virtualPin}
                  onChange={e => setField("virtualPin", Number(e.target.value))}
                />
              </label>
              <div className="relay-note">This wizard will test using query: <code>?v{form.virtualPin}=1</code> and <code>?v{form.virtualPin}=0</code>.</div>
            </>
          )}

          {step === 4 && (
            <>
              <h2>Category and load defaults</h2>
              <label>
                Category
                <select value={form.category} onChange={e => setField("category", e.target.value as RelayCategory)}>
                  {categoryOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div className="relay-grid">
                <label>
                  Watts
                  <input type="number" min={0} value={form.watts} onChange={e => setField("watts", Number(e.target.value))} />
                </label>
                <label>
                  Power factor
                  <input type="number" min={0.1} max={1} step={0.01} value={form.powerFactor} onChange={e => setField("powerFactor", Number(e.target.value))} />
                </label>
              </div>
              <label>
                Notes (optional)
                <textarea value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Wiring details, terminal notes, breaker label..." />
              </label>
            </>
          )}

          {step === 5 && (
            <>
              <h2>Circuit verification</h2>
              <p>Use test buttons after hardware is connected to verify the relay is added to the actual circuit.</p>
              <div className="relay-test-row">
                <button disabled={busy} onClick={() => runRelayTest(true)}>Send ON test</button>
                <button disabled={busy} onClick={() => runRelayTest(false)}>Send OFF test</button>
              </div>
              <label className="check">
                <input type="checkbox" checked={form.verifiedOn} onChange={e => setField("verifiedOn", e.target.checked)} />
                ON test verified physically
              </label>
              <label className="check">
                <input type="checkbox" checked={form.verifiedOff} onChange={e => setField("verifiedOff", e.target.checked)} />
                OFF test verified physically
              </label>
              <label className="check">
                <input type="checkbox" checked={form.circuitConfirmed} onChange={e => setField("circuitConfirmed", e.target.checked)} />
                Relay is correctly added into the intended circuit
              </label>
            </>
          )}

          {step === 6 && (
            <>
              <h2>Setup completed</h2>
              <p>Relay profile saved successfully.</p>
              <ul>
                <li>Relay slot: r{form.relaySlot}</li>
                <li>Name: {form.relayName}</li>
                <li>Virtual pin: V{form.virtualPin}</li>
                <li>Category: {form.category}</li>
                <li>Saved profiles in browser: {savedCount ?? "—"}</li>
              </ul>
            </>
          )}

          {message && <div className={`relay-msg ${message.isError ? "err" : "ok"}`}>{message.text}</div>}

          <div className="relay-actions">
            <button disabled={step === 1} onClick={() => setStep(prev => Math.max(1, prev - 1))}>Previous</button>
            {step < 5 && (
              <button disabled={!canContinue} onClick={() => setStep(prev => Math.min(6, prev + 1))}>Next</button>
            )}
            {step === 5 && (
              <button disabled={!canContinue} onClick={saveProfile}>Save Relay</button>
            )}
            {step === 6 && (
              <button onClick={() => setStep(1)}>Add Another Relay</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
