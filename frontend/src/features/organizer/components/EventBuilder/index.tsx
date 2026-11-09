'use client'

import React, { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Save,
  Ticket,
  X,
} from 'lucide-react'
import type { Event } from '@/payload-types'
import { mediaOf } from '@/lib/format'
import {
  TIER_COLORS,
  type TicketTier,
} from '@/lib/ticket-tiers'
import {
  createSeatLayout,
  getSeatLayoutIssues,
  readSeatLayout,
  type LayoutRect,
  type LayoutTarget,
  type LayoutTemplate,
  type SeatLayout,
} from '@/lib/seat-layout'
import { Step1Info, type EventInfoState } from './Step1Info'
import { Step2Tiers, type EditableTier } from './Step2Tiers'
import { Step3SeatLayout } from './Step3SeatLayout'
import { Step4Review } from './Step4Review'

interface EventBuilderProps {
  event?: Event
  onClose: () => void
  onSaved: (message: string) => void
}

const steps = [
  { label: 'Thông tin', title: 'Kể câu chuyện sự kiện của bạn', icon: FileText },
  { label: 'Hạng vé', title: 'Thiết kế lựa chọn cho khách tham dự', icon: Ticket },
  { label: 'Seat map', title: 'Đặt mọi trải nghiệm vào đúng vị trí', icon: LayoutDashboard },
  { label: 'Xác nhận', title: 'Sẵn sàng cho một khởi đầu mới', icon: CheckCircle2 },
]

