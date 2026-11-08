// Original example diagrams for the Low-Voltage Principles page: circuits, supervision, a riser diagram
// and a small floor-plan sheet in blueprint style. Drawn as SVG so they work offline and print sharply.
import React from 'react';

const T = ({ x, y, s = 11, a = 'start', w = 400, c = 'currentColor', children }: { x: number; y: number; s?: number; a?: 'start' | 'middle' | 'end'; w?: number; c?: string; children: React.ReactNode }) =>
  <text x={x} y={y} fontSize={s} textAnchor={a} fontWeight={w} fill={c}>{children}</text>;

function Ohm() {
  return (
    <svg viewBox="0 0 520 170" role="img" aria-label="Ohm's law: a battery driving current through a resistor">
      <rect x="30" y="40" width="200" height="100" fill="none" stroke="#1565c0" strokeWidth="3" rx="6" />
      <rect x="18" y="72" width="24" height="36" fill="#fff" stroke="#333" /><line x1="22" y1="82" x2="38" y2="82" stroke="#c62828" strokeWidth="3" /><line x1="26" y1="98" x2="34" y2="98" stroke="#333" strokeWidth="3" />
      <T x={10} y={66} s={12} w={700} c="#c62828">+ 24 V</T>
      <path d="M180,40 l6,-8 6,16 6,-16 6,16 6,-16 6,8" fill="none" stroke="#333" strokeWidth="2" transform="translate(-60,0)" />
      <T x={148} y={26} s={12} w={700}>R = 48 Ω</T>
      <path d="M100,140 l12,-6 v12 z" fill="#2e7d32" /><T x={120} y={160} s={12} c="#2e7d32" w={700}>I = 0.5 A</T>
      <g transform="translate(270,30)">
        <path d="M100,0 L200,120 L0,120 Z" fill="#e3f2fd" stroke="#1565c0" strokeWidth="2" /><line x1="38" y1="72" x2="162" y2="72" stroke="#1565c0" strokeWidth="2" /><line x1="100" y1="72" x2="100" y2="120" stroke="#1565c0" strokeWidth="2" />
        <T x={100} y={60} s={22} a="middle" w={800}>V</T><T x={55} y={106} s={22} a="middle" w={800}>I</T><T x={145} y={106} s={22} a="middle" w={800}>R</T>
        <T x={100} y={138} s={11} a="middle">Cover the one you want: V = I×R, I = V÷R, R = V÷I</T>
      </g>
    </svg>
  );
}

function SeriesParallel() {
  const dev = (x: number, y: number, l: string) => <g key={l + x + y}><circle cx={x} cy={y} r="13" fill="#fff8e1" stroke="#ef6c00" strokeWidth="2" /><T x={x} y={y + 4} s={10} a="middle" w={700}>{l}</T></g>;
  return (
    <svg viewBox="0 0 560 170" role="img" aria-label="Series circuit compared with a parallel circuit">
      <T x={20} y={18} s={13} w={700}>Series: one path, same current</T>
      <polyline points="30,60 70,60" stroke="#333" fill="none" strokeWidth="2" /><polyline points="96,60 140,60" stroke="#333" fill="none" strokeWidth="2" /><polyline points="166,60 210,60" stroke="#333" fill="none" strokeWidth="2" /><polyline points="236,60 260,60 260,100 30,100 30,60" stroke="#333" fill="none" strokeWidth="2" />
      {[83, 153, 223].map((x, i) => dev(x, 60, `D${i + 1}`))}
      <T x={30} y={125} s={11}>Voltages add up. One open stops everything.</T>
      <g transform="translate(290,0)">
        <T x={0} y={18} s={13} w={700}>Parallel: each device across the line</T>
        <line x1="10" y1="45" x2="250" y2="45" stroke="#c62828" strokeWidth="2.5" /><line x1="10" y1="115" x2="250" y2="115" stroke="#333" strokeWidth="2.5" />
        {[60, 130, 200].map((x, i) => <g key={x}><line x1={x} y1="45" x2={x} y2="67" stroke="#333" strokeWidth="2" /><line x1={x} y1="93" x2={x} y2="115" stroke="#333" strokeWidth="2" />{dev(x, 80, `D${i + 1}`)}</g>)}
        <rect x="238" y="70" width="22" height="20" fill="#e8f5e9" stroke="#2e7d32" /><T x={249} y={84} s={9} a="middle" w={700}>EOL</T><line x1="249" y1="45" x2="249" y2="70" stroke="#333" /><line x1="249" y1="90" x2="249" y2="115" stroke="#333" />
        <T x={0} y={140} s={11}>Currents add. Speakers, strobes and</T><T x={0} y={154} s={11}>two-wire detectors are wired this way.</T>
      </g>
    </svg>
  );
}

