/** Shared file-upload helper for wizards that start from an existing file (edit, mix, translate, enhance, remove_text). */

export interface UploadedFile {
  url: string;
  name: string;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Otpremanje fajla nije uspelo.');
  return { url: data.url, name: file.name };
}
