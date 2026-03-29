import type { ExtractionResult } from '@shared/types';

export function isGmail(): boolean {
  return window.location.hostname === 'mail.google.com';
}

export function extractGmail(): ExtractionResult | null {
  if (!isGmail()) return null;

  // Primary selector: expanded email body
  const emailBody =
    document.querySelector<HTMLElement>('.a3s.aiL') ??
    document.querySelector<HTMLElement>('.ii.gt');

  if (!emailBody) return null;

  const textContent = emailBody.innerText.trim();
  if (!textContent) return null;

  // Try to get the subject line
  const subjectEl = document.querySelector<HTMLElement>('h2[data-thread-perm-id]');
  const title = subjectEl?.innerText.trim() ?? document.title;

  return {
    title,
    html: emailBody.innerHTML,
    textContent,
    wordCount: textContent.split(/\s+/).filter(Boolean).length,
    sourceElement: emailBody,
  };
}