function ClassAB() {
  const panel = (y: number) => <g><rect x="10" y={y} width="70" height="50" rx="4" fill="#e3f2fd" stroke="#1565c0" strokeWidth="2" /><T x={45} y={y + 30} s={11} a="middle" w={700}>Panel</T></g>;
  const dev = (x: number, y: number) => <rect key={x} x={x - 9} y={y - 9} width="18" height="18" fill="#fff" stroke="#c62828" strokeWidth="2" />;
  return (
    <svg viewBox="0 0 560 230" role="img" aria-label="Class B circuit ending at an end-of-line resistor compared with a Class A loop">
      <T x={10} y={16} s={13} w={700}>Class B: out to an end-of-line device</T>
      {panel(30)}
      <polyline points="80,42 520,42" stroke="#c62828" fill="none" strokeWidth="2" /><polyline points="80,68 520,68" stroke="#333" fill="none" strokeWidth="2" />
      {[160, 260, 360, 460].map((x) => <g key={x}><line x1={x} y1="42" x2={x} y2="68" stroke="#999" strokeDasharray="3 3" />{dev(x, 55)}</g>)}
      <rect x="512" y="44" width="16" height="22" fill="#e8f5e9" stroke="#2e7d32" /><T x={520} y={90} s={10} a="middle" w={700} c="#2e7d32">EOL</T>
      <T x={10} y={104} s={11}>A break leaves every device past it without power or signal; the panel reports a trouble.</T>
      <T x={10} y={136} s={13} w={700}>Class A: out and back to the panel</T>
      {panel(150)}
      <polyline points="80,162 500,162 500,188 80,188" stroke="#c62828" fill="none" strokeWidth="2" />
      {[160, 260, 360, 460].map((x) => dev(x, 162))}
      <T x={300} y={180} s={18} a="middle" w={800} c="#c62828">✕</T>
      <T x={10} y={214} s={11}>A single break: devices on both sides are still fed from each end; the panel still reports the trouble.</T>
    </svg>
  );
}

function Riser() {
  const floors = ['Roof', '3rd floor', '2nd floor', '1st floor'];
  const y0 = 30, h = 60;
  return (
    <svg viewBox="0 0 600 300" role="img" aria-label="Example fire alarm riser diagram for a three-story building">
      <T x={300} y={16} s={13} a="middle" w={700}>Example riser diagram (fire alarm, 3 stories)</T>
      {floors.map((f, i) => <g key={f}><line x1="20" y1={y0 + (i + 1) * h} x2="580" y2={y0 + (i + 1) * h} stroke="#999" strokeDasharray="6 4" /><T x={24} y={y0 + i * h + 18} s={11} w={700}>{f}</T></g>)}
      <line x1="200" y1={y0 + h - 10} x2="200" y2={y0 + 4 * h - 25} stroke="#c62828" strokeWidth="3" /><line x1="215" y1={y0 + h - 10} x2="215" y2={y0 + 4 * h - 25} stroke="#ef6c00" strokeWidth="3" />
      <T x={192} y={y0 + h - 14} s={10} a="end" c="#c62828" w={700}>SLC (Class B)</T><T x={223} y={y0 + h - 14} s={10} c="#ef6c00" w={700}>NAC</T>
      {[1, 2, 3].map((i) => { const y = y0 + i * h + 30; return <g key={i}>
        <line x1="200" y1={y} x2="300" y2={y} stroke="#c62828" strokeWidth="2" /><line x1="215" y1={y + 10} x2="420" y2={y + 10} stroke="#ef6c00" strokeWidth="2" />
        <circle cx="260" cy={y} r="9" fill="#fff" stroke="#c62828" strokeWidth="2" /><T x={260} y={y + 4} s={9} a="middle" w={700}>S</T>
        <circle cx="300" cy={y} r="9" fill="#fff" stroke="#c62828" strokeWidth="2" /><T x={300} y={y + 4} s={9} a="middle" w={700}>S</T>
        <rect x="330" y={y - 9} width="18" height="18" fill="#fff" stroke="#c62828" strokeWidth="2" /><T x={339} y={y + 4} s={9} a="middle" w={700}>F</T><line x1="300" y1={y} x2="330" y2={y} stroke="#c62828" strokeWidth="2" />
        <rect x="380" y={y + 1} width="18" height="18" fill="#fff8e1" stroke="#ef6c00" strokeWidth="2" /><T x={389} y={y + 14} s={9} a="middle" w={700}>HS</T>
        <rect x="414" y={y + 4} width="12" height="12" fill="#e8f5e9" stroke="#2e7d32" />
      </g>; })}
      <rect x="160" y={y0 + 3 * h + 34} width="90" height="22" fill="#e3f2fd" stroke="#1565c0" strokeWidth="2" /><T x={205} y={y0 + 3 * h + 49} s={11} a="middle" w={700}>FACU</T>
      <g transform="translate(450,95)"><T x={0} y={0} s={11} w={700}>Legend</T>
        <circle cx="8" cy="16" r="7" fill="#fff" stroke="#c62828" strokeWidth="2" /><T x={22} y={20} s={10}>S smoke detector</T>
        <rect x="1" y="30" width="14" height="14" fill="#fff" stroke="#c62828" strokeWidth="2" /><T x={22} y={42} s={10}>F pull station</T>
        <rect x="1" y="52" width="14" height="14" fill="#fff8e1" stroke="#ef6c00" strokeWidth="2" /><T x={22} y={64} s={10}>HS horn/strobe</T>
        <rect x="3" y="76" width="10" height="10" fill="#e8f5e9" stroke="#2e7d32" /><T x={22} y={86} s={10}>EOL resistor</T></g>
    </svg>
  );
}

