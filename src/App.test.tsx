import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('phone app interactions', () => {
  it('starts without made-up prayer times and computes them after selecting a city', () => {
    const { container } = render(<App />);
    expect(screen.getByText('المواقيت بانتظار موقعك')).toBeTruthy();
    expect(container.querySelectorAll('.prayer-row')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'تحديد الموقع' }));
    fireEvent.click(screen.getByRole('button', { name: 'جازان' }));
    expect(container.querySelectorAll('.prayer-row')).toHaveLength(6);
    expect(screen.getByText('موقع مختار يدويًا')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تشغيل أذان الفجر' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تشغيل أذان الشروق' })).toBeNull();
  });

  it('persists calculation settings without sharing location outside the browser', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'تحديد الموقع' }));
    fireEvent.click(screen.getByRole('button', { name: 'الرياض' }));
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات التطبيق' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'طريقة حساب المواقيت' }), {
      target: { value: 'egyptian' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'زيادة دقيقة' }));
    const saved = JSON.parse(localStorage.getItem('miqati:settings:v1') ?? '{}');
    expect(saved.place.name).toBe('الرياض');
    expect(saved.preferences.method).toBe('egyptian');
    expect(saved.preferences.adjustment).toBe(1);
  });
  it('opens the interactive qibla compass from the qibla card', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'تحديد الموقع' }));
    fireEvent.click(screen.getByRole('button', { name: 'الرياض' }));
    fireEvent.click(screen.getByRole('button', { name: 'فتح بوصلة القبلة' }));
    expect(screen.getByRole('heading', { name: 'بوصلة القبلة' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تشغيل البوصلة' })).toBeTruthy();
    expect(screen.getByText(/زاوية القبلة من الشمال الجغرافي/)).toBeTruthy();
  });

});
