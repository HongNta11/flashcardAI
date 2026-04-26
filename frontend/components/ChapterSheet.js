import { h } from '/lib/preact.mjs';
import { useState } from '/lib/hooks.mjs';
import htm from '/lib/htm.mjs';

const html = htm.bind(h);

export function ChapterSheet({ sections, selectedSections, onApply, onClose }) {
  const [pendingSections, setPendingSections] = useState(
    selectedSections ? [...selectedSections] : null
  );

  const isEmpty = pendingSections !== null && pendingSections.length === 0;

  function toggle(s) {
    if (pendingSections === null) {
      setPendingSections([s]);
    } else if (pendingSections.includes(s)) {
      setPendingSections(pendingSections.filter((x) => x !== s));
    } else {
      setPendingSections([...pendingSections, s]);
    }
  }

  const applyLabel = pendingSections === null
    ? 'Apply (all)'
    : isEmpty
      ? 'Select at least one chapter'
      : 'Apply (' + pendingSections.length + ' chapter' + (pendingSections.length > 1 ? 's' : '') + ')';

  return html`
    <div
      onClick=${onClose}
      style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:30;display:flex;align-items:flex-end"
    >
      <div
        onClick=${(e) => e.stopPropagation()}
        style="width:100%;background:var(--surface);border-radius:16px 16px 0 0;padding:20px 16px 32px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,0.15)"
      >
        <div style="width:36px;height:4px;background:#dde3f5;border-radius:2px;margin:0 auto 16px"></div>
        <div style="font-weight:600;font-size:1rem;margin-bottom:16px">Select Chapters</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;overflow-y:auto;flex:1;margin-bottom:16px">
          <button
            onClick=${() => setPendingSections(null)}
            style="padding:8px 16px;border-radius:20px;border:none;background:${pendingSections === null ? 'var(--accent)' : '#dde3f5'};color:${pendingSections === null ? '#fff' : 'var(--text-muted)'};cursor:pointer;font-size:0.875rem;font-weight:600"
          >All</button>
          ${sections.map((s) => {
            const on = pendingSections !== null && pendingSections.includes(s);
            return html`
              <button
                key=${s}
                onClick=${() => toggle(s)}
                style="padding:8px 16px;border-radius:20px;border:none;background:${on ? 'var(--accent)' : '#dde3f5'};color:${on ? '#fff' : 'var(--text)'};cursor:pointer;font-size:0.875rem"
              >${s}</button>
            `;
          })}
        </div>
        <button
          onClick=${() => { if (!isEmpty) onApply(pendingSections); }}
          disabled=${isEmpty}
          style="width:100%;padding:14px;background:${isEmpty ? '#dde3f5' : 'var(--accent)'};color:${isEmpty ? 'var(--text-muted)' : '#fff'};border:none;border-radius:var(--radius);font-size:1rem;font-weight:600;cursor:${isEmpty ? 'default' : 'pointer'}"
        >${applyLabel}</button>
      </div>
    </div>
  `;
}
