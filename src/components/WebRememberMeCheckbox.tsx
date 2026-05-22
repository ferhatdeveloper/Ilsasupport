interface WebRememberMeCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/** Web giriş formunda «Beni hatırla» */
export function WebRememberMeCheckbox({ checked, onChange, className = '' }: WebRememberMeCheckboxProps) {
  return (
    <label
      className={`flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-gray-400"
      />
      <span>Beni hatırla — sonraki ziyarette otomatik giriş</span>
    </label>
  );
}
