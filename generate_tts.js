const fs = require('fs');
const path = require('path');

const apiKey = "AIzaSyDJw2w30R8mW-KlY8nVEuSPAT0Xtmyj9K8";
const modelId = "gemini-2.5-flash-preview-tts";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

// Standard phrases for pre-generation with the "Kore" voice
const phrases = [
    // Appliances (ON)
    { id: "appliance_0_on", text: "Bedroom light is now on" },
    { id: "appliance_1_on", text: "Bedroom fan is now on" },
    { id: "appliance_2_on", text: "Balcony light is now on" },
    { id: "appliance_3_on", text: "Hall fan is now on" },
    { id: "appliance_4_on", text: "Hall light is now on" },
    { id: "appliance_5_on", text: "Kitchen light is now on" },
    { id: "appliance_6_on", text: "Kitchen fan is now on" },
    { id: "appliance_7_on", text: "Bathroom light is now on" },
    { id: "appliance_8_on", text: "Fridge is now on" },
    { id: "appliance_9_on", text: "Air conditioner is now on" },
    { id: "appliance_10_on", text: "Water pump is now on" },
    { id: "appliance_11_on", text: "Spare relay is now on" },

    // Appliances (OFF)
    { id: "appliance_0_off", text: "Bedroom light is now off" },
    { id: "appliance_1_off", text: "Bedroom fan is now off" },
    { id: "appliance_2_off", text: "Balcony light is now off" },
    { id: "appliance_3_off", text: "Hall fan is now off" },
    { id: "appliance_4_off", text: "Hall light is now off" },
    { id: "appliance_5_off", text: "Kitchen light is now off" },
    { id: "appliance_6_off", text: "Kitchen fan is now off" },
    { id: "appliance_7_off", text: "Bathroom light is now off" },
    { id: "appliance_8_off", text: "Fridge is now off" },
    { id: "appliance_9_off", text: "Air conditioner is now off" },
    { id: "appliance_10_off", text: "Water pump is now off" },
    { id: "appliance_11_off", text: "Spare relay is now off" },

    // Door
    { id: "door_on", text: "Opening the front entrance door" },
    { id: "door_off", text: "Closing the front entrance door" },

    // Scenes
    { id: "scene_sleep", text: "Sleep mode activated. Goodnight." },
    { id: "scene_welcome", text: "Welcome home. Selected lights are now on." },
    { id: "scene_full", text: "Full power mode activated. All relays are on." },
    { id: "scene_off", text: "Scene mode turned off. Manual control is active." },

    // Group Commands
    { id: "group_lights_on", text: "Turning on all lights" },
    { id: "group_lights_off", text: "Turning off all lights" },
    { id: "group_fans_on", text: "Turning on all fans" },
    { id: "group_fans_off", text: "Turning off all fans" },
    { id: "group_apps_on", text: "Turning on all appliances" },
    { id: "group_apps_off", text: "Turning off all appliances" }
];

async function generate() {
    const dir = path.join(__dirname, 'public', 'assets', 'tts', 'en');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`Starting high-quality "Kore" voice generation for ${phrases.length} phrases...`);
    console.log("3 RPM limit - This will take approximately 12-15 minutes.");

    for (const item of phrases) {
        const filePath = path.join(dir, `${item.id}.mp3`);
        
        // Skip existing to avoid wasting quota on retries
        if (fs.existsSync(filePath)) {
            console.log(`- Skipping ${item.id} (already exists)`);
            continue;
        }

        console.log(`- Generating: ${item.id}...`);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `[natural, warm, helpful] ${item.text}` }] }],
                    generationConfig: {
                        response_modalities: ["AUDIO"],
                        speech_config: {
                          voice_config: {
                            prebuilt_voice_config: {
                              voice_name: "Kore" 
                            }
                          }
                        }
                    }
                })
            });

            const data = await res.json();
            
            if (res.status === 429) {
                console.error(`  RATE LIMIT. Waiting 65s...`);
                await new Promise(r => setTimeout(r, 65000));
                // Wait and loop will retry in next iteration (because file wasn't written)
                continue;
            }

            const audioData = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
            if (audioData) {
                fs.writeFileSync(filePath, Buffer.from(audioData, "base64"));
                console.log(`  ✓ Created ${item.id}.mp3`);
            } else {
                console.error(`  ✗ Failed for ${item.id}: ${JSON.stringify(data)}`);
            }
        } catch (e) {
            console.error(`  ! Error:`, e.message);
        }
        
        // Wait 22 seconds to stay safely under 3 RPM
        await new Promise(r => setTimeout(r, 22000));
    }
    console.log("Pre-generation complete! Your app will now use these high-quality offline files.");
}

generate();
