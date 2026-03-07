import { SUPPORTED_LANGUAGES } from '../lib/constants/languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('has exactly 5 languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(5);
  });

  it('contains only ko, en, ja, zh, es', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).toEqual(['ko', 'en', 'ja', 'zh', 'es']);
  });

  it('does not contain removed languages', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).not.toContain('vi');
    expect(codes).not.toContain('th');
    expect(codes).not.toContain('id');
  });

  it('has Korean as default', () => {
    const korean = SUPPORTED_LANGUAGES.find(l => l.code === 'ko');
    expect(korean?.default).toBe(true);
  });
});
