import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function testAll() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const candidates = [
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ];

  for (const m of candidates) {
    try {
      console.log('Testing', m, '...');
      const r = await ai.models.generateContent({ model: m, contents: 'Di OK' });
      console.log('✅ EXITO CON:', m, 'Respuesta:', r.text?.trim());
      return m;
    } catch (e) {
      console.log('❌ Falló', m, ':', e.message?.slice(0, 100));
    }
  }
}

testAll();
