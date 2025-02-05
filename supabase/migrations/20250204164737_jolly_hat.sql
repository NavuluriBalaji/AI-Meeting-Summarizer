/*
  # Storage setup for meeting videos

  1. Setup
    - Create storage bucket for meeting videos
  2. Security
    - Enable storage access for authenticated users
    - Configure RLS policies for bucket access
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-videos', 'meeting-videos', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated uploads
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meeting-videos' AND
  auth.role() = 'authenticated'
);

-- Create policy to allow users to read their own files
CREATE POLICY "Allow users to read own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meeting-videos' AND
  owner = auth.uid()
);

-- Create policy to allow users to update their own files
CREATE POLICY "Allow users to update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'meeting-videos' AND
  owner = auth.uid()
);

-- Create policy to allow users to delete their own files
CREATE POLICY "Allow users to delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'meeting-videos' AND
  owner = auth.uid()
);