/// <reference types="vite/client" />

interface Window {
  webkitSpeechRecognition?: typeof SpeechRecognition;
  SpeechRecognition?: typeof SpeechRecognition;
}