const vnInput = (value?: string | null) => {
  if (!value) return ''
  try {
    const t = new Date(value).getTime()
    return Number.isFinite(t) ? new Date(t + 7 * 3600000).toISOString().slice(0, 16) : ''
  } catch {
    return ''
  }
}
const vnTime = (value: string) => {
  try {
    return new Date(`${value}${value.length === 16 ? ':00' : ''}+07:00`).getTime()
  } catch {
    return NaN
  }
}
const vnISO = (value: string) => {
  try {
    const t = vnTime(value)
    return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function newTiers(event?: Event): EditableTier[] {
  return (
    event?.tiers ?? [
      { name: 'Hạng vé 1', code: 'A', price: 0, rows: 5, seatsPerRow: 10 },
    ]
  ).map((tier) => ({ ...tier, localKey: tier.id ?? crypto.randomUUID() }))
}

export function EventBuilder({ event, onClose, onSaved }: EventBuilderProps) {
  const [step, setStep] = useState(0)
  const [tiers, setTiers] = useState<EditableTier[]>(() => newTiers(event))
  const [layout, setLayout] = useState<SeatLayout>(
    () =>
      readSeatLayout(event?.seatLayout, event?.tiers ?? newTiers()) ??
      createSeatLayout(event?.tiers ?? newTiers()),
  )
  const [target, setTarget] = useState<LayoutTarget>({ kind: 'stage' })
  const [template, setTemplate] = useState<LayoutTemplate | 'custom'>(
    readSeatLayout(event?.seatLayout, event?.tiers ?? []) ? 'custom' : 'auditorium',
  )
  const [info, setInfo] = useState<EventInfoState>({
    title: event?.title ?? '',
    category: event?.category ?? 'Âm nhạc',
    city: event?.city ?? 'TP. Hồ Chí Minh',
    venue: event?.venue ?? '',
    date: vnInput(event?.date),
    onSaleAt: vnInput(event?.onSaleAt),
    description: event?.description ?? '',
    waitingRoom: event?.waitingRoom ?? false,
  })
  const [imageId, setImageId] = useState<string | null>(() => {
    if (!event?.image) return null
    if (typeof event.image === 'object') {
      if ('id' in event.image && event.image.id) return String(event.image.id)
      if ('url' in event.image && (event.image as any).url) return (event.image as any).url
    }
    return typeof event.image === 'string' ? event.image : null
  })
  const [coverURL, setCoverURL] = useState(() => {
    const m = mediaOf(event?.image)
    if (m?.url) return m.url
    if (typeof event?.image === 'object' && (event.image as any)?.url) return (event.image as any).url
    return ''
  })
  const [file, setFile] = useState<File | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const layoutErrors = getSeatLayoutIssues(layout, tiers)
  const capacity = tiers.reduce(
    (sum, tier) =>
      sum + (Number.isFinite(tier.rows * tier.seatsPerRow) ? tier.rows * tier.seatsPerRow : 0),
    0,
  )

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  function updateInfo<K extends keyof EventInfoState>(key: K, value: EventInfoState[K]) {
    setInfo((current) => ({ ...current, [key]: value }))
    setDirty(true)
  }

  function updateTier(index: number, patch: Partial<TicketTier>) {
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)))
    if (patch.code !== undefined) {
      setLayout((current) => ({
        ...current,
        zones: current.zones.map((zone, i) =>
          i === index ? { ...zone, tierCode: patch.code! } : zone,
        ),
      }))
    }
    setDirty(true)
  }

  function transform(item: LayoutTarget, rect: LayoutRect) {
    setLayout((current) =>
      item.kind === 'stage'
        ? { ...current, stage: { ...current.stage, ...rect } }
        : {
            ...current,
            zones: current.zones.map((zone, index) =>
              index === item.index ? { ...zone, ...rect } : zone,
            ),
          },
    )
    setTemplate('custom')
    setDirty(true)
  }

  function updateStage(patch: Partial<LayoutRect & { label: string }>) {
    setLayout((current) => ({
      ...current,
      stage: { ...current.stage, ...patch },
    }))
    setDirty(true)
  }

  function updateZone(index: number, patch: Partial<LayoutRect & { aisle?: boolean }>) {
    setLayout((current) => ({
      ...current,
      zones: current.zones.map((zone, i) => (i === index ? { ...zone, ...patch } : zone)),
    }))
    setDirty(true)
  }

  function addTier() {
    if (tiers.length >= 4) return
    const code = ['A', 'B', 'C', 'D', 'V'].find(
      (c) => !tiers.some((tier) => tier.code === c),
    ) ?? 'E'
    const tier: EditableTier = {
      localKey: crypto.randomUUID(),
      name: `Hạng vé ${tiers.length + 1}`,
      code,
      price: 350000,
      rows: 3,
      seatsPerRow: 8,
    }
    const color =
      TIER_COLORS.find((c) => !layout.zones.some((zone) => zone.color === c)) ??
      TIER_COLORS[tiers.length % TIER_COLORS.length]
    const next = createSeatLayout([...tiers, tier], template === 'custom' ? 'auditorium' : template)
    setTiers([...tiers, tier])
    setLayout((current) => ({
      ...current,
      zones: [...current.zones, { ...next.zones[tiers.length], color }],
    }))
    setTarget({ kind: 'zone', index: tiers.length })
    setDirty(true)
  }

  function removeTier(index: number) {
    if (tiers.length === 1) return
    setTiers(tiers.filter((_, i) => i !== index))
    setLayout((current) => ({ ...current, zones: current.zones.filter((_, i) => i !== index) }))
    setTarget({ kind: 'stage' })
    setDirty(true)
  }

  function applyTemplate(value: LayoutTemplate) {
    const next = createSeatLayout(tiers, value)
    next.stage.label = layout.stage.label
    next.zones = next.zones.map((zone, index) => ({
      ...zone,
      color: layout.zones[index]?.color ?? zone.color,
      aisle: layout.zones[index]?.aisle ?? true,
    }))
    setLayout(next)
    setTemplate(value)
    setDirty(true)
    setErrors([])
  }

  function validate(index: number) {
    const result: string[] = []
    if (index === 0) {
      if (info.title.trim().length < 3 || info.title.length > 200)
        result.push('Tên sự kiện cần từ 3 đến 200 ký tự.')
      if (info.venue.trim().length < 2) result.push('Địa điểm cần tối thiểu 2 ký tự.')
      if (info.description.trim().length < 10) result.push('Mô tả cần tối thiểu 10 ký tự.')
      const date = vnTime(info.date)
      if (!info.date || !Number.isFinite(date) || (!event && date <= Date.now()))
        result.push('Ngày diễn ra phải ở tương lai.')
      if (
        info.onSaleAt &&
        (!Number.isFinite(vnTime(info.onSaleAt)) || vnTime(info.onSaleAt) >= date)
      )
        result.push('Thời điểm mở bán phải trước ngày diễn ra.')
    }
    if (index === 1) {
      if (new Set(tiers.map((tier) => tier.code)).size !== tiers.length)
        result.push('Mã khu phải khác nhau.')
      for (const tier of tiers) {
        if (tier.name.trim().length < 2 || tier.name.length > 80)
          result.push(`Tên hạng ${tier.code || 'vé'} cần từ 2 đến 80 ký tự.`)
        if (!/^[A-Z0-9-]{1,6}$/i.test(tier.code)) result.push('Mã khu dùng 1–6 ký tự chữ hoặc số.')
        if (!Number.isSafeInteger(tier.price) || tier.price < 0 || tier.price > 100000000)
          result.push(`Giá hạng ${tier.name} phải là số nguyên từ 0 đến 100.000.000đ.`)
        if (
          !Number.isInteger(tier.rows) ||
          tier.rows < 1 ||
          tier.rows > 20 ||
          !Number.isInteger(tier.seatsPerRow) ||
          tier.seatsPerRow < 1 ||
          tier.seatsPerRow > 20
        )
          result.push(`Khu ${tier.code}: 1–20 hàng và 1–20 ghế mỗi hàng.`)
      }
    }
    if (index === 2) result.push(...layoutErrors)
    return result
  }

  function go(next: number) {
    if (next > step) {
      for (let i = 0; i < next; i++) {
        const invalid = validate(i)
        if (invalid.length) {
          setStep(i)
          setErrors(invalid)
          return
        }
      }
    }
    setStep(next)
    setErrors([])
  }

  async function save() {
    for (let i = 0; i < 3; i++) {
      const invalid = validate(i)
      if (invalid.length) {
        setStep(i)
        setErrors(invalid)
        return
      }
    }
    setBusy(true)
    setErrors([])
    try {
      let image = imageId
      if (file) {
        try {
          const form = new FormData()
          form.set('file', file)
          const upload = await fetch('/api/ticketnow/upload', { method: 'POST', body: form })
          const result = await upload.json().catch(() => ({}))
          if (upload.ok && result.id) {
            image = result.id
            setImageId(image)
          }
        } catch {
          // If upload fails, proceed with current imageId
        }
      }
      const response = await fetch('/api/ticketnow/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: event ? 'update' : 'create',
          id: event?.id,
          ...info,
          date: vnISO(info.date),
          onSaleAt: info.onSaleAt ? vnISO(info.onSaleAt) : undefined,
          image,
          tiers: tiers.map(({ localKey, ...tier }) => tier),
          seatLayout: layout,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setErrors(
          Array.isArray(result.errors) ? result.errors : [result.error ?? 'Không thể lưu sự kiện. Vui lòng kiểm tra lại.'],
        )
        return
      }
      onSaved(
        event
          ? 'Đã cập nhật sự kiện và đồng bộ hệ thống thành công.'
          : 'Đã tạo sự kiện và mặt bằng ghế thành công.',
      )
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Không thể kết nối. Vui lòng thử lại.'])
    } finally {
      setBusy(false)
    }
  }

  function requestClose() {
    if (busy) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  async function handleCoverChange(value: File | undefined) {
    if (!value) return
    if (
      value.size > 10 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(value.type)
    ) {
      setErrors(['Ảnh cần là JPG, PNG, WebP hoặc GIF nhỏ hơn 10MB.'])
      return
    }

    const localPreview = URL.createObjectURL(value)
    setCoverURL(localPreview)
    setFile(value)
    setDirty(true)
    setErrors([])

    setUploadingImage(true)
    try {
      const form = new FormData()
      form.set('file', value)
      const upload = await fetch('/api/ticketnow/upload', { method: 'POST', body: form })
      const result = await upload.json().catch(() => ({}))
      if (!upload.ok) throw new Error(result.error || 'Tải ảnh thất bại.')
      setImageId(result.id)
      if (result.url) {
        setCoverURL(result.url)
      }
      setFile(null)
    } catch (err) {
      console.warn('Cover upload error:', err)
      setErrors([err instanceof Error ? err.message : 'Tải ảnh thất bại. Vui lòng thử lại.'])
    } finally {
      setUploadingImage(false)
    }
  }

  function handleCoverUrlChange(url: string) {
    if (!url || !url.startsWith('http')) {
      setErrors(['Vui lòng nhập link ảnh hợp lệ bắt đầu bằng http:// hoặc https://'])
      return
    }
    setImageId(url)
    setCoverURL(url)
    setFile(null)
    setDirty(true)
    setErrors([])
  }

  function handleRemoveCover() {
    setImageId(null)
    setCoverURL('')
    setFile(null)
    setDirty(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 p-2 backdrop-blur-sm sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Tạo sự kiện"
        className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-[#f8faf7] shadow-2xl"
      >
        <header className="shrink-0 border-b border-line bg-white px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold tracking-[2px] text-emerald-700">
                TICKETNOW · EVENT STUDIO
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight">
                {event ? 'Hoàn thiện sự kiện của bạn.' : 'Từ ý tưởng đến một không gian đáng nhớ.'}
              </h2>
              <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
                <LockKeyhole size={12} />
                Bản nháp riêng tư · Chưa hiển thị cho khách hàng
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              aria-label="Đóng tạo sự kiện"
              className="rounded-full p-2 hover:bg-stone-100"
            >
              <X size={20} />
            </button>
          </div>

          {/* Stepper Tabs */}
          <ol className="mt-5 grid grid-cols-4 gap-2">
            {steps.map((item, index) => (
              <li key={item.label}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => go(index)}
                  aria-current={step === index ? 'step' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-[10px] font-semibold sm:px-3 ${
                    step === index
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : step > index
                        ? 'border-line text-emerald-700'
                        : 'border-transparent text-muted'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      step === index ? 'bg-emerald-800 text-white' : 'bg-stone-100'
                    }`}
                  >
                    {step > index ? <Check size={12} /> : index + 1}
                  </span>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-muted">Bước {step + 1} / 4</p>
              <h3 className="mt-2 text-lg font-bold">{steps[step].title}</h3>
            </div>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-2 text-[10px] font-semibold text-emerald-800">
              {tiers.length} hạng vé · {capacity} ghế
            </span>
          </div>

          {errors.length > 0 && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-7 text-red-700"
            >
              <p className="font-semibold">Vui lòng kiểm tra thông tin:</p>
              <ul className="list-inside list-disc">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {step === 0 && (
            <Step1Info
              info={info}
              onChange={updateInfo}
              coverURL={coverURL}
              isUploading={uploadingImage}
              onCoverChange={handleCoverChange}
              onCoverUrlChange={handleCoverUrlChange}
              onRemoveCover={handleRemoveCover}
            />
          )}

          {step === 1 && (
            <Step2Tiers
              tiers={tiers}
              onUpdateTier={updateTier}
              onAddTier={addTier}
              onRemoveTier={removeTier}
            />
          )}

          {step === 2 && (
            <Step3SeatLayout
              layout={layout}
              tiers={tiers}
              template={template}
              onSelectTemplate={applyTemplate}
              target={target}
              onSelectTarget={setTarget}
              onTransform={transform}
              onUpdateStage={updateStage}
              onUpdateZone={updateZone}
            />
          )}

          {step === 3 && (
            <Step4Review
              info={info}
              tiers={tiers}
              layout={layout}
            />
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => (step ? go(step - 1) : requestClose())}
            disabled={busy}
            className="btn-secondary"
          >
            <ArrowLeft size={15} />
            {step ? 'Quay lại' : 'Hủy'}
          </button>
          <p className="hidden text-[10px] text-muted sm:block">
            Thông tin và sơ đồ được lưu cùng sự kiện.
          </p>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => go(step + 1)}
              disabled={busy}
              className="btn-primary"
            >
              Tiếp theo
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={save} disabled={busy} className="btn-primary">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
              {busy ? 'Đang lưu...' : event ? 'Lưu thay đổi bản nháp' : 'Lưu bản nháp'}
            </button>
          )}
        </footer>
      </section>

      {confirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-5">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label="Thoát trình tạo sự kiện"
            className="w-full max-w-sm rounded-2xl bg-white p-6"
          >
            <h3 className="text-lg font-bold">Rời khỏi bản thiết kế?</h3>
            <p className="mt-3 text-xs leading-7 text-muted">
              Các thay đổi chưa lưu sẽ mất. Sự kiện đã lưu trước đó không bị ảnh hưởng.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="btn-secondary flex-1"
              >
                Tiếp tục sửa
              </button>
              <button type="button" onClick={onClose} className="btn-primary flex-1">
                Rời khỏi
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
