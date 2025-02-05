import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Auth } from './components/Auth';
import { MeetingSummarizer } from './components/MeetingSummarizer';
import { MeetingHistory } from './components/MeetingHistory';
import { supabase } from './lib/supabase';

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

  if (!session) {
    return <Auth />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MeetingSummarizer />} />
        <Route path="/history" element={<MeetingHistory />} />
      </Routes>
    </Router>
  );
}

export default App;