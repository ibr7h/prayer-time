import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QiblaScreen from './QiblaScreen';
import type { Place } from './prayers';

afterEach(cleanup);

const place: Place = {
  name: 'الرياض',
  latitude: 24.7136,
  longitude: 46.6753,
  timeZone: 'Asia/Riyadh',
  source: 'city',
  updatedAt: 0
};

describe('qibla modes screen', () => {
  it('starts on the preserved compass mode', () => {
    render(<QiblaScreen place={place} bearing={244} onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: /بوصلة/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'تشغيل البوصلة' })).toBeTruthy();
  });

  it('switches to camera arrows without requesting camera until the user starts it', () => {
    render(<QiblaScreen place={place} bearing={244} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /أسهم/ }));
    expect(screen.getByRole('button', { name: /تشغيل وضع الأسهم/ })).toBeTruthy();
    expect(screen.getByText(/الفيديو لا يغادر جهازك/)).toBeTruthy();
  });

  it('shows a heading-up map with an explicit sensor start control', () => {
    render(<QiblaScreen place={place} bearing={244} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /خريطة/ }));
    expect(screen.getByRole('button', { name: /تشغيل اتجاه الخريطة/ })).toBeTruthy();
    expect(screen.getByText(/الخريطة الآن شمالها إلى أعلى/)).toBeTruthy();
  });
});
