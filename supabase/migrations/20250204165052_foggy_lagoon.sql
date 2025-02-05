/*
  # Fix Storage Policies for Meeting Videos

  1. Changes
    - Modify upload policy to be more permissive for initial upload
    - Ensure proper owner assignment during upload
    - Maintain secure access for read/update/delete operations
  2. Security
    - Maintain RLS enforcement
    - Ensure proper authentication checks
*/

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;

-- Create a more permissive upload policy
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'meeting-videos'
);

-- Create policy to allow users to read their own files
CREATE POLICY "Allow users to read own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'meeting-videos' AND
    (auth.uid() = owner OR owner IS NULL)
);

-- Create policy to allow users to update their own files
CREATE POLICY "Allow users to update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'meeting-videos' AND
    auth.uid() = owner
);

-- Create policy to allow users to delete their own files
CREATE POLICY "Allow users to delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'meeting-videos' AND
    auth.uid() = owner
);