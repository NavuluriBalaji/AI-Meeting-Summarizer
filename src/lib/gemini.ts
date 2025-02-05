import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export async function summarizeMeeting(transcript: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  
  const prompt = `
    Please analyze this meeting transcript and provide:
    1. A concise summary of key points discussed
    2. Action items and their owners
    3. Important decisions made
    4. Follow-up tasks
    
    Transcript:
    ${transcript}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}