 // --- Core Application State (In-Memory Only) ---
        let conversationHistory = [];
        
        // Base constants for API call
        const API_KEY_PLACEHOLDER = "AIzaSyCdj2YgWUN7uOOBb6E-y278Q1HL1kUQ_Mg"; // Required placeholder for environment injection
        const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';

        // Function to dynamically get the correct API URL (either manual key or placeholder)
        const getApiUrl = (manualKey) => {
            const base = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
            // If manualKey is provided, use it. Otherwise, rely on the environment injecting the key via the placeholder pattern.
            return manualKey ? `${base}?key=${manualKey}` : `${base}?key=${API_KEY_PLACEHOLDER}`;
        }
        
        // Use a static ID for display, as no real authentication is happening
        const userId = 'GUEST-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        // --- Structured Output Schema for Medicine Suggestion ---
        const medicineSchema = {
            type: "OBJECT",
            properties: {
                "medicineName": { 
                    "type": "STRING", 
                    "description": "The common name of the non-prescription, over-the-counter medicine suggested (e.g., Ibuprofen, Antacid). For complex issues like diabetes, use the common drug class (e.g., ACE Inhibitors, Metformin) and state 'Prescription Required' in the dosage field." 
                },
                "purpose": { 
                    "type": "STRING", 
                    "description": "What this medicine is typically used for (e.g., pain relief, fever reduction, allergy, or managing high blood pressure)." 
                },
                "dosage": { 
                    "type": "STRING", 
                    "description": "Typical adult dosage instructions (e.g., 'One 500mg tablet every 4-6 hours'). If it is a prescription drug, this MUST state 'PRESCRIPTION REQUIRED - Consult Physician for Dosage'." 
                },
                "warning": { 
                    "type": "STRING", 
                    // SIMPLIFIED WARNING TEXT IN SCHEMA
                    "description": "A MANDATORY concise safety reminder about usage or contraindications. Example: 'Do not exceed daily limit.' or 'Not suitable for children.'" 
                }
            },
            required: ["medicineName", "purpose", "dosage", "warning"]
        };


        // --- Message Display and Handling ---

        function displayMessage(text, sender, isStructured = false) {
            const chatContainer = document.getElementById('chat-messages');
            const messageElement = document.createElement('div');
            messageElement.className = `flex mb-4 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
            
            let contentClass;
            let innerHTML;

            if (isStructured && typeof text === 'object') {
                // Handle Structured Medicine Suggestion
                // Check if it's a prescription warning to change the card color
                const isPrescription = text.dosage.includes("PRESCRIPTION REQUIRED");
 
                contentClass = isPrescription
                    ? 'bg-yellow-50 border-2 border-orange-500 rounded-xl p-4 max-w-xs md:max-w-lg shadow-xl'
                    : 'bg-white border-2 border-teal-500 rounded-xl p-4 max-w-xs md:max-w-lg shadow-xl';

                innerHTML = `
                    <h3 class="text-xl font-bold ${isPrescription ? 'text-orange-700' : 'text-teal-700'} border-b pb-2 mb-2">
                        ${isPrescription ? '⚠️ Prescription Information' : '💊 Suggested OTC Information'}
                    </h3>
                    <div class="space-y-2 text-gray-800">
                        <p><span class="font-semibold">medicine:</span> ${text.medicineName}</p>
                        <p><span class="font-semibold">Purpose:</span> ${text.purpose}</p>
                        <p><span class="font-semibold">Dosage:</span> <span class="${isPrescription ? 'font-bold text-red-600' : 'text-gray-800'}">${text.dosage}</span></p>
                        <!-- SIMPLIFIED: Using the concise warning from the schema -->
                         <p class="mt-2 text-sm italic text-gray-500"><span class="font-semibold">Note:</span> ${text.warning}</p>
                    </div>
                `;
                // REMOVED THE LARGE RED WARNING BOX HERE
            } else {
                // Handle Regular Text Message (including API Errors)
                contentClass = sender === 'user' 
                    ? 'bg-blue-500 text-white rounded-t-xl rounded-bl-xl p-3 max-w-xs md:max-w-md shadow-lg'
                    : 'bg-gray-100 text-gray-800 rounded-t-xl rounded-br-xl p-3 max-w-xs md:max-w-md shadow-lg';
                
                let renderedText = text;
                if (text.startsWith('**API Error:**')) {
                    renderedText = `<span class="font-bold text-red-600">Error:</span> ${text.substring(14)}`;
                    contentClass = 'bg-red-200 text-gray-800 rounded-xl p-3 max-w-xs md:max-w-md shadow-lg';
                }

                innerHTML = `<div class="whitespace-pre-wrap">${renderedText}</div>`;
            }


            messageElement.innerHTML = `<div class="${contentClass}">${innerHTML}</div>`;
            chatContainer.appendChild(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Replaced saveMessage with a function that updates in-memory history
        function saveMessage(content, role, isStructured = false) {
            // Only add clean text to history, not the error markup, for API context
            const historyText = isStructured ? JSON.stringify(content) : content; 
            conversationHistory.push({ role: role, parts: [{ text: historyText }] });
            displayMessage(content, role, isStructured);
            return Promise.resolve(); // Return a resolved promise to mimic async save
        }
        
        // Helper to remove thinking indicator
        function removeThinking() {
             document.getElementById('thinking-indicator')?.remove();
        }

        // Helper to show thinking indicator
        function showThinking(text = "AI is consulting its knowledge...") {
            const chatContainer = document.getElementById('chat-messages');
            const thinkingMessage = document.createElement('div');
            thinkingMessage.id = 'thinking-indicator';
            thinkingMessage.className = 'flex mb-4 justify-start';
            thinkingMessage.innerHTML = `
                <div class="bg-gray-200 text-gray-700 rounded-t-xl rounded-br-xl p-3 max-w-xs md:max-w-md shadow-lg italic">
                    ${text}
                </div>
            `;
            chatContainer.appendChild(thinkingMessage);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // --- LLM API Call for Regular Conversation ---

        async function generateMedicalResponse(prompt) {
            showThinking();
            
            // Add user message to history for API context
            const historyForApi = [...conversationHistory, { role: 'user', parts: [{ text: prompt }] }];

            // Simplified warning in the system prompt
            const systemPrompt = "You are a professional, empathetic medical information assistant named MediAI. Provide educational and preliminary, non-diagnostic information only. Remember the primary safety disclaimer is displayed constantly to the user. Keep responses clear and concise (under 200 words).";

            const payload = {
                contents: historyForApi,
                tools: [{ "google_search": {} }], // Google Search is ALLOWED for general chat
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
            };

            const responseText = await callGeminiApi(payload);

            removeThinking();
            
            if (responseText && !responseText.startsWith('**API Error:**')) {
                await saveMessage(responseText, 'model');
            } else {
                const errorMessage = responseText || "**API Error:** The response was empty.";
                await saveMessage(errorMessage, 'model');
            }
        }
        
        // --- LLM API Call for Structured Medicine Suggestion ---

        async function generateStructuredSuggestion(prompt) {
            showThinking("AI is generating a structured medicine suggestion...");

            // UPDATED INSTRUCTION: Keeps the necessary safety constraints but focuses on providing the drug info.
            const instruction = "Identify a medicine or a common drug class used to treat the user's symptom/condition and fill out the provided JSON schema. For common, mild issues (like headache, fever, mild allergy), suggest a specific Over-The-Counter (OTC) medicine and specific dosage. For chronic or serious conditions (like diabetes, hypertension), suggest the **primary drug class** used for treatment (e.g., 'ACE Inhibitor' for high blood pressure, 'Metformin' for Type 2 Diabetes) and **MANDATORILY** set the dosage field to 'PRESCRIPTION REQUIRED - Consult Physician for Dosage'. Ensure the 'warning' field is filled with a specific, concise safety note (e.g., 'Do not exceed daily limit').";
            
            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                // Google Search is NOT used here as it conflicts with JSON structured output
                systemInstruction: {
                    parts: [{ text: instruction }]
                },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: medicineSchema,
                }
            };

            const responseText = await callGeminiApi(payload, true); // true = expecting JSON

            removeThinking();
            
            if (responseText && !responseText.startsWith('**API Error:**')) {
                try {
                    const structuredData = JSON.parse(responseText);
                    await saveMessage(prompt, 'user'); // Save the user prompt first
                    await saveMessage(structuredData, 'model', true); // Save the structured object
                } catch (e) {
                    console.error("Failed to parse JSON response:", e, responseText);
                    const errorMessage = `**API Error:** Failed to parse structured JSON response: ${e.message}. Raw: ${responseText.substring(0, 50)}...`;
                    await saveMessage(errorMessage, 'model');
                }
            } else {
                await saveMessage(prompt, 'user'); // Save the user prompt first
                const errorMessage = responseText || "**API Error:** The response was empty.";
                await saveMessage(errorMessage, 'model');
            }
        }


        // --- LLM API Call Core Function ---

        async function callGeminiApi(payload, expectJson = false, maxRetries = 3) {
            let finalError = "Unknown API error (no connection).";
            
            // Get the manual key from the input field
            const manualKey = document.getElementById('manual-api-key')?.value.trim() || '';
            const currentApiUrl = getApiUrl(manualKey);
            
            for (let i = 0; i < maxRetries; i++) {
                try {
                    const response = await fetch(currentApiUrl, { // Use the dynamically determined URL
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorBody = await response.text();
                        
                        if (response.status === 403 && errorBody.includes("unregistered callers")) {
                            const authError = manualKey 
                                ? "Invalid API Key (403): The key provided is likely incorrect or expired."
                                : "Authentication Failure (403): The API key could not be provided by the execution environment. Please enter a key below to proceed.";
                            finalError = authError;
                        } else {
                            finalError = `HTTP Error ${response.status} (${response.statusText}). Details: ${errorBody.substring(0, 150)}...`;
                        }
                        
                        throw new Error(finalError);
                    }

                    const result = await response.json();
                    const candidate = result.candidates?.[0];

                    if (candidate && candidate.content?.parts?.[0]?.text) {
                        return candidate.content.parts[0].text; // Success
                    } else {
                        finalError = "API response structure unexpected or model returned no content.";
                        console.error(finalError, result);
                        throw new Error(finalError); // Treat structural failure as an error
                    }
                } catch (error) {
                    console.error(`Attempt ${i + 1} failed:`, error);
                    finalError = error.message; 
                    if (i < maxRetries - 1) {
                        const delay = Math.pow(2, i) * 1000; // Exponential backoff
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        // Return the detailed error on final attempt
                        return `**API Error:** ${finalError}`; 
                    }
                }
            }
            // Should be unreachable but included for safety
            return `**API Error:** Final attempt failed: ${finalError}`; 
        }

        // --- UI Interactions ---
        
        // This function handles the default (unstructured) chat
        window.sendMessage = function() {
            const input = document.getElementById('user-input');
            const prompt = input.value.trim();
            if (prompt === "") return;

            input.value = '';
            input.disabled = true;
            document.getElementById('send-btn').disabled = true;
            document.getElementById('structured-btn').disabled = true;


            saveMessage(prompt, 'user').then(() => {
                generateMedicalResponse(prompt).finally(() => {
                    input.disabled = false;
                    document.getElementById('send-btn').disabled = false;
                    document.getElementById('structured-btn').disabled = false;
                    input.focus();
                });
            });
        };
        
        // This function handles the new structured suggestion request
        window.sendStructuredMessage = function() {
            const input = document.getElementById('user-input');
            const prompt = input.value.trim();
            if (prompt === "") return;

            input.value = '';
            input.disabled = true;
            document.getElementById('send-btn').disabled = true;
            document.getElementById('structured-btn').disabled = true;
            
            // Note: generateStructuredSuggestion saves the user message itself inside the function
            generateStructuredSuggestion(prompt).finally(() => {
                input.disabled = false;
                document.getElementById('send-btn').disabled = false;
                document.getElementById('structured-btn').disabled = false;
                input.focus();
            });
        };

        

        // --- Initialization ---

        document.addEventListener('DOMContentLoaded', () => {
            // Hide the loading state and show the main app immediately
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');

            // // Set the guest ID
            // document.getElementById('user-id-display').textContent = userId;


            // Display the initial greeting message
            const initialGreeting = "Hello! I am MediAI, your non-diagnostic medical information assistant. I have two modes: CHATS (for general info) and SUGGEST MEDICINE (for specific medicine advice).";
            displayMessage(initialGreeting, 'model');

           

            // Set up input listeners for 'Enter' key
            document.getElementById('user-input')?.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Default to regular chat for the enter key
                    sendMessage(); 
                }
            });
        });