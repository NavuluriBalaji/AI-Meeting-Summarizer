// Google Cloud Speech-to-Text API integration
// This uses the REST API with API key authentication for browser compatibility

export async function transcribeWithGoogleSpeech(audioBlob: Blob): Promise<string> {
  try {
    // Validate audio blob
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('No audio data was recorded. Please try again.');
    }

    // Check if audio is too small (likely empty or too short)
    if (audioBlob.size < 1000) {
      throw new Error('Audio recording is too short. Please record for a longer duration.');
    }

    // Get API key
    const apiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error('Google Cloud API key is not set. Please add your API key to the .env file.');
    }

    // Convert blob to base64
    const base64Audio = await blobToBase64(audioBlob);

    // Prepare request to Google Cloud Speech-to-Text API
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
            model: 'default',
            enableAutomaticPunctuation: true,
            useEnhanced: true,
          },
          audio: {
            content: base64Audio,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(
        `Google Cloud Speech API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    
    // Extract transcript from response
    if (!data.results || data.results.length === 0) {
      return "No speech detected in the recording. Please try again with clearer audio.";
    }

    // Combine all transcription results
    const transcript = data.results
      .map((result: any) => result.alternatives[0]?.transcript || '')
      .join(' ');

    if (transcript.trim() === '') {
      return "No speech detected in the recording. Please try again with clearer audio.";
    }

    return transcript;
  } catch (error) {
    console.error('Error transcribing with Google Cloud Speech:', error);

    // Provide more specific error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('api key') || errorMessage.includes('apikey')) {
        throw new Error('Missing or invalid Google Cloud API key. Please check your .env file.');
      } else if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
        throw new Error('Too many requests to Google Cloud API. Please try again later.');
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
        throw new Error('Google Cloud API quota exceeded. Please try again later.');
      } else if (errorMessage.includes('permission') || errorMessage.includes('not authorized')) {
        throw new Error('Not authorized to use Google Cloud Speech API. Please check your API key permissions.');
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        throw new Error('Network error when connecting to Google Cloud API. Please check your internet connection.');
      } else if (errorMessage.includes('timeout')) {
        throw new Error('Request to Google Cloud API timed out. The audio might be too long or the service is busy.');
      }

      // Return the original error message if it's already user-friendly
      return `Transcription failed: ${error.message}`;
    }

    // Fallback error message
    return "Failed to transcribe audio with Google Cloud Speech. Please try again with a different recording.";
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