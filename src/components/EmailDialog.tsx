import React, { useState } from 'react';
import { X, Mail, Copy, Check } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);
  const [emailContent, setEmailContent] = useState('');

  if (!isOpen) return null;

  const generateEmailContent = () => {
    const formattedDate = new Date(date).toLocaleString();
    const formattedDuration = `${Math.floor(duration / 60)} minutes`;
    
    const subject = `Meeting Summary - ${formattedDate}`;
    const body = `
Meeting Summary
Date: ${formattedDate}
Duration: ${formattedDuration}

${summary}
    `.trim();

    return { subject, body };
  };

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

    const { subject, body } = generateEmailContent();
    
    try {
      const mailtoLink = `mailto:${emailList.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Try to open mailto link
      window.location.href = mailtoLink;
      
      // Show success message and fallback options
      setEmailContent(`To: ${emailList.join(', ')}\nSubject: ${subject}\n\n${body}`);
      
    } catch (err) {
      setError('Unable to open email client. Please copy the content below.');
      setEmailContent(`To: ${emailList.join(', ')}\nSubject: ${subject}\n\n${body}`);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(emailContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleOpenGmail = () => {
    const { subject, body } = generateEmailContent();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emails)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  const handleOpenOutlook = () => {
    const { subject, body } = generateEmailContent();
    const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(emails)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(outlookUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
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

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Mail className="w-4 h-4 mr-2" />
              Open Email Client
            </button>
            <button
              type="button"
              onClick={handleOpenGmail}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Open Gmail
            </button>
            <button
              type="button"
              onClick={handleOpenOutlook}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Open Outlook
            </button>
          </div>

          {emailContent && (
            <div className="mb-4 p-3 bg-gray-50 border rounded-md">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Email Content:</span>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="flex items-center px-2 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={emailContent}
                readOnly
                className="w-full px-2 py-1 text-sm bg-white border rounded"
                rows={8}
              />
              <p className="text-xs text-gray-500 mt-1">
                If the email client doesn't open, copy this content and paste it into your email application.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}