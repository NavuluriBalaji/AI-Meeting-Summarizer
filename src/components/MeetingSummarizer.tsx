import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Clock, History, LogOut, Settings, Menu } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { summarizeMeeting } from '../lib/gemini';
import { transcribeAudio } from '../lib/huggingface';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

declare global {
  interface Window { gapi: any }
}

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
}

type SpeechService = 'gemini';

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
  const [audioSupported, setAudioSupported] = useState(true);
  const [apiStatus, setApiStatus] = useState<{gemini: boolean; huggingface: boolean}>({
    gemini: true,
    huggingface: true
  });
  const [speechService] = useState<SpeechService>('gemini');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingDetails, setMeetingDetails] = useState<{
    platform?: string;
    date?: string;
    time?: string;
    duration?: string;
    error?: string;
    link?: string;
    timezone?: string;
  }>({});

  useEffect(() => {
    const fetchUserDetails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || '');
      }
    };
    fetchUserDetails();
  }, []);

  const [calendarMeetings, setCalendarMeetings] = useState<MeetingSummary[]>([]);
  const [showCalendarMeetings, setShowCalendarMeetings] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const maxRecordingDuration = 1200;

  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioSupported(false);
      setError('Audio recording is not supported in this browser. Try using Chrome or Firefox.');
    }
    const checkApiKeys = async () => {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const huggingfaceKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
      setApiStatus({
        gemini: !!geminiKey,
        huggingface: !!huggingfaceKey
      });
      if (!geminiKey) {
        setError('Google Gemini API key is missing. Please check your .env file.');
      } else if (!huggingfaceKey) {
        setError('Hugging Face API key is missing. Please add it to the .env file.');
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        stopRecording();
      }
    };
  }, []);

  useEffect(() => {
    if (startTime && !isPaused) {
      durationIntervalRef.current = window.setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setDuration(diff);
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
      if (!apiStatus.huggingface) {
        throw new Error('Hugging Face API key is missing. Please check your .env file.');
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
      let options = {};
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
        const formData = new FormData();
        formData.append('audio', audioBlob, 'meeting.webm');
        const response = await fetch('https://speech2text-6n0t.onrender.com/api/speech2text', {
          method: 'POST',
          body: formData
        });
        if (!response.ok) {
          throw new Error('Failed to get transcription and summary from the server.');
        }
        const result = await response.json();
        if (!result.transcription) {
          throw new Error('Invalid response from server.');
        }
        setTranscript(result.transcription);
        setSummary(result.summary || '');

        const newSummary: MeetingSummary = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration,
          summary: result.summary || '',
          transcript: result.transcription
        };
        const updatedHistory = [newSummary, ...summaryHistory];
        setSummaryHistory(updatedHistory);
        localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
      } catch (err) {
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

  const testWithSampleText = async () => {
    setTranscribing(true);
    setError(null);
    try {
      if (!apiStatus.gemini) {
        throw new Error('Google Gemini API key is missing. Please check your .env file.');
      }
      const sampleText = "This is a test meeting transcript. We discussed the project timeline and agreed to complete the first phase by next Friday. John will handle the design work, and Sarah will take care of the backend implementation. We also decided to use React for the frontend and Node.js for the backend. The team will meet again next Monday to review progress.";
      setTranscript(sampleText);
      setLoading(true);
      try {
        const meetingSummary = await summarizeMeeting(sampleText);
        setSummary(meetingSummary);
        const newSummary: MeetingSummary = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration: 300,
          summary: meetingSummary,
          transcript: sampleText
        };
        const updatedHistory = [newSummary, ...summaryHistory];
        setSummaryHistory(updatedHistory);
        localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
      } catch (summaryError) {
        setError(summaryError instanceof Error ? summaryError.message : 'Failed to generate summary');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process sample text');
    } finally {
      setTranscribing(false);
      setLoading(false);
    }
  };

  const toggleSettings = () => setShowSettings(!showSettings);

  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
  const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      window.gapi.load('client:auth2', () => {
        window.gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: GOOGLE_DISCOVERY_DOCS,
          scope: GOOGLE_SCOPES,
        });
      });
    };
    document.body.appendChild(script);
  }, []);

  const fetchCalendarMeetings = async (email: string) => {
    if (!window.gapi?.client?.calendar) {
      await new Promise((resolve, reject) => {
        const checkGapi = () => {
          if (window.gapi?.client?.calendar) {
            resolve(true);
          } else if (window.gapi) {
            window.gapi.load('client:auth2', async () => {
              try {
                await window.gapi.client.init({
                  apiKey: GOOGLE_API_KEY,
                  clientId: GOOGLE_CLIENT_ID,
                  scope: GOOGLE_SCOPES,
                });
                await window.gapi.client.load('calendar', 'v3');
                resolve(true);
              } catch (error) {
                reject(error);
              }
            });
          } else {
            setTimeout(checkGapi, 100);
          }
        };
        checkGapi();
      });
    }
    const authInstance = window.gapi.auth2.getAuthInstance();
    if (!authInstance) {
      throw new Error('Google Auth not initialized');
    }
    if (!authInstance.isSignedIn.get()) {
      try {
        await authInstance.signIn({
          scope: GOOGLE_SCOPES
        });
      } catch (authError) {
        console.error('Authentication error:', authError);
        throw new Error('Failed to authenticate with Google Calendar');
      }
    }
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
    let response;
    try {
      response = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        showDeleted: false,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50
      });
    } catch (err: any) {
      console.error('Google Calendar API error:', err);
      throw new Error(
        err?.result?.error?.message ||
        'Failed to fetch events from Google Calendar. Please check your API credentials and permissions.'
      );
    }
    console.log('Google Calendar API response:', response.result.items);
    const events = response.result.items || [];
    return events.map((event: any) => ({
      id: event.id,
      date: event.start.dateTime || event.start.date,
      duration: event.end.dateTime && event.start.dateTime
        ? (new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 1000
        : 0,
      summary: event.summary || 'No Title',
      transcript: event.description || ''
    }));
  };

  const handleImportCalendar = async () => {
    setError(null);
    setShowCalendarMeetings(false);
    setLoading(true);
    try {
      const meetings = await fetchCalendarMeetings(userEmail);
      setCalendarMeetings(meetings);
      setShowCalendarMeetings(true);
    } catch (err) {
      console.error('Import calendar error:', err);
      setError('Failed to import meetings from calendar. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const extractMeetingDetails = (input: string) => {
    let details: typeof meetingDetails = {};
    try {
      // Extract meeting link
      const meetRegex = /(https:\/\/meet\.google\.com\/[a-zA-Z0-9\-]+)/;
      const zoomRegex = /(https:\/\/zoom\.us\/j\/[^\s]+)/;
      const teamsRegex = /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+)/;
      let link = '';
      if (meetRegex.test(input)) {
        link = input.match(meetRegex)?.[1] || '';
        details.platform = 'Google Meet';
      } else if (zoomRegex.test(input)) {
        link = input.match(zoomRegex)?.[1] || '';
        details.platform = 'Zoom';
      } else if (teamsRegex.test(input)) {
        link = input.match(teamsRegex)?.[1] || '';
        details.platform = 'Microsoft Teams';
      }
      if (link) {
        details.link = link;
      }

      // Extract date and time from a line like "Tuesday, July 15 · 6:00 – 7:00pm"
      const dateTimeLine = input.split('\n').find(line =>
        /[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2}\s*·\s*[0-9]{1,2}:[0-9]{2}\s*[–-]\s*[0-9]{1,2}:[0-9]{2}(am|pm)?/i.test(line)
      );
      if (dateTimeLine) {
        const dateRegex = /([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2})/;
        const timeRegex = /([0-9]{1,2}:[0-9]{2})\s*[–-]\s*([0-9]{1,2}:[0-9]{2})(am|pm)?/i;
        const dateMatch = dateTimeLine.match(dateRegex);
        const timeMatch = dateTimeLine.match(timeRegex);
        if (dateMatch) {
          details.date = dateMatch[1];
        }
        if (timeMatch) {
          // Parse start and end time with am/pm
          let start = timeMatch[1];
          let end = timeMatch[2];
          let endPeriod = timeMatch[3] || '';
          // If end time has am/pm, use it; otherwise, try to infer from context (not robust)
          details.time = `${start} - ${end}${endPeriod}`;
          // Duration calculation (handle am/pm correctly)
          const parseTime = (t: string, period: string) => {
            let [h, m] = t.split(':').map(Number);
            if (period.toLowerCase() === 'pm' && h < 12) h += 12;
            if (period.toLowerCase() === 'am' && h === 12) h = 0;
            return h * 60 + m;
          };
          // Try to get am/pm for start time from context (not always possible)
          let startPeriod = '';
          // If endPeriod exists, and start < end, assume same period
          if (endPeriod) {
            startPeriod = endPeriod;
          }
          const startMinutes = parseTime(start, startPeriod);
          const endMinutes = parseTime(end, endPeriod);
          let durationMin = endMinutes - startMinutes;
          if (durationMin <= 0) durationMin += 12 * 60; // handle overnight or missing am/pm
          details.duration = `${durationMin} min`;
        }
      }

      // Extract time zone
      const tzLine = input.split('\n').find(line => /Time zone:/i.test(line));
      if (tzLine) {
        const tzMatch = tzLine.match(/Time zone:\s*([^\n]+)/i);
        if (tzMatch) {
          details.timezone = tzMatch[1].trim();
        }
      }

      if (!details.platform) {
        details.error = 'No supported meeting link found.';
      }
    } catch (e) {
      details.error = 'Failed to parse meeting details.';
    }
    return details;
  };

  // Add this function to save meeting to Supabase for the logged-in user
  const saveMeetingToDatabase = async (meeting: MeetingSummary) => {
    if (!userEmail) return;
    try {
      await supabase.from('meetings').insert([
        {
          id: meeting.id,
          user_email: userEmail,
          date: meeting.date,
          duration: meeting.duration,
          transcript: meeting.transcript
        }
      ]);
    } catch (err) {
      // error logging only
    }
  };

  // When adding a meeting, also save to database
  const handleExtractDetails = () => {
    const details = extractMeetingDetails(meetingLink);
    setMeetingDetails(details);

    if (details.platform && details.date && details.time && details.link) {
      let meetingDate = new Date();
      try {
        const dateParts = details.date.split(',');
        if (dateParts.length === 2) {
          const [weekday, rest] = dateParts;
          const [month, day] = rest.trim().split(' ');
          const year = new Date().getFullYear();
          meetingDate = new Date(`${month} ${day}, ${year}`);
        }
      } catch {}
      const newMeeting: MeetingSummary = {
        id: Date.now().toString(),
        date: meetingDate.toISOString(),
        duration: details.duration ? parseInt(details.duration) : 0,
        summary: `${details.platform} Meeting`,
        transcript: `Link: ${details.link}\nDate: ${details.date}\nTime: ${details.time}\nDuration: ${details.duration || ''}\nTimeZone: ${details.timezone || ''}`
      };
      setCalendarMeetings(prev => [newMeeting, ...prev]);
      saveMeetingToDatabase(newMeeting); // <-- Save to Supabase
    }
  };

  const filteredCalendarMeetings = selectedDate
    ? calendarMeetings.filter(m =>
      new Date(m.date).toDateString() === selectedDate.toDateString()
    )
    : calendarMeetings;

  const groupedMeetings = filteredCalendarMeetings.reduce((acc: Record<string, MeetingSummary[]>, meeting) => {
    const dateStr = new Date(meeting.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(meeting);
    return acc;
  }, {});

  // Add this function to remove a meeting by id
  const removeMeeting = (id: string) => {
    setCalendarMeetings(prev => prev.filter(m => m.id !== id));
  };

  // Remove past meetings automatically
  useEffect(() => {
    setCalendarMeetings(prev =>
      prev.filter(m => {
        const meetingDate = new Date(m.date);
        return meetingDate >= new Date();
      })
    );
  }, [calendarMeetings.length]);

  // Persist calendarMeetings to localStorage
  useEffect(() => {
    localStorage.setItem('calendarMeetings', JSON.stringify(calendarMeetings));
  }, [calendarMeetings]);

  // Load calendarMeetings from localStorage on mount
  useEffect(() => {
    const storedMeetings = localStorage.getItem('calendarMeetings');
    if (storedMeetings) {
      setCalendarMeetings(JSON.parse(storedMeetings));
    }
  }, []);

  // Fetch meetings from Supabase for the logged-in user
  const fetchUserMeetingsFromDatabase = async (email: string) => {
    if (!email) return [];
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_email', email);
      if (error) {
        console.error('Failed to fetch meetings from database:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Failed to fetch meetings from database:', err);
      return [];
    }
  };

  // Load meetings from Supabase when userEmail changes (login)
  useEffect(() => {
    if (userEmail) {
      (async () => {
        const dbMeetings = await fetchUserMeetingsFromDatabase(userEmail);
        if (dbMeetings.length > 0) {
          setCalendarMeetings(dbMeetings);
        }
      })();
    }
  }, [userEmail]);

  return (
    <div className="flex min-h-screen bg-gray-50 font-inter">
      <aside className={`w-72 bg-white border-r flex flex-col py-6 px-5 fixed top-0 left-0 h-100 z-40 
      transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:static md:translate-x-0 md:flex`}>
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
            {userName ? userName[0].toUpperCase() : "U"}
          </div>
          <div>
            <div className="font-semibold text-gray-900">{userName || "Your Name"}</div>
            <div className="text-xs text-gray-500">{userEmail || "your@email.com"}</div>
          </div>
        </div>
        <button className="flex items-center px-3 py-2 mb-4 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition">
          <span className="mr-2">🎁</span> Get Pro For Free
        </button>
        <nav className="flex-1">
          <ul className="space-y-2">
            <li>
              <Link to="/" className="flex items-center text-gray-700 hover:text-blue-700 font-medium rounded px-3 py-2 bg-blue-50">
                <span className="mr-2">🏠</span> Home
              </Link>
            </li>
            <li>
              <Link to="/history" className="flex items-center text-gray-700 hover:text-blue-700 font-medium rounded px-3 py-2">
                <History className="w-4 h-4 mr-2" /> Meeting History
              </Link>
            </li>
          </ul>
        </nav>
        <div className="mt-auto">
          <button
            onClick={handleSignOut}
            className="flex items-center text-gray-600 hover:text-red-600 px-3 py-2 rounded transition"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </button>
        </div>
      </aside>
      <button
        className="md:hidden fixed top-4 right-4 z-50 bg-white rounded-full p-2 shadow"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6 text-blue-600" />
      </button>
      <div className="flex-1 flex flex-col">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-10 py-6 bg-white border-b">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-2 md:space-y-0 md:space-x-4 w-full">
            <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
            <div className="flex space-x-2">
              {/* <button
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                onClick={handleImportCalendar}
                disabled={loading}
              >
                Import
              </button> */}
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!audioSupported || !apiStatus.gemini || !apiStatus.huggingface} 
              >
                <Mic className="w-5 h-5 mr-2" />
                {isRecording ? "Stop Recording" : "Record"}
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-6 mt-4 md:mt-0">
            <nav className="flex space-x-6 text-gray-600 font-medium">
              <span className="border-b-2 border-transparent hover:border-blue-600 cursor-pointer">Meetings</span>
              <span className="border-b-2 border-blue-600">Calendar</span>
            </nav>
            <Settings className="w-5 h-5 text-gray-400 cursor-pointer" />
          </div>
        </header>
        <div className="flex flex-1 flex-col md:flex-row">
          <section className="flex-1 px-4 md:px-10 py-8 overflow-y-auto">
            {/* Meeting Link Extraction UI */}
            <div className="mb-8 p-4 bg-white border border-gray-200 rounded-lg">
              <div className="font-semibold mb-2 text-gray-700">Extract Meeting Details from Link</div>
              <div className="flex flex-col md:flex-row items-center gap-2">
                <input
                  type="text"
                  value={meetingLink}
                  onChange={e => setMeetingLink(e.target.value)}
                  placeholder="Paste your Google Meet, Zoom, or Teams link here"
                  className="flex-1 px-3 py-2 border rounded-md"
                />
                <button
                  onClick={handleExtractDetails}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Extract Details
                </button>
              </div>
              {meetingDetails.platform && (
                <div className="mt-4 text-gray-800">
                  <div><strong>Platform:</strong> {meetingDetails.platform}</div>
                  {meetingDetails.platform === 'Zoom' && (
                    <div className="my-2">
                      <img src="https://portal-media.cca.edu/images/Zoom_banner2x.width-1130.png" alt="Zoom" style={{height: 40}} />
                    </div>
                  )}
                  {meetingDetails.platform === 'Google Meet' && (
                    <div className="my-2">
                      <img src="https://community.pepperdine.edu/it/images/google-meet-1440x430.jpg" alt="Google Meet" style={{height: 40}} />
                    </div>
                  )}
                  {meetingDetails.platform === 'Microsoft Teams' && (
                    <div className="my-2">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/4/4e/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg" alt="Teams" style={{height: 40}} />
                    </div>
                  )}
                  {meetingDetails.link && <div><strong>Link:</strong> <a href={meetingDetails.link} target="_blank" rel="noopener noreferrer">{meetingDetails.link}</a></div>}
                  {meetingDetails.date && <div><strong>Date:</strong> {meetingDetails.date}</div>}
                  {meetingDetails.time && <div><strong>Time:</strong> {meetingDetails.time}</div>}
                  {meetingDetails.duration && <div><strong>Duration:</strong> {meetingDetails.duration}</div>}
                  {meetingDetails.timezone && <div><strong>Time Zone:</strong> {meetingDetails.timezone}</div>}
                </div>
              )}
              {meetingDetails.error && (
                <div className="mt-2 text-red-600">{meetingDetails.error}</div>
              )}
            </div>
            {isRecording && (
              <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-700">
                    Recording Time: {formatDuration(duration)}
                  </span>
                  {!isPaused && (
                    <span className="inline-block ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  )}
                  {isPaused && (
                    <span className="ml-2 text-yellow-600 font-medium">Paused</span>
                  )}
                </div>
                <button
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
                >
                  {isPaused ? (
                    <>
                      <span className="inline-block mr-2">&#9654;</span> Resume
                    </>
                  ) : (
                    <>
                      <span className="inline-block mr-2">&#10073;&#10073;</span> Pause
                    </>
                  )}
                </button>
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center"
                >
                  <MicOff className="w-4 h-4 mr-2" /> Stop
                </button>
              </div>
            )}
            {audioURL && (
              <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="font-semibold mb-2 text-gray-700">Recorded Audio Preview</div>
                <audio controls src={audioURL} className="w-full" />
              </div>
            )}
            {transcript && (
              <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="font-semibold mb-2 text-gray-700">Transcript</div>
                <div className="text-gray-800 whitespace-pre-wrap">{transcript}</div>
              </div>
            )}
            {Object.keys(groupedMeetings).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-lg font-semibold mb-2 text-gray-800">You don't have any meetings</div>
                <div className="mb-4 text-sm text-gray-500 text-center">
                  Looks like you don't have any events on your calendar for the next 7 days.<br />
                  You can create new events in your calendar app and then refresh the browser window.
                </div>
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors mb-2"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/2560px-Gmail_icon_%282020%29.svg.png" alt="Google Calendar" className="w-5 h-5 mr-2" />
                  Open your Gmail Calendar
                </a>
                <div>
                  <button className="text-blue-600 underline text-sm">Troubleshooting</button>
                </div>
              </div>
            ) : (
              Object.entries(groupedMeetings).map(([date, meetings]) => (
                <div key={date} className="mb-10">
                  <div className="text-lg font-semibold text-gray-700 mb-4">{date}</div>
                  {meetings.map(meeting => (
                    <div key={meeting.id} className="flex items-center bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6 shadow-sm">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg mr-4">
                        {userEmail ? userEmail[0].toUpperCase() : "N"}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 truncate">{meeting.summary}</div>
                        <div className="text-xs text-gray-500 mb-2">
                          {meeting.date ? new Date(meeting.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""} &middot; {Math.round(meeting.duration/60)} min &middot; {userEmail}
                        </div>
                        {meeting.transcript && (
                          <ul className="list-disc list-inside text-gray-700 text-sm mb-2">
                            {meeting.transcript.split('\n').map((line, idx) => (
                              <li key={idx}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="ml-6 w-32 h-20 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                        <span className="text-xs">No Image</span>
                      </div>
                      <div className="ml-6 flex items-center space-x-4">
                        <button className="flex items-center text-gray-500 hover:text-blue-600">
                          <span className="mr-1">☑️</span>2
                        </button>
                        <button className="flex items-center text-gray-500 hover:text-blue-600">
                          <span className="mr-1">💬</span>5
                        </button>
                        <button
                          className="flex items-center text-red-500 hover:text-red-700"
                          onClick={() => removeMeeting(meeting.id)}
                          title="Remove meeting"
                        >
                          <span className="mr-1">🗑️</span>Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>
          <aside className="hidden md:flex w-full md:w-96 bg-white border-t md:border-t-0 md:border-l px-4 md:px-8 py-8 flex-col">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6">
              <div className="flex space-x-2">
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-3 py-1 bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded shadow 
                  hover:from-blue-500 hover:to-blue-700 text-sm font-semibold transition"
                >
                  Today
                </button>
                <button
                  onClick={() => setSelectedDate(
                    selectedDate ? new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)) : new Date()
                  )}
                  className="px-2 py-1 rounded bg-gray-100 hover:bg-blue-100 text-blue-600 text-sm font-semibold"
                  title="Previous Month"
                >
                  &lt;
                </button>
                <span className="px-2 py-1 text-sm font-semibold text-gray-700">
                  {selectedDate
                    ? selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                    : new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setSelectedDate(
                    selectedDate ? new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)) : new Date()
                  )}
                  className="px-2 py-1 rounded bg-gray-100 hover:bg-blue-100 text-blue-600 text-sm font-semibold"
                  title="Next Month"
                >
                  &gt;
                </button>
              </div>
            </div>
            <div className="mb-6 rounded-xl shadow-lg overflow-hidden bg-gradient-to-br from-blue-50 via-white to-blue-100 p-4">
              <Calendar
                onChange={date => setSelectedDate(date as Date)}
                value={selectedDate}
                className="react-calendar-fancy"
                tileClassName={({ date }) => {
                  if (
                    date.toDateString() === new Date().toDateString()
                  ) {
                    return 'bg-blue-200 font-bold text-blue-900 rounded-full';
                  }
                  if (
                    selectedDate &&
                    date.toDateString() === selectedDate.toDateString()
                  ) {
                    return 'bg-blue-500 text-white font-bold rounded-full';
                  }
                  return '';
                }}
              />
            </div>
            <style>{`
              .react-calendar-fancy {
                border: none;
                background: transparent;
                font-family: inherit;
                width: 100%;
                min-width: 220px;
              }
              .react-calendar__tile {
                transition: background 0.2s, color 0.2s;
                border-radius: 9999px;
              }
              .react-calendar__tile--active {
                background: #2563eb !important;
                color: #fff !important;
                font-weight: bold;
              }
              .react-calendar__tile--now {
                background: #bfdbfe !important;
                color: #1e3a8a !important;
                font-weight: bold;
              }
              .react-calendar__month-view__days__day:hover {
                background: #93c5fd !important;
                color: #1e3a8a !important;
              }
              @media (max-width: 768px) {
                .react-calendar-fancy {
                  font-size: 0.9rem;
                  min-width: 180px;
                }
                .w-96 {
                  width: 100% !important;
                }
                .px-8 {
                  padding-left: 1rem !important;
                  padding-right: 1rem !important;
                }
                .py-8 {
                  padding-top: 1rem !important;
                  padding-bottom: 1rem !important;
                }
              }
            `}</style>
          </aside>
        </div>
      </div>
    </div>
  );
}
