/**
 * 本文件提供权限管理表单内部复用的带标签文本输入字段。
 */
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';

/** 权限管理文本字段属性。 */
type AccessTextFieldProps = {
  /** 表单控件唯一标识。 */
  id: string;
  /** 字段中文标签。 */
  label: string;
  /** 当前输入值。 */
  value: string;
  /** 可选的中文占位说明。 */
  placeholder?: string;
  /** 输入变更回调。 */
  onChange: (value: string) => void;
};

/** 渲染带中文标签的权限管理文本输入框。 */
export function AccessTextField({ id, label, value, placeholder, onChange }: AccessTextFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}
