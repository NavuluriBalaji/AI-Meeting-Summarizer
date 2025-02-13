import { Model, KaldiRecognizer } from 'vosk-browser';

let model: Model | null = null;
let recognizer: KaldiRecognizer | null = null;

export async function initializeVosk() {
  if (!model) {
    try {
      // Use a CDN-hosted model file instead of ZIP
      const response = await fetch('https://cdn.jsdelivr.net/npm/@alphacep/model-en-us@1.0.0/model.json');
      const modelData = await response.json();
      model = new Model(modelData);
    } catch (error) {
      console.error('Failed to load Vosk model:', error);
      throw new Error('Failed to load speech recognition model. Please try again.');
    }
  }
  return model;
}

export function createRecognizer(model: Model, sampleRate: number = 48000) {
  try {
    recognizer = new KaldiRecognizer(model, sampleRate);
    recognizer.setWords(true);
    return recognizer;
  } catch (error) {
    console.error('Failed to create recognizer:', error);
    throw new Error('Failed to initialize speech recognition. Please try again.');
  }
}

export function processAudioData(recognizer: KaldiRecognizer, audioData: Float32Array): string {
  try {
    const result = recognizer.acceptWaveform(audioData);
    if (result) {
      const recognition = JSON.parse(recognizer.result());
      return recognition.text;
    }
    return '';
  } catch (error) {
    console.error('Error processing audio data:', error);
    return '';
  }
}

export function finalizeRecognition(recognizer: KaldiRecognizer): string {
  try {
    const final = JSON.parse(recognizer.finalResult());
    return final.text;
  } catch (error) {
    console.error('Error finalizing recognition:', error);
    return '';
  }
}