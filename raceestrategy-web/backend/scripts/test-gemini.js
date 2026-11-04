import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function testConnection() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: No se encontró GEMINI_API_KEY en el archivo .env');
    process.exit(1);
  }

  console.log('🔄 Conectando con Gemini API...');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: 'Di brevemente: "¡Conexión exitosa con RaceEstrategy!"',
    });

    console.log('✅ Éxito! Respuesta de Gemini:');
    console.log(response.text);
  } catch (error) {
    console.error('❌ Error al conectar con la API de Gemini:', error.message);
  }
}

testConnection();