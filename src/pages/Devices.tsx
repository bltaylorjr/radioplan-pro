import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { Role, ROLE_LABEL, connectDevice, disconnectDevice, deviceState, subscribeDevices, devicesVersion, connectedRoles, setMeterTypes } from '../engine/devices';
import { bluetoothSupported, serialSupported, phoneSignalSupported, Transport, TRANSPORT_LABEL } from '../engine/meter';
import { BYTE_FORMATS, ByteFormat } from '../engine/signal';
import { platform } from '../engine/update';

/** Re-render when a device connects, disconnects or sends something. */
export function useDevices() { useSyncExternalStore(subscribeDevices, devicesVersion); return { state: deviceState, roles: connectedRoles() }; }

const INFO: Record<Role, { icon: string; what: string; uses: string; wifiHint: string; examples: string }> = {
  meter: { icon: '📶', what: 'Signal strength meters, spectrum analyzers and BDA / ERCES test sets.', uses: 'Live Signal Readings (walk tests, ERCES grid tests, comparing with the prediction). Can also fill any signal box you tap.', wifiHint: 'http://192.168.4.1/reading', examples: 'Meters that send text like “-87.5 dBm” over Bluetooth, a USB cable or Wi-Fi.' },
  gps: { icon: '🛰', what: 'External GPS / GNSS receivers (including RTK receivers) for better positions than a phone or laptop.', uses: 'Every 📍 GPS button in the app, the live position on the maps, Site Data, field notes, photos, readings and asset tags.', wifiHint: 'tcp://192.168.1.20:10110', examples: 'Receivers that send NMEA (GGA / RMC) over Bluetooth, USB or Wi-Fi.' },
  distance: { icon: '📏', what: 'Laser distance meters and measuring wheels.', uses: 'Tap any length box (cable runs, ceiling heights, room sizes, mast heights), press measure on the laser and the number goes in. Feet or meters follow the app setting.', wifiHint: 'http://192.168.4.1/', examples: 'Lasers with Bluetooth data transfer (e.g. models that send text or Leica / Bosch style values).' },
  scanner: { icon: '🏷', what: 'Barcode and QR scanners.', uses: 'Equipment & Asset Tags: each scan finds or adds the device. On other pages the scan goes into the box you tapped.', wifiHint: 'http://192.168.4.1/scan', examples: 'Most handheld scanners also work as a keyboard (no setup): just tap a box and scan.' },
};

