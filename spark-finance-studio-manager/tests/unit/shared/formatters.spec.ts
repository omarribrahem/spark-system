import { describe, it, expect } from 'vitest';
import {
  piastersToEgp,
  egpToPiasters,
  formatPiasters,
  minutesToDecimalHours,
  hoursToMinutes,
  formatMinutesArabic,
} from '../../../src/shared/formatters';

describe('Shared Formatters & Invariants', () => {
  describe('Piasters Currency Math', () => {
    it('converts integer piasters to EGP cleanly', () => {
      expect(piastersToEgp(100)).toBe(1);
      expect(piastersToEgp(150000)).toBe(1500);
      expect(piastersToEgp(1550)).toBe(15.5);
      expect(piastersToEgp(0)).toBe(0);
    });

    it('rejects floating-point piasters', () => {
      expect(() => piastersToEgp(1500.55)).toThrow(/Invalid piaster amount/);
    });

    it('converts EGP to integer piasters', () => {
      expect(egpToPiasters(1)).toBe(100);
      expect(egpToPiasters(1500)).toBe(150000);
      expect(egpToPiasters(15.5)).toBe(1550);
      expect(egpToPiasters(0)).toBe(0);
    });

    it('formats piasters with Egyptian currency symbol', () => {
      expect(formatPiasters(150000)).toBe('1,500 ج.م');
      expect(formatPiasters(150000, false)).toBe('1,500');
      expect(formatPiasters(125050)).toBe('1,250.50 ج.م');
    });
  });

  describe('Minutes Time Math', () => {
    it('converts integer minutes to decimal hours', () => {
      expect(minutesToDecimalHours(60)).toBe(1.0);
      expect(minutesToDecimalHours(90)).toBe(1.5);
      expect(minutesToDecimalHours(270)).toBe(4.5);
      expect(minutesToDecimalHours(0)).toBe(0);
    });

    it('rejects floating-point minutes', () => {
      expect(() => minutesToDecimalHours(45.5)).toThrow(/Invalid minutes/);
    });

    it('converts decimal hours to integer minutes', () => {
      expect(hoursToMinutes(1)).toBe(60);
      expect(hoursToMinutes(1.5)).toBe(90);
      expect(hoursToMinutes(4.5)).toBe(270);
    });

    it('formats minutes into Arabic phrases', () => {
      expect(formatMinutesArabic(60)).toBe('ساعة واحدة');
      expect(formatMinutesArabic(90)).toBe('ساعة ونصف');
      expect(formatMinutesArabic(120)).toBe('ساعتان');
      expect(formatMinutesArabic(180)).toBe('3 ساعات');
      expect(formatMinutesArabic(270)).toBe('4.5 ساعة (270 دقيقة)');
    });
  });
});
