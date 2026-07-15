/**
 * 本文件提供权限管理表单内部复用的 shadcn/Radix 选择字段。
 */
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

/** 权限管理选择字段的一条选项。 */
export type AccessSelectOption = {
  /** 提交给接口或本地状态的稳定值。 */
  value: string;
  /** 面向用户展示的中文文案。 */
  label: string;
};

/** 权限管理选择字段属性。 */
type AccessSelectFieldProps = {
  /** 表单控件唯一标识。 */
  id: string;
  /** 字段中文标签。 */
  label: string;
  /** 当前选中值。 */
  value: string;
  /** 下拉选项。 */
  options: readonly AccessSelectOption[];
  /** 选中值变更回调。 */
  onChange: (value: string) => void;
};

/** 渲染权限管理选择字段。 */
export function AccessSelectField({ id, label, value, options, onChange }: AccessSelectFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={!options.length}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="暂无可选数据" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