function RoleCard({ role }: { role: Role }) {
  const { go, project: p } = useStore();
  const s = deviceState(role);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [url, setUrl] = useState(''); const [every, setEvery] = useState(1);
  const [fmt, setFmt] = useState<ByteFormat>('auto'); const [baud, setBaud] = useState(role === 'gps' ? 4800 : 9600);
  const [types, setTypes] = useState(false);
  const i = INFO[role];
  const go2 = async (t: Transport, phone?: 'cell' | 'wifi') => {
    setErr(''); setBusy(true);
    try { await connectDevice(role, t, { url: url.trim(), everyMs: every * 1000, format: fmt, baud, phone }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const can: Record<Transport, boolean> = { bluetooth: bluetoothSupported(), serial: serialSupported(), wifi: true, phone: phoneSignalSupported() };
  const fresh = s?.last && Date.now() - s.last.at < 15000;
  return (
    <Card title={`${i.icon} ${ROLE_LABEL[role]}`} tip={i.examples}>
      <p className="small">{i.what}</p>
      <p className="small muted"><b>Used by:</b> {i.uses}</p>
      {s ? <div className={'dev-status ' + (s.connected ? 'on' : 'off')}>
        <b>{s.connected ? '● Connected' : '○ Not connected'}</b> {s.name && <>· {s.name} ({TRANSPORT_LABEL[s.transport]})</>}
        <div className="small">{fresh ? <>Last: <b>{s.last!.text}</b></> : s.status}</div>
        <div className="row wrap">
          <button onClick={() => disconnectDevice(role)}>Disconnect</button>
          {role === 'meter' && <button onClick={() => go('signal')}>📶 Live Signal Readings →</button>}
          {role === 'scanner' && <button onClick={() => go('assets')}>🏷 Equipment & Asset Tags →</button>}
          {role === 'gps' && <button onClick={() => go('sites')}>📍 Site Data & GPS →</button>}
        </div>
        {role === 'meter' && <label className="check small"><input type="checkbox" checked={types} onChange={(e) => { setTypes(e.target.checked); setMeterTypes(e.target.checked); }} /> Also put each reading in the box I tap</label>}
        {role === 'distance' && <p className="small muted">Measurements go into the box you tap, in {p.settings.units === 'km' ? 'meters' : 'feet'}.</p>}
      </div> : <>
        <div className="row wrap">
          <button className="primary" disabled={!can.bluetooth || busy} onClick={() => go2('bluetooth')} title={can.bluetooth ? 'Pair and connect over Bluetooth' : 'Bluetooth needs Chrome or Edge (computer or Android). In the installed app, use Wi-Fi or the device as a keyboard.'}>🔵 Bluetooth</button>
          <button disabled={!can.serial || busy} onClick={() => go2('serial')} title={can.serial ? 'USB cable, or a Bluetooth device paired in Windows (shows as a COM port)' : 'USB / COM ports need Chrome or Edge on a computer.'}>🔌 USB / COM port</button>
          {role === 'meter' && can.phone && <><button disabled={busy} onClick={() => go2('phone', 'cell')}>📱 Phone cell signal</button><button disabled={busy} onClick={() => go2('phone', 'wifi')}>📱 Phone Wi-Fi signal</button></>}
        </div>
        <div className="row wrap" style={{ marginTop: 6 }}>
          <input style={{ flex: 1, minWidth: 200 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`Wi-Fi address, e.g. ${i.wifiHint}`} aria-label="Wi-Fi device address" />
          <button disabled={!url.trim() || busy} onClick={() => go2('wifi')}>📶 Connect on Wi-Fi</button>
        </div>
        <details><summary className="small">Settings</summary><div className="form">
          {role === 'meter' && <label className="field"><span>Bluetooth data format</span><select value={fmt} onChange={(e) => setFmt(e.target.value as ByteFormat)} data-no-choose>{BYTE_FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          <label className="field"><span>COM port speed</span><select value={baud} onChange={(e) => setBaud(+e.target.value)} data-no-choose>{[4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b} baud</option>)}</select></label>
          <label className="field"><span>Wi-Fi: read every</span><select value={every} onChange={(e) => setEvery(+e.target.value)} data-no-choose>{[0.5, 1, 2, 5].map((x) => <option key={x} value={x}>{x} s</option>)}</select></label>
        </div><p className="small muted">The defaults suit most devices. GPS receivers usually use 4800 or 9600 baud.</p></details>
        {s && <p className="small">{(s as { status: string }).status}</p>}
      </>}
      {err && <p className="bad-text small">{err}</p>}
    </Card>
  );
}

/** Bluetooth, USB and Wi-Fi field devices: connect once here, use them on every page. */
export function DevicesPage() {
  const { project: p } = useStore();
  useDevices();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 2000); return () => clearInterval(t); }, []);
  const plat = platform();
  return (
    <div className="stack">
      <p className="note">Connect a device once and every page uses it until you disconnect or close the app. Pair Bluetooth devices from here (not in phone or Windows settings) unless the device's manual says to pair it as a COM port.
        {plat === 'windows' && ' In the Windows app, Wi-Fi devices and keyboard-style scanners work directly; for Bluetooth and USB meters open LvPlan Pro in Chrome or Edge (the flash drive copy works offline).'}
        {plat === 'android' && ' In the Android app, the phone’s own cell and Wi-Fi signal and Wi-Fi devices work directly; Bluetooth devices that act as a keyboard work in any box. For other Bluetooth devices open LvPlan Pro in Chrome.'}</p>
      <div className="grid2">{(['meter', 'gps', 'distance', 'scanner'] as Role[]).map((r) => <RoleCard key={r} role={r} />)}</div>
      <Card title="Other Bluetooth and Wi-Fi equipment" tip="These connect through the phone or computer itself, so they work in every version of the app.">
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Equipment</th><th>How to use it with LvPlan Pro</th></tr></thead><tbody>
          <tr><td>🖨 Printers and label printers (Bluetooth or Wi-Fi)</td><td>Add the printer in the phone or Windows settings once. Then every 🖨 Print button (reports, drawings, asset labels) lists it.</td></tr>
          <tr><td>⌨ Handheld barcode scanners, lasers or meters in keyboard mode</td><td>Pair in the phone or Windows Bluetooth settings. Tap a box in the app and scan or measure: the value types in. On Equipment & Asset Tags, tap the tag box first.</td></tr>
          <tr><td>📷 Wi-Fi and Bluetooth cameras, thermal cameras, inspection scopes</td><td>Save the photos to the phone or computer with the camera's app, then use 📷 Add photos on Field Notes, assets or the site survey.</td></tr>
          <tr><td>🧪 Cable certifiers, fiber OTDR / power meters, PIM and sweep testers</td><td>Export the results (PDF, CSV) from the tester's app or software (for example LinkWare), then attach them on Final Testing or Projects & Storage → documents.</td></tr>
          <tr><td>📻 Two-way radios (programming)</td><td>Use the manufacturer's programming software; keep the codeplug and manual on the Specifications Library item.</td></tr>
          <tr><td>🌐 Wi-Fi network surveys</td><td>Import the scan file from a Wi-Fi survey app on Wi-Fi & Network Survey; for one reading, use 📱 Phone Wi-Fi signal above (Android app).</td></tr>
        </tbody></table></div>
        <p className="small muted">Measuring in {p.settings.units === 'km' ? 'meters' : 'feet'}. Devices are not saved in the project; connect them again after the app restarts.</p>
      </Card>
    </div>
  );
}
