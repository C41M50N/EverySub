import { useMemo, useState } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

type TimeZoneOption = { value: string; label: string };

function getOffsetLabel(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(at);

    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function toOption(timeZone: string, at: Date): TimeZoneOption {
  const offset = getOffsetLabel(timeZone, at);
  const name = timeZone.replaceAll('_', ' ');

  return { value: timeZone, label: offset ? `${name} (${offset})` : name };
}

function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

type TimeZoneComboboxProps = {
  id?: string;
  value: string;
  onChange: (timeZone: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

export function TimeZoneCombobox({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: TimeZoneComboboxProps) {
  // Offsets are labeled as of when the picker mounts.
  const [now] = useState(() => new Date());
  const options = useMemo(() => {
    const zones = listTimeZones();

    // The saved zone may be a valid alias the runtime doesn't list, like UTC.
    if (value && !zones.includes(value)) {
      zones.unshift(value);
    }

    return zones.map((zone) => toOption(zone, now));
  }, [value, now]);

  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option: TimeZoneOption | null) => {
        if (option) {
          onChange(option.value);
        }
      }}
      itemToStringLabel={(option: TimeZoneOption) => option.label}
      isItemEqualToValue={(a: TimeZoneOption, b: TimeZoneOption) =>
        a.value === b.value
      }
      autoHighlight
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder="Search time zones"
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>No matching time zones.</ComboboxEmpty>
        <ComboboxList>
          {(option: TimeZoneOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
