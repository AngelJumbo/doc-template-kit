import type { InputDefV1 } from '../core/types'

export function TemplateInputForm({
  inputs,
  values,
  onChange,
  readOnly,
}: {
  inputs: InputDefV1[]
  values: Record<string, unknown>
  onChange?: (next: Record<string, unknown>) => void
  readOnly?: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {inputs.map((def) => {
        const value = values[def.key]
        const id = `input_${def.key}`

        const setValue = (v: unknown) => {
          if (readOnly) return
          if (!onChange) return
          onChange({ ...values, [def.key]: v })
        }

        return (
          <label key={def.key} htmlFor={id} style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{def.label}</div>
            {def.type === 'boolean' ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => setValue(e.target.checked)}
                disabled={readOnly}
              />
            ) : def.type === 'number' ? (
              <input
                id={id}
                type="number"
                value={typeof value === 'number' ? value : value == null ? '' : String(value)}
                onChange={(e) => setValue(e.target.value === '' ? undefined : Number(e.target.value))}
                readOnly={readOnly}
              />
            ) : def.type === 'date' ? (
              <input
                id={id}
                type="date"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => setValue(e.target.value)}
                readOnly={readOnly}
              />
            ) : (
              <input
                id={id}
                type="text"
                value={typeof value === 'string' ? value : value == null ? '' : String(value)}
                onChange={(e) => setValue(e.target.value)}
                readOnly={readOnly}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}