function FloorPlan() {
  const W = 620, H = 330;
  const sym = (x: number, y: number, k: 'S' | 'HS' | 'D' | 'C' | 'SP' | 'R', key: string) => {
    const col = { S: '#c62828', HS: '#ef6c00', D: '#1565c0', C: '#6a1b9a', SP: '#2e7d32', R: '#00838f' }[k];
    return <g key={key}>{k === 'S' || k === 'SP' ? <circle cx={x} cy={y} r="8" fill="#fff" stroke={col} strokeWidth="2" /> : <rect x={x - 8} y={y - 8} width="16" height="16" fill="#fff" stroke={col} strokeWidth="2" />}<text x={x} y={y + 3.5} fontSize="7.5" textAnchor="middle" fontWeight="700" fill={col}>{k}</text></g>;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Example floor plan sheet with low-voltage device symbols" style={{ background: '#0d3b66' }}>
      <g stroke="#cfe6ff" fill="none">
        <rect x="20" y="20" width="440" height="270" strokeWidth="3" />
        <line x1="20" y1="150" x2="200" y2="150" strokeWidth="2" /><line x1="260" y1="150" x2="460" y2="150" strokeWidth="2" />
        <line x1="150" y1="20" x2="150" y2="150" strokeWidth="2" /><line x1="300" y1="20" x2="300" y2="150" strokeWidth="2" /><line x1="230" y1="190" x2="230" y2="290" strokeWidth="2" />
        <line x1="200" y1="150" x2="260" y2="150" strokeWidth="1" strokeDasharray="4 3" />
        <rect x="470" y="20" width="135" height="270" strokeWidth="1.5" /><line x1="470" y1="230" x2="605" y2="230" /><line x1="470" y1="255" x2="605" y2="255" />
      </g>
      <g fill="#cfe6ff" fontSize="9">
        <text x="85" y="40" textAnchor="middle">OFFICE 101</text><text x="225" y="40" textAnchor="middle">CONF 102</text><text x="380" y="40" textAnchor="middle">OPEN OFFICE 103</text>
        <text x="125" y="275" textAnchor="middle">LOBBY 104</text><text x="345" y="275" textAnchor="middle">TELECOM / FACP 105</text><text x="230" y="172" textAnchor="middle">CORRIDOR</text>
        <text x="478" y="36" fontWeight="700">LEGEND</text>
        <text x="478" y="244" fontWeight="700">EXAMPLE LV-101</text><text x="478" y="269">FIRST FLOOR LOW-VOLTAGE</text><text x="478" y="282">SCALE: NOT TO SCALE</text>
      </g>
      {[[85, 90], [225, 90], [340, 90], [420, 90], [110, 220], [345, 220], [120, 170], [330, 170]].map(([x, y], i) => sym(x, y, 'S', 's' + i))}
      {[[60, 60], [190, 60], [440, 120], [40, 220], [400, 205]].map(([x, y], i) => sym(x, y, 'HS', 'h' + i))}
      {[[110, 60], [260, 60], [360, 60], [420, 60], [60, 250], [300, 250]].map(([x, y], i) => sym(x, y, 'D', 'd' + i))}
      {[[30, 165], [450, 40]].map(([x, y], i) => sym(x, y, 'C', 'c' + i))}
      {[[180, 220], [85, 120], [380, 120]].map(([x, y], i) => sym(x, y, 'SP', 'p' + i))}
      {[[35, 285 - 15]].map(([x, y], i) => sym(x, y, 'R', 'r' + i))}
      <rect x="395" y="240" width="40" height="26" fill="#fff" stroke="#c62828" strokeWidth="2" /><text x="415" y="257" fontSize="9" textAnchor="middle" fontWeight="700" fill="#c62828">FACP</text>
      {([['S', 'Smoke detector'], ['HS', 'Horn / strobe'], ['D', 'Data outlet (Cat 6)'], ['C', 'Camera'], ['SP', 'Ceiling speaker'], ['R', 'Card reader']] as const).map(([k, l], i) => <g key={k}>{sym(486, 56 + i * 24, k, 'l' + k)}<text x="500" y={60 + i * 24} fontSize="9" fill="#cfe6ff">{l}</text></g>)}
    </svg>
  );
}

export const THEORY_DIAGRAMS: Record<string, { title: string; el: () => React.ReactElement }> = {
  ohm: { title: 'Ohm\'s law: 24 V across 48 Ω drives 0.5 A (12 W)', el: Ohm },
  seriesparallel: { title: 'Series and parallel circuits', el: SeriesParallel },
  classab: { title: 'Class B and Class A circuits', el: ClassAB },
  riser: { title: 'Riser diagram example', el: Riser },
  floorplan: { title: 'Blueprint example: a first-floor low-voltage device plan', el: FloorPlan },
};
