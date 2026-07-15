/**
 * 本文件组合 shadcn Calendar、Popover 和 Select，提供直接授权失效时间选择能力。
 */
'use client';

import { CalendarDays, X } from 'lucide-react';

import type { AccessSelectOption } from './access-select-field';
import { Button } from '@workspace/ui/components/button';
import { Calendar } from '@workspace/ui/components/calendar';
import { Label } from '@workspace/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui/components/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

/** 授权失效时间字段属性。 */
type ExpirationDateTimeFieldProps = {
  /** 当前选择的本地日期时间。 */
  value?: Date;
  /** 日期时间变更回调；传入 undefined 表示永不过期。 */
  onChange: (value?: Date) => void;
};

/** 日期时间选择器使用的小时选项。 */
const HOUR_OPTIONS: AccessSelectOption[] = Array.from({ length: 24 }, (_, hour) => {
  const value = hour.toString().padStart(2, '0');
  return { value, label: `${value} 时` };
});

/** 日期时间选择器使用的五分钟步进选项。 */
const MINUTE_OPTIONS: AccessSelectOption[] = Array.from({ length: 12 }, (_, index) => {
  const value = (index * 5).toString().padStart(2, '0');
  return { value, label: `${value} 分` };
});

/** 渲染直接授权的可选失效日期和时间字段。 */
export function ExpirationDateTimeField({ value, onChange }: ExpirationDateTimeFieldProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /** 选择日期并保留已有时间；首次选择默认当天 23:55。 */
  function handleSelectDate(date?: Date) {
    if (!date) {
      return;
    }

    const nextValue = new Date(date);
    nextValue.setHours(value?.getHours() ?? 23, value?.getMinutes() ?? 55, 0, 0);
    onChange(nextValue);
  }

  /** 更新小时并保留日期和分钟。 */
  function handleSelectHour(hour: string) {
    if (!value) {
      return;
    }

    const nextValue = new Date(value);
    nextValue.setHours(Number(hour));
    onChange(nextValue);
  }

  /** 更新分钟并保留日期和小时。 */
  function handleSelectMinute(minute: string) {
    if (!value) {
      return;
    }

    const nextValue = new Date(value);
    nextValue.setMinutes(Number(minute), 0, 0);
    onChange(nextValue);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="direct-expires-at">失效时间（可选）</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button id="direct-expires-at" type="button" variant="outline" className="w-full justify-between font-normal">
            <span className={value ? undefined : 'text-muted-foreground'}>
              {value ? formatExpirationDateTime(value) : '永不过期'}
            </span>
            <CalendarDays aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={handleSelectDate} disabled={{ before: today }} />
          <div className="grid gap-3 border-t p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="direct-expires-hour">小时</Label>
                <Select
                  value={value?.getHours().toString().padStart(2, '0') ?? ''}
                  onValueChange={handleSelectHour}
                  disabled={!value}
                >
                  <SelectTrigger id="direct-expires-hour" className="w-full">
                    <SelectValue placeholder="小时" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="direct-expires-minute">分钟</Label>
                <Select
                  value={value ? normalizeMinute(value.getMinutes()) : ''}
                  onValueChange={handleSelectMinute}
                  disabled={!value}
                >
                  <SelectTrigger id="direct-expires-minute" className="w-full">
                    <SelectValue placeholder="分钟" />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {value ? (
              <Button type="button" variant="ghost" size="sm" className="justify-self-end" onClick={() => onChange()}>
                <X aria-hidden />
                清除失效时间
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">不选择表示授权永久有效，时间按当前设备时区提交。</p>
    </div>
  );
}

/** 将分钟向下对齐到日期时间选择器使用的五分钟步进。 */
function normalizeMinute(minute: number): string {
  return (Math.floor(minute / 5) * 5).toString().padStart(2, '0');
}

/** 把授权失效时间格式化为中文日期时间。 */
function formatExpirationDateTime(value: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
