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
  it('opens the full qibla screen with compass, arrows, and map modes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'تحديد الموقع' }));
    fireEvent.click(screen.getByRole('button', { name: 'الرياض' }));
    fireEvent.click(screen.getByRole('button', { name: 'فتح شاشة القبلة' }));
    expect(screen.getByRole('heading', { name: 'القبلة' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /بوصلة/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /أسهم/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /خريطة/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تشغيل البوصلة' })).toBeTruthy();
  });

  it('shows notification and adhan controls in settings', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات التطبيق' }));
    expect(screen.getByRole('button', { name: 'اختبار النظام' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'اختبار داخل التطبيق' })).toBeTruthy();
    expect(screen.getByText('اختبار إشعار النظام')).toBeTruthy();
    expect(screen.getByText('اختبار وقت الصلاة داخل التطبيق')).toBeTruthy();
    expect(screen.getByText(/يظهر التنبيه فورًا/)).toBeTruthy();
    expect(screen.getByText('صوت الأذان عند دخول الوقت')).toBeTruthy();
    expect(screen.getByText(/سيُهيأ عند أول لمسة/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'صوت الأذان' })).toBeTruthy();
    expect(screen.getByLabelText('حالة التنبيهات')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إعادة الفحص الآن' })).toBeTruthy();
  });

});
