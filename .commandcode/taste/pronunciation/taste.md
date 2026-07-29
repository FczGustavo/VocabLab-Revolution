# pronunciation
- Remove all speechSynthesis/Web Speech API fallback — only use OpenAI GPT-audio-mini for pronunciation audio. Confidence: 0.85
- The audio button must show loading spinner while AI audio is being generated and stop spinning when ready/played. Confidence: 0.75
- For openai/gpt-audio-mini on OpenRouter: use the POST /api/v1/chat/completions endpoint with `modalities: ["audio", "text"]` and `audio: { voice, format }` in the request body, NOT the /audio/speech TTS endpoint. Confidence: 0.65
- When using gpt-audio-mini with streaming (stream:true), audio.format must be 'pcm16' — mp3, wav, flac, and opus are not supported. Non-streaming (stream:false) is not accepted for audio output. Confidence: 0.80
- Pronunciation prompt must instruct the model to output audio of ONLY the provided word — no conversational text, no explanations, no extra speech beyond the single word. Confidence: 0.75
- When pronunciation audio is ready/completed, show a volume/sound icon (like Volume2), not a checkmark icon. Confidence: 0.70
- Pronunciation audio must be persisted/cached permanently — never regenerate audio on server start or page refresh. Confidence: 0.85
- When pronunciation audio fails/gives an error, show a red-colored icon on the audio button. Clicking the red icon should regenerate the audio. Confidence: 0.85
