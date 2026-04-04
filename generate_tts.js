const fs = require('fs');
const path = require('path');

const apiKey = "AIzaSyDJw2w30R8mW-KlY8nVEuSPAT0Xtmyj9K8";
const modelId = "gemini-2.5-flash-preview-tts";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

// Standard phrases for pre-generation
const phrases = [
    { name: "bedroom_lights_on", text: "Bedroom lights are now on" },
    { name: "bedroom_lights_off", text: "Bedroom lights are now off" },
    { name: "bedroom_fan_on", text: "Bedroom fan is now on" },
    { name: "bedroom_fan_off", text: "Bedroom fan is now off" },
    { name: "balcony_lights_on", text: "Balcony lights are now on" },
    { name: "balcony_lights_off", text: "Balcony lights are now off" },
    { name: "hall_fan_on", text: "Hall fan is now on" },
    { name: "hall_fan_off", text: "Hall fan is now off" },
    { name: "hall_light_on", text: "Hall light is now on" },
    { name: "hall_light_off", text: "Hall light is now off" },
    { name: "kitchen_lights_on", text: "Kitchen lights are now on" },
    { name: "kitchen_lights_off", text: "Kitchen lights are now off" },
    { name: "kitchen_fan_on", text: "Kitchen fan is now on" },
    { name: "kitchen_fan_off", text: "Kitchen fan is now off" },
    { name: "bathroom_lights_on", text: "Bathroom lights are now on" },
    { name: "bathroom_lights_off", text: "Bathroom lights are now off" },
    { name: "fridge_on", text: "Fridge is now on" },
    { name: "fridge_off", text: "Fridge is now off" },
    { name: "ac_on", text: "Air conditioner is now on" },
    { name: "ac_off", text: "Air conditioner is now off" },
    { name: "water_pump_on", text: "Water pump is now on" },
    { name: "water_pump_off", text: "Water pump is now off" },
    { name: "door_opening", text: "Opening the front entrance door" },
    { name: "door_closing", text: "Closing the front entrance door" },
    { name: "sleep_mode_on", text: "Sleep mode activated. Goodnight." },
    { name: "welcome_mode_on", text: "Welcome home. All lights are now on." },
    { name: "full_power_on", text: "Full power mode activated. All relays are on." },
    { name: "mode_off", text: "Manual mode active." }
];

async function generate() {
    const dir = path.join(__dirname, 'public', 'assets', 'tts', 'en');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`Starting generation for ${phrases.length} phrases...`);
    console.log("NOTE: This model has a strict 3 RPM limit. This script will take ~10 minutes.");

    for (const item of phrases) {
        // Skip if exists
        const filePath = path.join(dir, `${item.name}.mp3`);
        if (fs.existsSync(filePath)) {
            console.log(`- Skipping ${item.name} (already exists)`);
            continue;
        }

        console.log(`- Generating: ${item.name}...`);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `[natural, calm, helpful] ${item.text}` }] }],
                    generationConfig: {
                        response_modalities: ["AUDIO"],
                        speech_config: {
                          voice_config: {
                            prebuilt_voice_config: {
                              voice_name: "Aoife" 
                            }
                          }
                        }
                    }
                })
            });

            const data = await res.json();
            
            if (res.status === 429) {
                console.error(`  RATE LIMIT HIT. Waiting 60s before retry...`);
                await new Promise(r => setTimeout(r, 60000));
                // Retry this item
                const retryRes = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `[natural, calm, helpful] ${item.text}` }] }],
                        generationConfig: {
                            response_modalities: ["AUDIO"]
                        }
                    })
                });
                const retryData = await retryRes.json();
                const audioData = retryData.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
                if (audioData) {
                    fs.writeFileSync(filePath, Buffer.from(audioData, "base64"));
                    console.log(`  ✓ Retry Success`);
                } else {
                    console.error(`  ✗ Retry Failed`);
                }
            } else {
                const audioData = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
                if (audioData) {
                    fs.writeFileSync(filePath, Buffer.from(audioData, "base64"));
                    console.log(`  ✓ Success`);
                } else {
                    console.error(`  ✗ Failed: ${JSON.stringify(data)}`);
                }
            }
        } catch (e) {
            console.error(`  ! Error:`, e.message);
        }
        
        // Wait 21 seconds between requests to respect 3 RPM limit
        await new Promise(r => setTimeout(r, 21000));
    }
    console.log("All tasks complete!");
}

generate();
