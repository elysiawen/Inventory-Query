import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { uploadItemImport } from '../services/request'
import type { ImportOptions, ImportReport } from '../services/types'
import { errorMessage } from '../utils/format'
import './ItemImportModal.scss'

const MAX_SIZE = 5 * 1024 * 1024
const DEFAULT_OPTIONS: ImportOptions = { duplicates: 'skip', compound: 'first', invalid: 'abort' }

type Action = 'create' | 'update' | 'skip'

interface PlannedVariant {
  title: string
  quantity: number | null
}

interface PlannedItem {
  row: number
  category: string
  name: string
  model: string
  price: number
  action: Action
  skipReason?: string
  variants: PlannedVariant[]
}

interface Props {
  visible: boolean
  onClose: () => void
  onImported: () => void
}

type SingleChoice<T extends string> = { value: T; label: string }

const toast = (title: string) => Taro.showToast({ title, icon: 'none' })

export default function ItemImportModal({ visible, onClose, onImported }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS)
  const [splitQty, setSplitQty] = useState<Record<number, string[]>>({})

  // 每次打开都重置，避免上次的文件和选项残留
  useEffect(() => {
    if (!visible) return
    setStep(1)
    setFilePath('')
    setFileName('')
    setReport(null)
    setParsing(false)
    setImporting(false)
    setOptions(DEFAULT_OPTIONS)
    setSplitQty({})
  }, [visible])

  async function chooseFile() {
    if (parsing || importing) return
    try {
      const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['xlsx'] })
      const file = res.tempFiles?.[0]
      if (!file) return
      if (file.size > MAX_SIZE) {
        toast('文件不能超过 5MB')
        return
      }
      if (!/\.xlsx$/i.test(file.name || file.path)) {
        toast('请选择 .xlsx 格式的表格')
        return
      }
      setParsing(true)
      const data = await uploadItemImport(file.path, { dryRun: '1' })
      if (!data.report) throw new Error('解析失败')
      setFilePath(file.path)
      setFileName(file.name || '导入表格.xlsx')
      setReport(data.report)
      setStep(1)
      setOptions(DEFAULT_OPTIONS)
      const init: Record<number, string[]> = {}
      for (const c of data.report.compounds) {
        init[c.row] =
          c.quantities.length === c.heights.length
            ? c.quantities.map(String)
            : c.heights.map(() => '')
      }
      setSplitQty(init)
    } catch (e) {
      // 取消选择文件不是错误，不弹提示
      const message = errorMessage(e)
      if (!message.includes('cancel')) toast(message)
    } finally {
      setParsing(false)
    }
  }

  // 拆分时，只要求真正会写入的行填好数量；重复项选择跳过时整行不写入
  const skippedDuplicateRows = useMemo(
    () =>
      new Set(
        options.duplicates === 'skip' ? (report?.duplicates ?? []).map((d) => d.row) : []
      ),
    [options.duplicates, report]
  )

  const splitReady =
    !report ||
    options.compound !== 'split' ||
    report.compounds
      .filter((c) => !skippedDuplicateRows.has(c.row))
      .every((c) => {
        const values = splitQty[c.row] ?? []
        return (
          values.length === c.heights.length &&
          values.every((v) => /^\d+$/.test(v.trim()) && Number(v) <= 1000000000)
        )
      })

  const planned = useMemo<PlannedItem[]>(() => {
    if (!report) return []
    const duplicateRows = new Set(report.duplicates.map((d) => d.row))
    return (report.rows ?? []).map((r) => {
      const base = {
        row: r.row,
        category: r.category,
        name: r.name,
        model: r.model,
        price: r.price
      }
      if (r.compound && options.compound === 'skip') {
        return { ...base, action: 'skip', skipReason: '复合规格，选择跳过', variants: [] }
      }
      const isDuplicate = duplicateRows.has(r.row)
      if (isDuplicate && options.duplicates === 'skip') {
        return { ...base, action: 'skip', skipReason: '重复项，选择跳过', variants: [] }
      }
      const split = r.compound && options.compound === 'split'
      const heights = split ? r.heights : [r.heights[0]]
      const filled = splitQty[r.row] ?? []
      const variants: PlannedVariant[] = heights.map((height, index) => {
        let quantity: number | null = null
        if (!split) {
          quantity = r.quantities[0] ?? null
        } else if (filled.length === heights.length && /^\d+$/.test((filled[index] ?? '').trim())) {
          quantity = Number(filled[index])
        } else if (r.quantities.length === heights.length) {
          quantity = r.quantities[index]
        }
        return {
          title: r.compound
            ? `${r.labels[index] ?? `第 ${index + 1} 组`}（高 ${height}）`
            : `${r.innerDiameter}×${r.outerDiameter}×${height}`,
          quantity
        }
      })
      return { ...base, action: isDuplicate ? 'update' : 'create', variants }
    })
  }, [report, options.compound, options.duplicates, splitQty])

  const totals = useMemo(() => {
    let create = 0
    let update = 0
    let skip = 0
    for (const item of planned) {
      if (item.action === 'skip') skip += 1
      else if (item.action === 'create') create += item.variants.length
      else update += item.variants.length
    }
    return { create, update, skip }
  }, [planned])

  function updateSplit(row: number, index: number, value: string) {
    setSplitQty((prev) => {
      const current = prev[row] ?? []
      const next = [...current]
      next[index] = value
      return { ...prev, [row]: next }
    })
  }

  async function submit() {
    if (!filePath || importing) return
    if (!splitReady) {
      toast('请为每个变体填写库存数量')
      return
    }
    const payload: ImportOptions & { quantities?: Record<string, number[]> } = { ...options }
    if (options.compound === 'split') {
      const quantities: Record<string, number[]> = {}
      for (const [row, values] of Object.entries(splitQty)) {
        if (values.some((v) => v.trim() === '')) continue
        quantities[row] = values.map(Number)
      }
      payload.quantities = quantities
    }
    setImporting(true)
    try {
      const data = await uploadItemImport(filePath, {
        dryRun: '0',
        options: JSON.stringify(payload)
      })
      toast(`导入完成：新增 ${data.created ?? 0}，更新 ${data.updated ?? 0}，跳过 ${data.skipped ?? 0}`)
      onImported()
      onClose()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  function renderOptions<T extends string>(
    current: T,
    choices: SingleChoice<T>[],
    onChange: (value: T) => void
  ) {
    return (
      <View className="import-options">
        {choices.map((choice) => (
          <View
            key={choice.value}
            className={`chip import-options__chip${current === choice.value ? ' chip--active' : ''}`}
            onClick={() => onChange(choice.value)}
          >
            <Text>{choice.label}</Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <Modal
      visible={visible}
      title={step === 1 ? '从 Excel 导入物品' : '核对导入明细'}
      onClose={() => {
        if (!importing) onClose()
      }}
      footer={
        step === 1 ? (
          <>
            <View
              className={`btn btn--block modal-btn${importing ? ' btn--disabled' : ''}`}
              onClick={() => {
                if (!importing) onClose()
              }}
            >
              <Text>取消</Text>
            </View>
            <View
              className={`btn btn--primary btn--block modal-btn${
                parsing || !report ? ' btn--disabled' : ''
              }`}
              onClick={() => {
                if (parsing || !report) return
                setStep(2)
              }}
            >
              <Text className="modal-btn__primary-text">{parsing ? '解析中…' : '下一步'}</Text>
            </View>
          </>
        ) : (
          <>
            <View
              className={`btn btn--block modal-btn${importing ? ' btn--disabled' : ''}`}
              onClick={() => {
                if (!importing) setStep(1)
              }}
            >
              <Text>上一步</Text>
            </View>
            <View
              className={`btn btn--primary btn--block modal-btn${
                importing || !splitReady ? ' btn--disabled' : ''
              }`}
              onClick={() => void submit()}
            >
              <Text className="modal-btn__primary-text">{importing ? '导入中…' : '确认导入'}</Text>
            </View>
          </>
        )
      }
    >
      <View className="import-steps">
        <View className={`import-steps__item${step === 1 ? ' import-steps__item--active' : ''}`}>
          <Text className="import-steps__num">1</Text>
          <Text className="import-steps__text">选择表格与策略</Text>
        </View>
        <View className="import-steps__line" />
        <View className={`import-steps__item${step === 2 ? ' import-steps__item--active' : ''}`}>
          <Text className="import-steps__num">2</Text>
          <Text className="import-steps__text">核对明细</Text>
        </View>
      </View>

      {step === 1 && (
        <>
          <View className="import-file">
            <View className="import-file__box" onClick={() => void chooseFile()}>
              <Text className="import-file__icon">＋</Text>
              <Text className="import-file__title">
                {parsing ? '正在解析表格…' : fileName || '选择微信聊天中的 Excel 文件'}
              </Text>
              <Text className="import-file__sub">
                {fileName ? '点击可重新选择' : '仅支持 .xlsx，最大 5MB'}
              </Text>
            </View>
            <Text className="import-file__hint">
              表格需包含列：类目、存货全名、规格（内径/柄径*外径*高度/总长）、型号、最低售价、库存数量、备注。
            </Text>
          </View>

          {report && (
            <>
              <View className="import-stats">
                <View className="import-stats__item">
                  <Text className="import-stats__value">{report.total}</Text>
                  <Text className="import-stats__label">总行数</Text>
                </View>
                <View className="import-stats__item">
                  <Text className="import-stats__value">{report.valid}</Text>
                  <Text className="import-stats__label">可导入</Text>
                </View>
                <View className="import-stats__item">
                  <Text className="import-stats__value">{report.duplicates.length}</Text>
                  <Text className="import-stats__label">重复项</Text>
                </View>
                <View
                  className={`import-stats__item${
                    report.invalid.length > 0 ? ' import-stats__item--danger' : ''
                  }`}
                >
                  <Text className="import-stats__value">{report.invalid.length}</Text>
                  <Text className="import-stats__label">不合法</Text>
                </View>
              </View>

              {report.invalid.length > 0 && (
                <View className="import-section import-section--danger">
                  <Text className="import-section__title">不合法行 · {report.invalid.length} 行</Text>
                  {report.invalid.map((r) => (
                    <Text key={r.row} className="import-section__text">
                      第 {r.row} 行：{r.reason}
                    </Text>
                  ))}
                  {renderOptions<'abort' | 'skip'>(
                    options.invalid,
                    [
                      { value: 'abort', label: '全部回滚' },
                      { value: 'skip', label: '跳过错误行' }
                    ],
                    (invalid) => setOptions((prev) => ({ ...prev, invalid }))
                  )}
                </View>
              )}

              {report.duplicates.length > 0 && (
                <View className="import-section import-section--warning">
                  <Text className="import-section__title">
                    已存在的物品 · {report.duplicates.length} 行
                  </Text>
                  {report.duplicates.slice(0, 20).map((d) => (
                    <Text key={d.row} className="import-section__text">
                      第 {d.row} 行：{d.category} / {d.name} / {d.model}（当前库存 {d.currentQuantity}，
                      单价 ¥{d.currentPrice}）
                    </Text>
                  ))}
                  {report.duplicates.length > 20 && (
                    <Text className="import-section__text">
                      其余 {report.duplicates.length - 20} 行略…
                    </Text>
                  )}
                  {renderOptions<'skip' | 'update' | 'create'>(
                    options.duplicates,
                    [
                      { value: 'skip', label: '跳过' },
                      { value: 'update', label: '更新库存与价格' },
                      { value: 'create', label: '仍然新增' }
                    ],
                    (duplicates) => setOptions((prev) => ({ ...prev, duplicates }))
                  )}
                </View>
              )}

              {report.compounds.length > 0 && (
                <View className="import-section import-section--warning">
                  <Text className="import-section__title">
                    复合规格 · {report.compounds.length} 行
                  </Text>
                  {report.compounds.map((c) => (
                    <Text key={c.row} className="import-section__text">
                      第 {c.row} 行 {c.model}：{c.raw}
                    </Text>
                  ))}
                  {renderOptions<'first' | 'split' | 'skip'>(
                    options.compound,
                    [
                      { value: 'first', label: '取第一组' },
                      { value: 'split', label: '按高度拆分' },
                      { value: 'skip', label: '跳过' }
                    ],
                    (compound) => setOptions((prev) => ({ ...prev, compound }))
                  )}

                  {options.compound === 'split' && (
                    <View className="import-split">
                      <Text className="import-section__text">
                        拆分后每个变体单独设置库存数量（表格数量列写成 20/10 会自动带入）：
                      </Text>
                      {report.compounds.map((c) => (
                        <View key={c.row} className="import-split__item">
                          <Text className="import-split__title">
                            第 {c.row} 行 {c.model}
                          </Text>
                          {c.heights.map((height, index) => (
                            <View key={index} className="import-split__row">
                              <Text className="import-split__label">
                                {c.labels[index] ?? `第 ${index + 1} 组`}（高 {height}）
                              </Text>
                              <Input
                                className="input import-split__input"
                                type="number"
                                value={splitQty[c.row]?.[index] ?? ''}
                                placeholder="数量"
                                onInput={(e) => updateSplit(c.row, index, e.detail.value)}
                              />
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </>
      )}

      {step === 2 && report && (
        <>
          <View className="import-stats">
            <View className="import-stats__item">
              <Text className="import-stats__value">{planned.length}</Text>
              <Text className="import-stats__label">明细行数</Text>
            </View>
            <View className="import-stats__item import-stats__item--ok">
              <Text className="import-stats__value">{totals.create}</Text>
              <Text className="import-stats__label">新增</Text>
            </View>
            <View className="import-stats__item">
              <Text className="import-stats__value">{totals.update}</Text>
              <Text className="import-stats__label">更新</Text>
            </View>
            <View className="import-stats__item">
              <Text className="import-stats__value">{totals.skip}</Text>
              <Text className="import-stats__label">跳过</Text>
            </View>
          </View>

          {report.newCategories.length > 0 && (
            <View className="import-section">
              <Text className="import-section__title">将自动创建类目</Text>
              <Text className="import-section__text">{report.newCategories.join('、')}</Text>
            </View>
          )}

          <View className="import-section">
            <Text className="import-section__title">物品明细</Text>
            {planned.map((item) => (
              <View key={item.row} className="import-row">
                <View className="import-row__head">
                  <Text className="import-row__row">第 {item.row} 行</Text>
                  <Text
                    className={`tag import-row__tag import-row__tag--${item.action}`}
                  >
                    {item.action === 'create' ? '新增' : item.action === 'update' ? '更新' : '跳过'}
                  </Text>
                </View>
                <Text className="import-row__name">{item.name}</Text>
                <Text className="import-row__meta">
                  {item.model} ｜ {item.category} ｜ ¥{item.price}
                </Text>
                {item.action === 'skip' ? (
                  <Text className="import-row__reason">{item.skipReason}</Text>
                ) : (
                  <>
                    <View className="import-row__variants">
                      {item.variants.map((v, index) => (
                        <Text key={index} className="import-row__variant">
                          {v.title}
                        </Text>
                      ))}
                    </View>
                    <Text
                      className={`import-row__qty${
                        item.variants.some((v) => v.quantity === null)
                          ? ' import-row__qty--empty'
                          : ''
                      }`}
                    >
                      {item.variants.some((v) => v.quantity === null)
                        ? '待填写'
                        : item.variants.map((v) => v.quantity).join(' / ')}
                    </Text>
                    {item.action === 'update' && (
                      <Text className="import-row__warn">库存数量将被覆盖</Text>
                    )}
                  </>
                )}
              </View>
            ))}
          </View>
        </>
      )}
    </Modal>
  )
}
