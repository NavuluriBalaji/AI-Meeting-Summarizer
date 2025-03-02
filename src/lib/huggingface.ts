import { HfInference } from '@huggingface/inference';

// Initialize the Hugging Face Inference client with proper error handling
const getHfClient = () => {
  const apiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('Hugging Face API key is not set. Please add your API key to the .env file.');
  }
  return new HfInference(apiKey);
};

// Function to transcribe audio using the Hugging Face model
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    // Validate audio blob
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('No audio data was recorded. Please try again.');
    }

    // Log information about the audio blob for debugging
    console.log('Audio blob type:', audioBlob.type);
    console.log('Audio blob size:', audioBlob.size);
    
    // Check if audio is too small (likely empty or too short)
    if (audioBlob.size < 1000) {
      throw new Error('Audio recording is too short. Please record for a longer duration.');
    }
    
    // Convert blob to base64 for API request
    const base64Audio = await blobToBase64(audioBlob);
    
    // Get Hugging Face client
    const hf = getHfClient();
    
    // Call the Hugging Face API for automatic speech recognition
    const response = await hf.automaticSpeechRecognition({
      model: 'smerchi/Arabic-Morocco-Speech_To_Text',
      data: base64Audio,
    });
    
    // Check if response is valid
    if (!response || typeof response.text !== 'string') {
      throw new Error('Invalid response from Hugging Face API');
    }
    
    // Check if transcription is empty
    if (response.text.trim() === '') {
      return "No speech detected in the recording. Please try again with clearer audio.";
    }
    
    return response.text;
  } catch (error) {
    // Log the full error for debugging
    console.error('Error transcribing audio with Hugging Face:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('api key') || errorMessage.includes('apikey')) {
        throw new Error('Missing or invalid Hugging Face API key. Please check your .env file.');
      } else if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
        throw new Error('Too many requests to Hugging Face API. Please try again later.');
      } else if (errorMessage.includes('413') || errorMessage.includes('too large')) {
        throw new Error('Audio file is too large. Please record a shorter audio clip (maximum 30 seconds recommended).');
      } else if (errorMessage.includes('400') || errorMessage.includes('invalid format')) {
        throw new Error('Invalid audio format. The model may not support this audio format.');
      } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        throw new Error('Model not found. The specified model may not be available.');
      } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        throw new Error('Unauthorized. Your Hugging Face API key may be invalid.');
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        throw new Error('Network error when connecting to Hugging Face API. Please check your internet connection.');
      } else if (errorMessage.includes('timeout')) {
        throw new Error('Request to Hugging Face API timed out. The audio might be too long or the service is busy.');
      }
      
      // Return the original error message if it's already user-friendly
      return `Transcription failed: ${error.message}`;
    }
    
    // Fallback error message
    return "Failed to transcribe audio. Please try again with a different recording.";
  }
}

// Helper function to convert Blob to base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onloadend = () => {
      try {
        if (!reader.result) {
          throw new Error('Failed to read audio file');
        }
        
        const base64String = reader.result as string;
        // Extract the base64 data part (remove the data URL prefix)
        const base64Data = base64String.split(',')[1];
        
        if (!base64Data) {
          throw new Error('Failed to extract base64 data from audio file');
        }
        
        resolve(base64Data);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to convert audio to base64 format'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading audio file'));
    };
    
    reader.readAsDataURL(blob);
  });
}