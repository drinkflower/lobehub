/** The 16 Myers-Briggs types, as a closed set — new letters are not a thing. */
export const MBTI_TYPES = [
  'INTJ',
  'INTP',
  'ENTJ',
  'ENTP',
  'INFJ',
  'INFP',
  'ENFJ',
  'ENFP',
  'ISTJ',
  'ISFJ',
  'ESTJ',
  'ESFJ',
  'ISTP',
  'ISFP',
  'ESTP',
  'ESFP',
] as const;

export type MbtiType = (typeof MBTI_TYPES)[number];

/** Western zodiac signs, in the conventional order. */
export const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

/**
 * Who an agent *is*: the character sheet a user shapes and the artwork that
 * depicts it. One bag rather than a column per trait — none of this is ever a
 * query predicate, an index, or a join, and anything that becomes one belongs
 * in a real column instead (`name`, `title`, `avatar`, `societyId`).
 *
 * Traits are hints the prompt and artwork layers may use, never switches that
 * change behaviour.
 */
export interface AgentProfile {
  /**
   * Free-text direction the user last generated with ("a boy with glasses").
   * Kept so a regeneration reproduces the same character instead of silently
   * dropping what they asked for.
   */
  artworkDirection?: string;
  /**
   * Id of the artwork style preset the current images were generated with, so
   * reopening the studio resumes where the user left off. Values are the
   * studio's own preset ids; the studio narrows the string it reads back.
   */
  artworkStyle?: string;
  /**
   * Head-to-toe artwork of the same character as the agent's avatar, stored as
   * a transparent PNG so large surfaces can composite it over their own
   * background.
   */
  fullBodyArtwork?: string;
  /** Myers-Briggs type, e.g. `INFP`. */
  mbti?: MbtiType;
  /** Western zodiac sign, e.g. `libra`. */
  zodiac?: ZodiacSign;
}
