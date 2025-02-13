import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Pause, Play, Loader2, LogOut, Clock, History, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { summarizeMeeting } from '../lib/gemini';
import { EmailDialog } from './EmailDialog';

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
}

export function MeetingSummarizer() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [duration, setDuration] = useState(0);
  const [summaryHistory, setSummaryHistory] = useState<MeetingSummary[]>([]);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);

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

  const setupRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      throw new Error('Speech recognition is not supported in this browser');
    }

    const recognition = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsRecording(true);
      setError(null);
      if (!startTime) {
        setStartTime(new Date());
      }
    };

    recognition.onresult = (event) => {
      let interimTranscriptText = '';
      let finalTranscriptText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptText += transcript + ' ';
        } else {
          interimTranscriptText += transcript;
        }
      }

      if (finalTranscriptText) {
        setTranscript(prev => prev + finalTranscriptText);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interimTranscriptText);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        console.log('No speech detected');
      } else if (event.error === 'audio-capture') {
        setError('No microphone detected. Please ensure a microphone is connected and try again.');
      } else if (event.error === 'not-allowed') {
        setError('Microphone access was denied. Please allow microphone access and try again.');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      if (isRecording && !isPaused) {
        recognition.start();
      }
    };

    return recognition;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up media recorder for audio preview
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      // Set up speech recognition
      const recognition = setupRecognition();
      recognitionRef.current = recognition;
      recognition.start();

      setError(null);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const pauseRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
    setIsPaused(true);
  };

  const resumeRecording = () => {
    if (recognitionRef.current && isPaused) {
      recognitionRef.current.start();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
    setIsPaused(false);
  };

  const stopRecording = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    setIsRecording(false);
    setIsPaused(false);
    setStartTime(null);

    if (transcript.trim()) {
      setLoading(true);
      try {
        const meetingSummary = await summarizeMeeting(transcript);
        setSummary(meetingSummary);

        const newSummary: MeetingSummary = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration,
          summary: meetingSummary,
          transcript: transcript
        };

        const updatedHistory = [newSummary, ...summaryHistory];
        setSummaryHistory(updatedHistory);
        localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate summary');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSignOut = async () => {
    if (isRecording) {
      stopRecording();
    }
    await supabase.auth.signOut();
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
              </div>
            )}
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

        <div className="mb-8">
          <div className="flex justify-center space-x-4 mb-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <Mic className="w-5 h-5 mr-2" />
                Start Recording
              </button>
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

          {audioURL && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Audio Preview</h3>
              <audio controls src={audioURL} className="w-full" />
            </div>
          )}

          {(transcript || interimTranscript) && (
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
              Generating summary...
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