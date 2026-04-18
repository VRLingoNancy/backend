export const SUPPORTED_LANGS = ['fr', 'en', 'it', 'de'] as const;

export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export function isSupportedLang(lang: string): lang is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}

// Normalise vers une clé canonique strictement supportée: fr | en | it | de
export function normalizeLangCode(code?: string): SupportedLang | '' {
  if (!code) return '';

  const normalized = code.trim().toLowerCase().replace('_', '-');
  const base = normalized.split('-')[0];

  if (base === 'fr' || normalized === 'français') return 'fr';
  if (base === 'en' || normalized === 'anglais') return 'en';
  if (base === 'it' || normalized === 'italien') return 'it';
  if (base === 'de' || normalized === 'allemand') return 'de';

  return '';
}

export function getEffectiveLang(
  code: string | undefined,
  fallback: SupportedLang = 'fr'
): SupportedLang {
  const normalized = normalizeLangCode(code);
  return normalized || fallback;
}
