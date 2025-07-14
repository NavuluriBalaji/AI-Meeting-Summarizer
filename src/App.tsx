import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { MeetingSummarizer } from './components/MeetingSummarizer';
import { MeetingHistory } from './components/MeetingHistory';
import { supabase } from './lib/supabase';
import { LandingPage } from './components/LandingPage';
import { PricingPage } from './components/PricingPage';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/summarizer"
          element={session ? <MeetingSummarizer /> : <Navigate to="/auth" />}
        />
        <Route
          path="/history"
          element={session ? <MeetingHistory /> : <Navigate to="/auth" />}
        />
        <Route path="/auth" element={<Auth />} />
        <Route path="/pricing" element={<PricingPage />} />
      </Routes>
    </Router>
  );
}

export default App;