import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { ArrowRight, Bot, Check, CheckCheck, ChevronDown, Columns3, Download, FileSpreadsheet, Info, Loader2, Sparkles, Upload, X } from 'lucide-react'

type Row = Record<string, string>
type Encoding = 'utf-8' | 'windows-1252'

function decodeCsv(buffer: ArrayBuffer): { text: string; encoding: Encoding } {
  const bytes = new Uint8Array(buffer)
  // UTF-8 BOM is handled by TextDecoder; invalid UTF-8 falls back to Windows-1252.
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: text.replace(/^\uFEFF/, ''), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }
  }
}

function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [encoding, setEncoding] = useState<Encoding>('utf-8')
  const [delimiter, setDelimiter] = useState(',')
  const [intent, setIntent] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [aiMessage, setAiMessage] = useState('')

  const resultRows = useMemo(() => rows.map(row => Object.fromEntries(selected.map(h => [h, row[h] ?? '']))), [rows, selected])
  const allSelected = headers.length > 0 && selected.length === headers.length

  async function handleFile(file?: File) {
    if (!file) return
    setNotice(null); setAiMessage('')
    if (file.size === 0) { setNotice({ type: 'error', text: 'El archivo está vacío. Selecciona un CSV que contenga encabezados y registros.' }); return }
    try {
      const decoded = decodeCsv(await file.arrayBuffer())
      const parsed = Papa.parse<Row>(decoded.text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false })
      const fields = parsed.meta.fields ?? []
      const cleanHeaders = fields.map(h => h.trim())
      if (!cleanHeaders.length || cleanHeaders.every(h => !h)) {
        setNotice({ type: 'error', text: 'No se encontraron encabezados válidos. Verifica que el CSV tenga una primera fila con nombres de columnas.' }); return
      }
      const errors = parsed.errors.filter(e => e.type === 'Quotes' || e.type === 'Delimiter' || e.code === 'TooManyFields' || e.code === 'TooFewFields')
      if (errors.length) {
        setNotice({ type: 'error', text: `El CSV parece estar dañado o mal formado: ${errors[0].message}. Revisa las comillas y la estructura del archivo.` }); return
      }
      const normalized = (parsed.data ?? []).map(row => {
        const next: Row = {}
        fields.forEach((field, i) => { next[cleanHeaders[i]] = String(row[field] ?? '') })
        return next
      })
      if (!normalized.length) {
        setNotice({ type: 'error', text: 'El archivo contiene encabezados, pero no tiene registros para procesar.' }); return
      }
      if (new Set(cleanHeaders).size !== cleanHeaders.length) {
        setNotice({ type: 'error', text: 'Hay nombres de columnas repetidos. Renombra los encabezados para evitar ambigüedades.' }); return
      }
      setHeaders(cleanHeaders); setRows(normalized); setSelected(cleanHeaders); setFileName(file.name)
      setEncoding(decoded.encoding); setDelimiter(parsed.meta.delimiter || ',')
      setNotice({ type: 'success', text: `CSV cargado correctamente: ${normalized.length.toLocaleString('es')} registros y ${cleanHeaders.length} columnas.` })
    } catch {
      setNotice({ type: 'error', text: 'No se pudo leer el archivo. Comprueba que sea un CSV válido y vuelve a intentarlo.' })
    }
  }

  function toggleColumn(header: string) {
    setSelected(current => current.includes(header) ? current.filter(h => h !== header) : [...current, header])
  }

  async function suggestWithAI() {
    if (!headers.length) return
    if (!intent.trim()) { setAiMessage('Describe para qué necesitas el CSV final antes de solicitar una sugerencia.'); return }
    setLoading(true); setAiMessage('')
    try {
      const response = await fetch('/api/suggest-columns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, intent: intent.trim() })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo obtener una sugerencia.')
      if (data.clarification) { setAiMessage(data.clarification); return }
      const exact = (data.columns as string[]).filter((h: string) => headers.includes(h))
      if (!exact.length) { setAiMessage('La IA no identificó columnas adecuadas. Prueba describiendo el resultado con más detalle.'); return }
      setSelected(exact)
      setAiMessage(`Se seleccionaron ${exact.length} columnas sugeridas. Puedes modificarlas manualmente.`)
    } catch (e) {
      setAiMessage(e instanceof Error ? e.message : 'Error al conectar con el servicio de IA.')
    } finally { setLoading(false) }
  }

  function exportCsv() {
    if (!selected.length) return
    const csv = Papa.unparse({ fields: selected, data: resultRows.map(row => selected.map(h => row[h] ?? '')) }, { delimiter, quotes: true, newline: '\r\n' })
    const bytes = new TextEncoder().encode((encoding === 'utf-8' ? '\uFEFF' : '') + csv)
    const blob = encoding === 'utf-8' ? new Blob([bytes], { type: 'text/csv;charset=utf-8;' }) : new Blob([new TextEncoder().encode(csv)], { type: 'text/csv;charset=windows-1252;' })
    // Preserve the detected Windows-1252 encoding when possible.
    const finalBlob = encoding === 'windows-1252' ? new Blob([new Uint8Array(Array.from(csv, ch => ch.charCodeAt(0) <= 255 ? ch.charCodeAt(0) : 63))], { type: 'text/csv;charset=windows-1252;' }) : blob
    const url = URL.createObjectURL(finalBlob)
    const a = document.createElement('a'); a.href = url; a.download = `${fileName.replace(/\.csv$/i, '') || 'mapper-etl'}_filtrado.csv`; a.click()
    URL.revokeObjectURL(url)
    setNotice({ type: 'success', text: `Exportación lista: ${rows.length.toLocaleString('es')} registros y ${selected.length} columnas.` })
  }

  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-600 p-2.5 text-white"><Columns3 size={22}/></div><div><h1 className="text-xl font-bold tracking-tight">Mapper <span className="text-indigo-600">ETL</span></h1><p className="text-xs text-slate-500">Transforma tus CSV con precisión e IA</p></div></div>
        <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Procesamiento local seguro</div>
      </div>
    </header>

    <main className="mx-auto max-w-[1600px] space-y-6 px-5 py-7 lg:px-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="mb-1 text-sm font-semibold text-indigo-600">ESPACIO DE TRABAJO</p><h2 className="text-2xl font-bold tracking-tight md:text-3xl">Mapeo de columnas</h2><p className="mt-1 text-sm text-slate-500">Carga un archivo, elige los campos que necesitas y exporta tu resultado.</p></div>
        <button onClick={() => fileRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><Upload size={17}/> Subir CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])}/>
      </section>

      {notice && <div className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}><Info size={18} className="mt-0.5 shrink-0"/><span className="flex-1">{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X size={16}/></button></div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold">Panel de control</h3><p className="mt-1 text-sm text-slate-500">{fileName || 'Todavía no has cargado un archivo CSV.'}</p></div><div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"><span className="tabular-nums">{selected.length} de {headers.length}</span> columnas seleccionadas</div></div>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={!headers.length} onClick={() => setSelected(headers)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><CheckCheck size={16}/> Seleccionar todas</button><button disabled={!headers.length} onClick={() => setSelected([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><X size={16}/> Deseleccionar todas</button><span className="ml-auto self-center text-xs text-slate-400">{rows.length.toLocaleString('es')} registros · {delimiter === ',' ? 'Coma' : delimiter === ';' ? 'Punto y coma' : delimiter === '\t' ? 'Tabulación' : 'Delimitador detectado'}</span></div>
        <div className="mt-4 flex flex-wrap gap-2">{headers.map(h => <label key={h} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${selected.includes(h) ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}><input type="checkbox" checked={selected.includes(h)} onChange={() => toggleColumn(h)} className="h-4 w-4 accent-indigo-600"/>{h}</label>)}</div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><div className="rounded-lg bg-indigo-600 p-2 text-white"><Sparkles size={17}/></div><div><h3 className="font-semibold">Asistente de selección con IA</h3><p className="text-xs text-slate-500">Gemini analiza los encabezados y tu objetivo</p></div></div>
        <label htmlFor="intent" className="mb-2 block text-sm font-medium text-slate-700">¿Para qué necesitas el CSV final?</label>
        <div className="flex flex-col gap-2 md:flex-row"><input id="intent" value={intent} onChange={e => setIntent(e.target.value)} onKeyDown={e => e.key === 'Enter' && suggestWithAI()} placeholder="Ej. Necesito una lista de clientes con nombre, correo y teléfono..." className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"/><button disabled={!headers.length || loading} onClick={suggestWithAI} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <Loader2 size={17} className="animate-spin"/> : <Bot size={17}/>} Sugerir columnas con IA</button></div>
        {aiMessage && <p className="mt-3 rounded-lg border border-indigo-100 bg-white/80 p-3 text-sm text-indigo-900">{aiMessage}</p>}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Preview title="CSV Original" subtitle="Vista completa del archivo cargado" headers={headers} rows={rows} empty="Sube un CSV para visualizar los datos originales."/>
        <Preview title="Resultado" subtitle="Vista previa de las columnas seleccionadas" headers={selected} rows={resultRows} empty="Selecciona columnas para construir el resultado."/>
      </section>

      <section className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row"><div><p className="font-semibold">¿Todo listo para exportar?</p><p className="mt-1 text-sm text-slate-500">Se incluirán todos los registros y únicamente las columnas seleccionadas.</p></div><button disabled={!selected.length || !rows.length} onClick={exportCsv} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"><Download size={17}/> Exportar CSV</button></section>
      <footer className="pb-4 text-center text-xs text-slate-400">Mapper ETL · Los datos del CSV se procesan en tu navegador. Solo los encabezados y tu descripción se envían a Gemini.</footer>
    </main>
  </div>
}

function Preview({ title, subtitle, headers, rows, empty }: { title: string; subtitle: string; headers: string[]; rows: Row[]; empty: string }) {
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h3 className="font-semibold">{title}</h3><p className="text-xs text-slate-500">{subtitle}</p></div><FileSpreadsheet size={19} className="text-slate-400"/></div>
    {headers.length && rows.length ? <div className="max-h-[390px] overflow-auto"><table className="min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100"><tr>{headers.map(h => <th key={h} className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-3 font-semibold text-slate-700">{h}</th>)}</tr></thead><tbody>{rows.slice(0, 250).map((row, i) => <tr key={i} className="odd:bg-white even:bg-slate-50">{headers.map(h => <td key={h} title={row[h]} className="max-w-[240px] whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-600">{row[h] || <span className="text-slate-300">—</span>}</td>)}</tr>)}</tbody></table>{rows.length > 250 && <p className="p-3 text-center text-xs text-slate-400">Vista previa de 250 de {rows.length.toLocaleString('es')} registros. La exportación incluye todos.</p>}</div> : <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-400"><FileSpreadsheet size={28} strokeWidth={1.5}/>{empty}</div>}
  </div>
}
export default App
