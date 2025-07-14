import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI client with proper error handling
const getGenAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Google Gemini API key is not set. Please add your API key to the .env file.');
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function summarizeMeeting(transcript: string) {
  try {
    // Check if transcript is valid
    if (!transcript || transcript.trim() === '') {
      return "No transcript was provided to summarize. Please ensure audio is recorded properly.";
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = `
      Please analyze this meeting transcript and provide:
      1. A concise summary of key points discussed
      2. Action items and their owners (if mentioned)
      3. Important decisions made
      4. Follow-up tasks
      
      If the transcript is very short or unclear, please indicate that and provide whatever summary is possible.
      
      Transcript:
      ${transcript}
    `;

    const generationConfig = {
      temperature: 0.4,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 1024,
    };

    const safetySettings = [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ];

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings
      });

      const response = await result.response;
      const text = response.text();
      
      if (!text || text.trim() === '') {
        return "The AI model couldn't generate a summary. This might be due to content filtering or an issue with the transcript.";
      }
      
      return text;
    } catch (genError) {
      console.error('Specific error generating content with Google Gemini:', genError);
      
      // Handle specific error types from the Gemini API
      if (genError instanceof Error) {
        const errorMessage = genError.message.toLowerCase();
        
        if (errorMessage.includes('blocked') || errorMessage.includes('safety') || errorMessage.includes('harmful')) {
          return "The AI model couldn't generate a summary due to content filtering. Please try with different content.";
        } else if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
          throw new Error('Google Gemini API quota exceeded. Please try again later.');
        } else if (errorMessage.includes('invalid request')) {
          throw new Error('Invalid request to Google Gemini API. The transcript might be too long.');
        }
        
        throw genError; // Re-throw to be caught by the outer catch block
      }
      
      throw genError; // Re-throw unknown errors
    }
  } catch (error) {
    console.error('Error generating summary with Google Gemini:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('api key') || errorMessage.includes('apikey') || errorMessage.includes('key not valid')) {
        throw new Error('Missing or invalid Google Gemini API key. Please check your .env file.');
      } else if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
        throw new Error('Too many requests to Google Gemini API. Please try again later.');
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
        throw new Error('Google Gemini API quota exceeded. Please try again later.');
      } else if (errorMessage.includes('blocked') || errorMessage.includes('content filtered')) {
        return "The AI model couldn't generate a summary due to content filtering. Please try with different content.";
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        throw new Error('Network error when connecting to Google Gemini API. Please check your internet connection.');
      }
    }
    
    // Fallback error message
    return "Failed to generate summary. Please try again with a different recording.";
  }
}