import React, { useState } from 'react';
import { X } from 'lucide-react';

interface EmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  date: string;
  duration: number;
}

export function EmailDialog({ isOpen, onClose, summary, date, duration }: EmailDialogProps) {
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailList = emails.split(',').map(email => email.trim());
    const validEmails = emailList.every(email => 
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );

    if (!validEmails) {
      setError('Please enter valid email addresses separated by commas');
      return;
    }

    const formattedDate = new Date(date).toLocaleString();
    const formattedDuration = `${Math.floor(duration / 60)} minutes`;
    
    const subject = `Meeting Summary - ${formattedDate}`;
    const body = `
Meeting Summary
Date: ${formattedDate}
Duration: ${formattedDuration}

${summary}
    `.trim();

    const mailtoLink = `mailto:${emailList.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Send Summary via Email</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Addresses
            </label>
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="Enter email addresses separated by commas"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <p className="text-sm text-gray-500 mt-1">
              Separate multiple email addresses with commas
            </p>
            {error && (
              <p className="text-sm text-red-600 mt-1">{error}</p>
            )}
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Send Email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}