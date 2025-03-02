import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Pause, Play, Loader2, LogOut, Clock, History, Mail, AlertTriangle, Info, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { summarizeMeeting } from '../lib/gemini';
import { transcribeAudio } from '../lib/huggingface';
import { transcribeWithGoogleSpeech } from '../lib/googleSpeech';
import { EmailDialog } from './EmailDialog';

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
}

type SpeechService = 'huggingface' | 'google';

export function MeetingSummarizer() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [duration, setDuration] = useState(0);
  const [summaryHistory, setSummaryHistory] = useState<MeetingSummary[]>([]);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioSupported, setAudioSupported] = useState(true);
  const [apiStatus, setApiStatus] = useState<{gemini: boolean, huggingface: boolean, googleSpeech: boolean}>({
    gemini: true,
    huggingface: true,
    googleSpeech: false
  });
  const [speechService, setSpeechService] = useState<SpeechService>('huggingface');
  const [showSettings, setShowSettings] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const maxRecordingDuration = 1000; // Maximum recording duration in seconds

  // Check if audio recording is supported
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioSupported(false);
      setError('Audio recording is not supported in this browser. Try using Chrome or Firefox.');
    }
    
    // Check API keys
    const checkApiKeys = async () => {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const huggingfaceKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
      const googleCloudKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;
      
      setApiStatus({
        gemini: !!geminiKey,
        huggingface: !!huggingfaceKey,
        googleSpeech: !!googleCloudKey
      });
      
      // Set default speech service based on available API keys
      if (googleCloudKey) {
        setSpeechService('google');
      } else if (huggingfaceKey) {
        setSpeechService('huggingface');
      }
      
      if (!geminiKey) {
        setError('Google Gemini API key is missing. Please check your .env file.');
      } else if (!huggingfaceKey && !googleCloudKey) {
        setError('No speech-to-text API keys are available. Please add either Hugging Face or Google Cloud API key to the .env file.');
      }
    };
    
    checkApiKeys();
  }, []);

  useEffect(() => {
    const history = localStorage.getItem('meetingSummaryHistory');
    if (history) {
      setSummaryHistory(JSON.parse(history));
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      stopRecording();
    };
  }, []);

  useEffect(() => {
    if (startTime && !isPaused) {
      durationIntervalRef.current = window.setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setDuration(diff);
        
        // Auto-stop recording if it exceeds the maximum duration
        if (diff >= maxRecordingDuration) {
          stopRecording();
        }
      }, 1000);
    } else if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [startTime, isPaused]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      // Check API keys based on selected service
      if (speechService === 'huggingface' && !apiStatus.huggingface) {
        throw new Error('Hugging Face API key is missing. Please check your .env file or switch to Google Cloud Speech.');
      } else if (speechService === 'google' && !apiStatus.googleSpeech) {
        throw new Error('Google Cloud API key is missing. Please check your .env file or switch to Hugging Face.');
      }
      
      if (!apiStatus.gemini) {
        throw new Error('Google Gemini API key is missing. Please check your .env file.');
      }
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording is not supported in this browser. Try using Chrome or Firefox.');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Set up media recorder for audio - use audio/webm format for better compatibility
      let options = {};
      
      // Check if the browser supports audio/webm
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        options = { mimeType: 'audio/ogg' };
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        try {
          if (audioChunksRef.current.length === 0) {
            throw new Error('No audio data was recorded. Please try again.');
          }
          
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          
          if (audioBlob.size < 1000) {
            throw new Error('Audio recording is too short or empty. Please try again.');
          }
          
          const url = URL.createObjectURL(audioBlob);
          setAudioURL(url);
        } catch (err) {
          console.error('Error processing recorded audio:', err);
          setError(err instanceof Error ? err.message : 'Failed to process recorded audio');
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      setIsRecording(true);
      setStartTime(new Date());
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setAudioSupported(false);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      } catch (err) {
        console.error('Error pausing recording:', err);
        setError(err instanceof Error ? err.message : 'Failed to pause recording');
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } catch (err) {
        console.error('Error resuming recording:', err);
        setError(err instanceof Error ? err.message : 'Failed to resume recording');
      }
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    try {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      setIsRecording(false);
      setIsPaused(false);
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setIsRecording(false);
      setIsPaused(false);
      return;
    }
    
    if (audioChunksRef.current.length > 0) {
      setTranscribing(true);
      setError(null);
      try {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
        });
        
        if (audioBlob.size < 1000) {
          throw new Error('Audio recording is too short or empty. Please try again or use the "Test with Sample Text" option.');
        }
        
        // Transcribe the audio using the selected service
        let transcribedText = '';
        
        if (speechService === 'huggingface') {
          // Check if the Hugging Face API key is set
          if (!import.meta.env.VITE_HUGGINGFACE_API_KEY) {
            throw new Error('Hugging Face API key is not set. Please add your API key to the .env file or switch to Google Cloud Speech.');
          }
          
          transcribedText = await transcribeAudio(audioBlob);
        } else if (speechService === 'google') {
          // Check if the Google Cloud API key is set
          if (!import.meta.env.VITE_GOOGLE_CLOUD_API_KEY) {
            throw new Error('Google Cloud API key is not set. Please add your API key to the .env file or switch to Hugging Face.');
          }
          
          transcribedText = await transcribeWithGoogleSpeech(audioBlob);
        }
        
        if (!transcribedText || transcribedText.trim() === '') {
          throw new Error('No transcription was returned. The audio might be too quiet or in an unsupported language.');
        }
        
        setTranscript(transcribedText);
        
        // Check if the Google Gemini API key is set
        if (!import.meta.env.VITE_GEMINI_API_KEY) {
          throw new Error('Google Gemini API key is not set. Please add your API key to the .env file.');
        }
        
        // Generate summary
        setLoading(true);
        try {
          const meetingSummary = await summarizeMeeting(transcribedText);
          setSummary(meetingSummary);

          const newSummary: MeetingSummary = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            duration,
            summary: meetingSummary,
            transcript: transcribedText
          };

          const updatedHistory = [newSummary, ...summaryHistory];
          setSummaryHistory(updatedHistory);
          localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
        } catch (summaryError) {
          console.error('Error generating summary:', summaryError);
          setError(summaryError instanceof Error ? summaryError.message : 'Failed to generate summary');
        }
      } catch (err) {
        console.error('Processing error:', err);
        setError(err instanceof Error ? err.message : 'Failed to process audio');
      } finally {
        setTranscribing(false);
        setLoading(false);
      }
    } else {
      setError('No audio data was recorded. Please try again or use the "Test with Sample Text" option.');
    }
  };

  const handleSignOut = async () => {
    if (isRecording) {
      stopRecording();
    }
    await supabase.auth.signOut();
  };

  // For testing purposes - use this function to bypass audio recording
  const testWithSampleText = async () => {
    setTranscribing(true);
    setError(null);
    
    try {
      // Check API keys
      if (!apiStatus.gemini) {
        throw new Error('Google Gemini API key is missing. Please check your .env file.');
      }
      
      // Sample text for testing when audio recording fails
      const sampleText = "This is a test meeting transcript. We discussed the project timeline and agreed to complete the first phase by next Friday. John will handle the design work, and Sarah will take care of the backend implementation. We also decided to use React for the frontend and Node.js for the backend. The team will meet again next Monday to review progress.";
      
      setTranscript(sampleText);
      
      // Generate summary
      setLoading(true);
      try {
        const meetingSummary = await summarizeMeeting(sampleText);
        setSummary(meetingSummary);

        const newSummary: MeetingSummary = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration: 300, // 5 minutes sample duration
          summary: meetingSummary,
          transcript: sampleText
        };

        const updatedHistory = [newSummary, ...summaryHistory];
        setSummaryHistory(updatedHistory);
        localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
      } catch (summaryError) {
        console.error('Error generating summary:', summaryError);
        setError(summaryError instanceof Error ? summaryError.message : 'Failed to generate summary');
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process sample text');
    } finally {
      setTranscribing(false);
      setLoading(false);
    }
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  const handleSpeechServiceChange = (service: SpeechService) => {
    setSpeechService(service);
    setShowSettings(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Meeting Summarizer</h1>
          <div className="flex items-center space-x-4">
            {isRecording && (
              <div className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2" />
                {formatDuration(duration)}
                {duration >= maxRecordingDuration - 5 && duration < maxRecordingDuration && (
                  <span className="ml-2 text-red-500 text-xs animate-pulse">
                    Recording will stop in {maxRecordingDuration - duration}s
                  </span>
                )}
              </div>
            )}
            <button
              onClick={toggleSettings}
              className="flex items-center text-gray-600 hover:text-gray-900 relative"
            >
              <Settings className="w-5 h-5 mr-2" />
              Settings
              
              {showSettings && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-md shadow-lg z-10 p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Speech-to-Text Service</h3>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="speechService"
                        value="huggingface"
                        checked={speechService === 'huggingface'}
                        onChange={() => handleSpeechServiceChange('huggingface')}
                        disabled={!apiStatus.huggingface}
                        className="text-blue-600"
                      />
                      <span className={!apiStatus.huggingface ? "text-gray-400" : "text-gray-700"}>
                        Hugging Face (Arabic-Morocco model)
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="speechService"
                        value="google"
                        checked={speechService === 'google'}
                        onChange={() => handleSpeechServiceChange('google')}
                        disabled={!apiStatus.googleSpeech}
                        className="text-blue-600"
                      />
                      <span className={!apiStatus.googleSpeech ? "text-gray-400" : "text-gray-700"}>
                        Google Cloud Speech-to-Text
                      </span>
                    </label>
                  </div>
                  {!apiStatus.googleSpeech && (
                    <p className="text-xs text-yellow-600 mt-2">
                      Google Cloud API key is not set. Add it to your .env file to enable this option.
                    </p>
                  )}
                </div>
              )}
            </button>
            <Link
              to="/history"
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <History className="w-5 h-5 mr-2" />
              View History
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Sign Out
            </button>
          </div>
        </div>

        {(!apiStatus.gemini || (!apiStatus.huggingface && !apiStatus.googleSpeech)) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-500 mr-3 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">API Keys Missing</h3>
              <p className="text-red-700 mt-1">
                {!apiStatus.gemini && "Google Gemini API key is missing. "}
                {!apiStatus.huggingface && !apiStatus.googleSpeech && "No speech-to-text API keys are available. "}
                Please check your .env file.
              </p>
            </div>
          </div>
        )}

        {!audioSupported && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mr-3 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">Audio Recording Not Supported</h3>
              <p className="text-yellow-700 mt-1">
                Your browser doesn't support audio recording. Please use Chrome or Firefox, 
                or use the "Test with Sample Text" option below.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md flex items-start">
          <Info className="w-5 h-5 text-blue-500 mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-800">Recording Tips</h3>
            <ul className="text-blue-700 mt-1 list-disc list-inside">
              <li>Speak clearly and at a normal pace</li>
              <li>Keep recordings under {maxRecordingDuration} seconds for best results</li>
              <li>Reduce background noise when possible</li>
              <li>If transcription fails, try the "Test with Sample Text" option</li>
              <li>Try switching between speech-to-text services in Settings if one doesn't work well</li>
            </ul>
          </div>
        </div>

        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-700 mr-2">Current Speech-to-Text Service:</span>
            <span className="text-sm font-semibold text-blue-600">
              {speechService === 'huggingface' ? 'Hugging Face (Arabic-Morocco model)' : 'Google Cloud Speech-to-Text'}
            </span>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-center space-x-4 mb-6">
            {!isRecording ? (
              <>
                <button
                  onClick={startRecording}
                  disabled={!audioSupported || !apiStatus.gemini || 
                    (speechService === 'huggingface' && !apiStatus.huggingface) || 
                    (speechService === 'google' && !apiStatus.googleSpeech)}
                  className={`flex items-center px-6 py-3 rounded-full ${
                    audioSupported && apiStatus.gemini && 
                    ((speechService === 'huggingface' && apiStatus.huggingface) || 
                     (speechService === 'google' && apiStatus.googleSpeech))
                      ? "bg-blue-600 hover:bg-blue-700 text-white" 
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  } transition-colors`}
                >
                  <Mic className="w-5 h-5 mr-2" />
                  Start Recording
                </button>
                <button
                  onClick={testWithSampleText}
                  disabled={!apiStatus.gemini}
                  className={`flex items-center px-6 py-3 rounded-full ${
                    apiStatus.gemini
                      ? "bg-gray-600 hover:bg-gray-700 text-white" 
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  } transition-colors`}
                >
                  Test with Sample Text
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="flex items-center px-6 py-3 rounded-full bg-yellow-600 hover:bg-yellow-700 text-white transition-colors"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-5 h-5 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-5 h-5 mr-2" />
                      Pause
                    </>
                  )}
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center px-6 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  <MicOff className="w-5 h-5 mr-2" />
                  Stop Recording
                </button>
              </>
            )}
          </div>

          {isRecording && (
            <div className="text-center text-sm text-gray-500 mb-4">
              {isPaused ? "Recording paused" : "Recording in progress..."}
              {!isPaused && (
                <span className="inline-block ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </div>
          )}

          {audioURL && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Audio Preview</h3>
              <audio controls src={audioURL} className="w-full" />
            </div>
          )}

          {transcribing && (
            <div className="flex items-center justify-center text-gray-600 p-4">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Transcribing audio using {speechService === 'huggingface' ? 'Hugging Face model (smerchi/Arabic-Morocco-Speech_To_Text)' : 'Google Cloud Speech-to-Text'}...
            </div>
          )}

          {transcript && (
            <div className="border rounded-lg p-4 bg-gray-50 mb-4">
              <h2 className="text-lg font-semibold mb-2">Transcript</h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {transcript}
                <span className="text-gray-500">{interimTranscript}</span>
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center text-gray-600 p-4">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Generating summary with Google Gemini...
            </div>
          )}

          {error && (
            <div className="mt-4 text-red-600 text-sm bg-red-50 p-4 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {summary && (
            <div className="border rounded-lg p-6 bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Current Meeting Summary</h2>
                <button
                  onClick={() => setIsEmailDialogOpen(true)}
                  className="flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-md"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  Send via Email
                </button>
              </div>
              <div className="text-sm text-gray-500 mb-4">
                Duration: {formatDuration(duration)}
              </div>
              <div className="prose max-w-none">
                {summary.split('\n').map((line, i) => (
                  <p key={i} className="mb-2">{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {summary && (
        <EmailDialog
          isOpen={isEmailDialogOpen}
          onClose={() => setIsEmailDialogOpen(false)}
          summary={summary}
          date={new Date().toISOString()}
          duration={duration}
        />
      )}
    </div>
  );
}