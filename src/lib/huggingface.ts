import { HfInference } from '@huggingface/inference';

const getHfClient = () => {
  const apiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('Hugging Face API key is not set. Please add your API key to the .env file.');
  }
  return new HfInference(apiKey);
};

// Function to transcribe audio using the Hugging Face model
/**
 * Transcribe audio using a backend endpoint that runs facebook/s2t-small-librispeech-asr.
 * @param audioBlob
 * @returns
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');

  const response = await fetch('https://speech2text-6n0t.onrender.com/api/speech2text', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to transcribe audio');
  }

  const data = await response.json();
  return data.transcription;
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