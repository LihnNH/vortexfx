export function PillToggle({ checked, onChange }) {
  return <button type="button" className={`pill-toggle${checked ? ' is-on' : ''}`}
    role="switch" aria-checked={checked} aria-label="Dark mode" onClick={onChange}>
    <span className="pill-toggle__knob" aria-hidden="true" />
  </button>;
}
