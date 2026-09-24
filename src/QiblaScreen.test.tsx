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

  it('shows a north-up map with the qibla bearing overlay', () => {
    render(<QiblaScreen place={place} bearing={244} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /خريطة/ }));
    expect(screen.getByText(/الخريطة شمالها إلى أعلى/)).toBeTruthy();
    expect(screen.getByText('244°')).toBeTruthy();
  });
});
