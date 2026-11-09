export default function SessionPitchAppearance({ value, onChange, disabled = false }) {
  return <label>Campo para impresión <select aria-label="Apariencia del campo"
    value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="green">Campo verde</option>
    <option value="bw">Campo B/N</option>
  </select></label>;
}
