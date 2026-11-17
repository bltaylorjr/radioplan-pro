// Small weather warning shown on job pages (Site Data, Installation guides, Service) from the NOAA weather saved on
// the project by the Weather & Radar page: alerts in force, lightning, high wind, cold or heat for the work day.
import React from 'react';
import { useStore } from '../store';
import { alertActive, ago } from '../engine/weather';

const FRESH_H = 12;

export function WeatherNote() {
  const { project: p, go } = useStore();
  const w = p.weather;
  if (!w || Date.now() - w.at > FRESH_H * 3600e3) return null;
  const alerts = w.alerts.filter((a) => alertActive(a));
  const notes = w.notes.filter((n) => n.tone !== 'ok' && !n.text.includes(' in force'));
  if (!alerts.length && !notes.length) return null;
  const bad = alerts.some((a) => /warning/i.test(a.event)) || notes.some((n) => n.tone === 'bad');
  return (
    <div className={`wx-note wx-banner no-print ${bad ? 'bad' : 'warn'}`} role="status" data-tour="wx-banner">
      {alerts.length > 0 && <div><b>⚠ {alerts.map((a) => a.event).join(', ')}</b> at the site (National Weather Service).</div>}
      {notes.slice(0, 2).map((n, i) => <div key={i} className="small">{n.icon} {n.text}</div>)}
      <div className="small muted">Weather from {ago(Date.now() - w.at)}. <a href="#weather" onClick={(e) => { e.preventDefault(); go('weather'); }}>Open Weather & Radar</a></div>
    </div>
  );
}
