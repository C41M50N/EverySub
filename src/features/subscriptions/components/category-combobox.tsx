import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import type { CategoryRecord } from '@/features/categories/queries';

export type CategoryOption = Pick<CategoryRecord, 'id' | 'name'>;

type CategoryComboboxProps = {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onCreate: (name: string) => void;
  categories: CategoryOption[];
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  creating?: boolean;
};

export function CategoryCombobox({
  value,
  onChange,
  onCreate,
  categories,
  id,
  disabled,
  invalid,
  creating,
}: CategoryComboboxProps) {
  const selectedName = useMemo(
    () => categories.find((category) => category.id === value)?.name ?? '',
    [categories, value],
  );

  const [query, setQuery] = useState(selectedName);
  const [synced, setSynced] = useState({ value, selectedName });

  // Keep the input text in sync with the selected category, adjusting during
  // render so the input never shows a stale name. When a freshly created
  // category isn't in the list yet, leave the typed text untouched.
  if (synced.value !== value || synced.selectedName !== selectedName) {
    setSynced({ value, selectedName });

    if (value === null) {
      setQuery('');
    } else if (selectedName) {
      setQuery(selectedName);
    }
  }

  const idByName = useMemo(() => {
    const map = new Map<string, string>();

    for (const category of categories) {
      map.set(category.name.toLowerCase(), category.id);
    }

    return map;
  }, [categories]);

  const options = useMemo(() => {
    const unique = new Set(categories.map((category) => category.name));

    if (selectedName) {
      unique.add(selectedName);
    }

    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [categories, selectedName]);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const filtered = useMemo(
    () =>
      options.filter((option) =>
        option.toLowerCase().includes(normalizedQuery),
      ),
    [options, normalizedQuery],
  );

  const hasExactMatch = options.some(
    (option) => option.toLowerCase() === normalizedQuery,
  );
  const showCreate = trimmedQuery.length > 0 && !hasExactMatch;
  const items = showCreate ? [...filtered, trimmedQuery] : filtered;

  function handleValueChange(next: string | null) {
    if (next === null) {
      onChange(null);
      return;
    }

    if (showCreate && next === trimmedQuery) {
      onCreate(trimmedQuery);
      return;
    }

    const matchedId = idByName.get(next.toLowerCase());

    if (matchedId) {
      onChange(matchedId);
    }
  }

  return (
    <Combobox
      items={items}
      value={selectedName || null}
      onValueChange={handleValueChange}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) {
          setQuery(selectedName);
        }
      }}
      filter={null}
      autoHighlight
      disabled={disabled || creating}
    >
      <ComboboxInput
        id={id}
        placeholder="e.g. Streaming"
        aria-invalid={invalid || undefined}
        disabled={disabled || creating}
      />
      <ComboboxContent>
        <ComboboxEmpty>No categories yet — type to add one.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => {
            const isCreate = showCreate && item === trimmedQuery;

            if (isCreate) {
              return (
                <ComboboxItem key="__create__" value={item}>
                  <PlusIcon />
                  Add “{item}” category
                </ComboboxItem>
              );
            }

            return (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
