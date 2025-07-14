import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Trash2, Mail, Edit, Save } from 'lucide-react'; // Import Edit and Save icons
import { EmailDialog } from './EmailDialog';

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
  isEditing?: boolean; // Add isEditing property
}

export function MeetingHistory() {
  const [summaryHistory, setSummaryHistory] = React.useState<MeetingSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = React.useState<MeetingSummary | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = React.useState(false);

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

  const handleDelete = (id: string) => {
    const updatedHistory = summaryHistory.filter(summary => summary.id !== id);
    setSummaryHistory(updatedHistory);
    localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
  };

  const handleEmail = (summary: MeetingSummary) => {
    setSelectedSummary(summary);
    setIsEmailDialogOpen(true);
  };

  const handleEdit = (id: string) => {
    const updatedHistory = summaryHistory.map(summary =>
      summary.id === id ? { ...summary, isEditing: true } : summary
    );
    setSummaryHistory(updatedHistory);
    localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
  };

  const handleSave = (id: string, newSummary: string, newTranscript: string) => {
    const updatedHistory = summaryHistory.map(summary =>
      summary.id === id
        ? { ...summary, summary: newSummary, transcript: newTranscript, isEditing: false }
        : summary
    );
    setSummaryHistory(updatedHistory);
    localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center">
          <Link
            to="/summarizer"
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
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center text-sm text-gray-500">
                        <Clock className="w-4 h-4 mr-1" />
                        {formatDuration(meeting.duration)}
                      </div>
                      <button
                        onClick={() => handleEmail(meeting)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Send via email"
                      >
                        <Mail className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(meeting.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete summary"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      {!meeting.isEditing ? (
                        <button
                          onClick={() => handleEdit(meeting.id)}
                          className="text-gray-600 hover:text-gray-800"
                          title="Edit summary"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const newSummary = document.getElementById(`summary-${meeting.id}`)!.value;
                            const newTranscript = document.getElementById(`transcript-${meeting.id}`)!.value;
                            handleSave(meeting.id, newSummary, newTranscript);
                          }}
                          className="text-green-600 hover:text-green-800"
                          title="Save summary"
                        >
                          <Save className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="prose max-w-none">
                    <h3 className="text-lg font-semibold mb-4">Summary</h3>
                    {meeting.isEditing ? (
                      <textarea
                        id={`summary-${meeting.id}`}
                        className="w-full border rounded-md p-2"
                        defaultValue={meeting.summary}
                      />
                    ) : (
                      meeting.summary.split('\n').map((line, i) => (
                        <p key={i} className="mb-2">{line}</p>
                      ))
                    )}

                    <h3 className="text-lg font-semibold mt-6 mb-4">Transcript</h3>
                    {meeting.isEditing ? (
                      <textarea
                        id={`transcript-${meeting.id}`}
                        className="w-full border rounded-md p-2 whitespace-pre-wrap"
                        defaultValue={meeting.transcript}
                      />
                    ) : (
                      <p className="text-gray-700 whitespace-pre-wrap">{meeting.transcript}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedSummary && (
        <EmailDialog
          isOpen={isEmailDialogOpen}
          onClose={() => {
            setIsEmailDialogOpen(false);
            setSelectedSummary(null);
          }}
          summary={selectedSummary.summary}
          date={selectedSummary.date}
          duration={selectedSummary.duration}
        />
      )}
    </div>
  );
}