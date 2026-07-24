/**
 * 本文件组合 shadcn Calendar、Popover 与 Select，提供可复用的日期时间选择能力。
 */
'use client';

import { CalendarDays, X } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Calendar } from '@workspace/ui/components/calendar';
import { Label } from '@workspace/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui/components/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

/** 日期时间选择器属性。 */
type DateTimePickerProps = {
  /** 表单字段稳定标识。 */
  id: string;
  /** 字段中文名称。 */
  label: string;
  /** 当前选择的本地日期时间。 */
  value?: Date;
  /** 未选择时的提示文字。 */
  placeholder?: string;
  /** 是否禁止交互。 */
  disabled?: boolean;
  /** 是否禁止选择今天之前的日期。 */
  disablePast?: boolean;
  /** 日期时间变更回调，传入 undefined 表示清空。 */
  onChange: (value?: Date) => void;
};

/** 小时下拉选项。 */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour.toString().padStart(2, '0'));

/** 五分钟步进的分钟下拉选项。 */
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => (index * 5).toString().padStart(2, '0'));

/** 渲染统一日期、小时和分钟选择器。 */
export function DateTimePicker({
  id,
  label,
  value,
  placeholder = '选择日期和时间',
  disabled = false,
  disablePast = false,
  onChange,
}: DateTimePickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /** 选择日期并保留已有时间，首次选择默认使用下一个整点。 */
  function handleSelectDate(date?: Date): void {
    if (!date) {
      return;
    }

    const nextValue = new Date(date);
    const defaultHour = Math.min(new Date().getHours() + 1, 23);
    nextValue.setHours(value?.getHours() ?? defaultHour, value?.getMinutes() ?? 0, 0, 0);
    onChange(nextValue);
  }

  /** 更新小时并保留日期和分钟。 */
  function handleSelectHour(hour: string): void {
    if (!value) {
      return;
    }

    const nextValue = new Date(value);
    nextValue.setHours(Number(hour));
    onChange(nextValue);
  }

  /** 更新分钟并保留日期和小时。 */
  function handleSelectMinute(minute: string): void {
    if (!value) {
      return;
    }

    const nextValue = new Date(value);
    nextValue.setMinutes(Number(minute), 0, 0);
    onChange(nextValue);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span className={value ? undefined : 'text-muted-foreground'}>
              {value ? formatDateTime(value) : placeholder}
            </span>
            <CalendarDays aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleSelectDate}
            disabled={disablePast ? { before: today } : undefined}
          />
          <div className="grid gap-3 border-t p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-hour`}>小时</Label>
                <Select value={formatNumber(value?.getHours())} onValueChange={handleSelectHour} disabled={!value}>
                  <SelectTrigger id={`${id}-hour`} className="w-full">
                    <SelectValue placeholder="小时" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option} 时
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-minute`}>分钟</Label>
                <Select
                  value={value ? normalizeMinute(value.getMinutes()) : ''}
                  onValueChange={handleSelectMinute}
                  disabled={!value}
                >
                  <SelectTrigger id={`${id}-minute`} className="w-full">
                    <SelectValue placeholder="分钟" />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option} 分
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {value ? (
              <Button type="button" variant="ghost" size="sm" className="justify-self-end" onClick={() => onChange()}>
                <X aria-hidden />
                清除时间
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** 把可选数字格式化为两位下拉值。 */
function formatNumber(value?: number): string {
  return value === undefined ? '' : value.toString().padStart(2, '0');
}

/** 把分钟向下对齐到五分钟步进。 */
function normalizeMinute(minute: number): string {
  return (Math.floor(minute / 5) * 5).toString().padStart(2, '0');
}

/** 格式化选择结果。 */
function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
