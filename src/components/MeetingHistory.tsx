import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
}

export function MeetingHistory() {
  const [summaryHistory, setSummaryHistory] = React.useState<MeetingSummary[]>([]);

  React.useEffect(() => {
    const history = localStorage.getItem('meetingSummaryHistory');
    if (history) {
      setSummaryHistory(JSON.parse(history));
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center">
          <Link
            to="/"
            className="flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Recording
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-8">Meeting History</h1>

          {summaryHistory.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No meeting summaries available yet
            </div>
          ) : (
            <div className="space-y-8">
              {summaryHistory.map((meeting) => (
                <div
                  key={meeting.id}
                  className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="text-sm text-gray-500">
                      {new Date(meeting.date).toLocaleString()}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="w-4 h-4 mr-1" />
                      {formatDuration(meeting.duration)}
                    </div>
                  </div>
                  <div className="prose max-w-none">
                    {meeting.summary.split('\n').map((line, i) => (
                      <p key={i} className="mb-2">{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}